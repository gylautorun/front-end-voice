import {RefObject, useEffect, useRef} from 'react';
import * as THREE from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {AudioFrameReader} from '../shared/audio-frame';
import {createAudioScene, disposeObjectTree, ThreeSceneMode} from './scene-builders';
import style from './style.module.scss';

/** Three.js 音频场景的受控属性。 */
interface ThreeAudioSceneProps {
    /** 页面音轨对应的实时分析节点引用，节点尚未创建时值为 null。 */
    analyserRef: RefObject<AnalyserNode | null>;
    /** 场景时间和位移的速度倍率，1 表示设计默认速度。 */
    animationSpeed: number;
    /** 当前粒子或 3D 场景类型，变化时重建对应 GPU 场景包。 */
    mode: ThreeSceneMode;
    /** 音频能量驱动几何体、灯光和 Bloom 的倍率。 */
    responseGain: number;
}

/**
 * 原生 Three.js + UnrealBloom 音频可视化舞台。
 *
 * @param props.analyserRef 当前音轨的分析节点引用。
 * @param props.animationSpeed 用户设置的运动速度倍率。
 * @param props.mode 当前 3D 场景模式。
 * @param props.responseGain 用户设置的音频响应倍率。
 * @returns 包含 WebGL Canvas、能量仪表和 Bloom 状态的场景容器。
 */
export const ThreeAudioScene = ({
    analyserRef,
    animationSpeed,
    mode,
    responseGain,
}: ThreeAudioSceneProps) => {
    // WebGLRenderer 创建的 Canvas 会直接挂载到这个全宽 DOM 容器。
    const hostRef = useRef<HTMLDivElement>(null);
    // 能量仪表通过 CSS 变量更新，避免使用 React state 触发逐帧重渲染。
    const energyRef = useRef<HTMLDivElement>(null);
    // 动画速度存入 ref，拖动滑块时不重建 WebGLRenderer 和 GPU 资源。
    const animationSpeedRef = useRef(animationSpeed);
    // 响应倍率同样存入 ref，从滑块变化后的下一帧开始生效。
    const responseGainRef = useRef(responseGain);
    // React 每次渲染同步最新参数，但不会让下面的 effect 重新执行。
    animationSpeedRef.current = animationSpeed;
    responseGainRef.current = responseGain;

    // 分析节点引用或模式变化时创建一套新场景；倍率变化只更新 ref。
    useEffect(() => {
        // 第一步：取得挂载节点；组件尚未挂载时终止初始化。
        const host = hostRef.current;
        if (!host) return;

        // 第二步：创建 WebGLRenderer；抗锯齿改善线框和粒子边缘。
        const renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: 'high-performance'});
        // 像素倍率最多为 2，兼顾高 DPI 清晰度与后处理性能。
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        // 使用接近黑色的固定清屏色，避免透明 Canvas 暴露页面背景。
        renderer.setClearColor('#030607', 1);
        // 输出使用 sRGB，保证 CSS 配色和 Three.js 材质颜色接近。
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        // ACES 色调映射压缩 Bloom 高亮，防止发光区域直接变白。
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;
        // Renderer 创建的 Canvas 直接加入舞台容器。
        host.appendChild(renderer.domElement);

        // 第三步：创建主场景，并按隧道/普通模式设置不同雾密度。
        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2('#030708', mode === 'tunnel' ? 0.025 : 0.055);
        // 创建透视相机，初始 aspect 会在 resize 中用真实尺寸覆盖。
        const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 120);
        // 地形需要更高视点，隧道需要更靠前的镜头，其他模式保持正面观察。
        camera.position.set(0, mode === 'terrain' ? 4.3 : 0.2, mode === 'tunnel' ? 8 : 10.5);
        // 相机目标点与模式构图一致，确保主体位于首屏中心。
        camera.lookAt(0, mode === 'terrain' ? -0.8 : 0, mode === 'tunnel' ? -8 : 0);

        // 第四步：环境光提供基础亮度，左右点光分别由低频和高频驱动。
        const ambient = new THREE.AmbientLight('#93bdb2', 0.5);
        const bassLight = new THREE.PointLight('#ef476f', 5, 22);
        // 低频粉色光源放在左上方。
        bassLight.position.set(-4, 2.5, 4);
        const highLight = new THREE.PointLight('#35d6ff', 5, 22);
        // 高频青色光源放在右下方，形成明确双色层次。
        highLight.position.set(4, -2, 3);
        // 一次把全部灯光加入场景。
        scene.add(ambient, bassLight, highLight);

        // 第五步：根据当前 mode 创建具体物体，并加入主场景。
        const bundle = createAudioScene(mode);
        scene.add(bundle.group);

        // 第六步：创建后处理合成器，先执行普通场景渲染。
        const composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        // 再添加 Bloom；参数依次控制强度、半径和阈值。
        const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.35, 0.72, 0.08);
        composer.addPass(bloom);

        // 第七步：创建音频帧读取器和高精度帧间隔时钟。
        const reader = new AudioFrameReader();
        const clock = new THREE.Clock();
        // 保存下一帧请求 id，清理时取消持续循环。
        let animationFrameId = 0;
        // 指针位置归一化为 -1 到 1，供场景轻微视差使用。
        let pointerX = 0;
        let pointerY = 0;
        // 累计已乘动画倍率的视觉秒数，调速时不重置已有相位。
        let visualElapsed = 0;

        /** 同步 Renderer、后处理缓冲区和相机宽高比。 */
        const resize = () => {
            // 容器初始化阶段至少使用 1x1，避免创建无效 WebGL RenderTarget。
            const width = Math.max(1, host.clientWidth);
            const height = Math.max(1, host.clientHeight);
            // false 表示不让 Renderer 写入 Canvas 内联 CSS 尺寸，只调整绘图缓冲区。
            renderer.setSize(width, height, false);
            // Bloom 合成器的 RenderTarget 必须与 Renderer 同步尺寸。
            composer.setSize(width, height);
            // 更新透视相机宽高比后重新计算投影矩阵。
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        };

        /**
         * 把指针坐标转换为 -1 到 1，只用于轻量视差。
         *
         * @param event 场景容器收到的 PointerEvent。
         */
        const handlePointerMove = (event: PointerEvent) => {
            // 读取容器相对视口的位置和尺寸。
            const bounds = host.getBoundingClientRect();
            // 水平方向左侧为 -1、中心为 0、右侧为 1。
            pointerX = (event.clientX - bounds.left) / Math.max(1, bounds.width) * 2 - 1;
            // 垂直方向顶部为 -1、中心为 0、底部为 1。
            pointerY = (event.clientY - bounds.top) / Math.max(1, bounds.height) * 2 - 1;
        };

        // 第八步：监听实际容器尺寸和指针位置。
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        host.addEventListener('pointermove', handlePointerMove);
        // ResizeObserver 异步触发，先主动完成首帧尺寸初始化。
        resize();

        /** 按“时间 -> 音频 -> 场景 -> 灯光 -> 仪表 -> 合成”的顺序绘制一帧。 */
        const render = () => {
            // 第九步：取得真实帧间隔，限制为 50ms 后乘用户速度倍率。
            const delta = Math.min(clock.getDelta(), 0.05) * animationSpeedRef.current;
            // 把缩放后的 delta 累加到连续时间，调速只改变后续推进速度。
            visualElapsed += delta;
            // 从当前分析节点读取时域、频域及七段能量；节点为空时返回静音帧。
            const frame = reader.read(analyserRef.current);
            // 读取最新音频响应倍率，保证 Slider 调整下一帧即时生效。
            const gain = responseGainRef.current;
            // reader 每帧返回新的 energy 对象，因此可以就地缩放而不污染后续帧。
            frame.energy.sub = Math.min(1, frame.energy.sub * gain);
            frame.energy.bass = Math.min(1, frame.energy.bass * gain);
            frame.energy.lowMid = Math.min(1, frame.energy.lowMid * gain);
            frame.energy.mid = Math.min(1, frame.energy.mid * gain);
            frame.energy.high = Math.min(1, frame.energy.high * gain);
            frame.energy.air = Math.min(1, frame.energy.air * gain);
            frame.energy.overall = Math.min(1, frame.energy.overall * gain);
            // 把处理后的音频帧、连续时间和帧间隔交给当前模式更新几何体。
            bundle.update(frame, visualElapsed, delta, gain);

            // 第十步：Group 以 0.018 缓动系数靠近指针目标旋转，避免瞬移和眩晕。
            bundle.group.rotation.y += (pointerX * 0.11 - bundle.group.rotation.y) * 0.018;
            bundle.group.rotation.x += (-pointerY * 0.07 - bundle.group.rotation.x) * 0.018;
            // 低频驱动左侧粉色灯，高频驱动右侧青色灯。
            bassLight.intensity = 2.5 + frame.energy.bass * 18;
            highLight.intensity = 2 + frame.energy.high * 20;
            // 整体能量控制 Bloom 强度，静音时仍保留 0.85 基础辉光。
            bloom.strength = 0.85 + frame.energy.overall * 2.8;

            // 第十一步：通过 CSS 变量更新固定能量仪表，不触发 React 每帧渲染。
            energyRef.current?.style.setProperty('--bass', `${Math.max(4, frame.energy.bass * 100)}%`);
            energyRef.current?.style.setProperty('--mid', `${Math.max(4, frame.energy.mid * 100)}%`);
            energyRef.current?.style.setProperty('--high', `${Math.max(4, frame.energy.high * 100)}%`);

            // 第十二步：由 Composer 执行普通渲染和 Bloom 后处理。
            composer.render();
            // 当前帧完成后登记下一帧，形成持续动画循环。
            animationFrameId = requestAnimationFrame(render);
        };

        // 启动 WebGL 动画循环。
        animationFrameId = requestAnimationFrame(render);
        // effect 清理函数在路由卸载或 mode/analyserRef 变化时执行。
        return () => {
            // 先停止动画，防止继续访问正在释放的 GPU 资源。
            cancelAnimationFrame(animationFrameId);
            // 断开 DOM 监听器和指针事件。
            resizeObserver.disconnect();
            host.removeEventListener('pointermove', handlePointerMove);
            // 释放当前模式全部几何体和材质。
            disposeObjectTree(bundle.group);
            // 释放后处理 RenderTarget 和 Renderer 内部资源。
            composer.dispose();
            renderer.dispose();
            // 主动丢失 WebGL 上下文，及时归还浏览器 GPU 配额。
            renderer.forceContextLoss();
            // 最后把 Renderer 创建的 Canvas 从容器移除。
            renderer.domElement.remove();
        };
    }, [analyserRef, mode]);

    return (
        // hostRef 既是 Canvas 挂载点，也是能量仪表和状态徽标的定位容器。
        <div ref={hostRef} className={style.scene} aria-label="Three.js 音频响应三维场景">
            {/* 仪表本身不参与无障碍阅读，其高度由逐帧 CSS 变量控制。 */}
            <div ref={energyRef} className={style.energyMeter} aria-hidden="true">
                <span><i />低频</span>
                <span><i />中频</span>
                <span><i />高频</span>
            </div>
            {/* 明确提示当前场景启用了 UnrealBloomPass。 */}
            <div className={style.bloomBadge}>BLOOM ON</div>
        </div>
    );
};
