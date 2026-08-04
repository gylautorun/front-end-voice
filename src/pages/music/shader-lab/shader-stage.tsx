import {RefObject, useEffect, useRef} from 'react';
import * as THREE from 'three';
import {AudioFrameReader} from '../shared/audio-frame';
import style from './style.module.scss';

/** `kaleidoscope` 为极坐标万花筒，`fluid` 为多层流体色场。 */
export type ShaderMode = 'kaleidoscope' | 'fluid';

/** Shader 音乐舞台的受控属性。 */
interface ShaderStageProps {
    /** 页面共享的实时分析节点引用，音频尚未初始化时值为 null。 */
    analyserRef: RefObject<AnalyserNode | null>;
    /** Shader 时间 uniform 的推进倍率，1 表示设计默认速度。 */
    animationSpeed: number;
    /** 当前片段着色器效果，变化时重新创建 ShaderMaterial。 */
    mode: ShaderMode;
    /** 所有音频能量 uniform 的响应倍率。 */
    responseGain: number;
}

/** 顶点着色器：全屏四边形只需把原始顶点位置直接传给裁剪空间。 */
const vertexShader = `
    void main() {
        // PlaneGeometry 已覆盖 -1 到 1，无需模型、视图或投影矩阵变换。
        gl_Position = vec4(position, 1.0);
    }
`;

/**
 * 单个片段着色器内包含两个分支，切换模式时只更新 uniform。
 * 低、中、高频分别控制形变、色相与高光密度。
 */
const fragmentShader = `
    // 使用高精度浮点，减少大屏幕上时间和极坐标计算产生的色带。
    precision highp float;

    // WebGL 绘图缓冲区的真实像素尺寸，用于把 gl_FragCoord 转成居中坐标。
    uniform vec2 uResolution;
    // 指针在场景中的 0-1 坐标，只用于流体分支的扰动中心。
    uniform vec2 uPointer;
    // 已按用户动画倍率累计的连续秒数。
    uniform float uTime;
    // 低频能量，主要驱动尺度、脉冲和暖色高光。
    uniform float uBass;
    // 中频能量，主要驱动图案密度和流体反馈。
    uniform float uMid;
    // 高频能量，主要驱动分段数量、细节和冷色高光。
    uniform float uHigh;
    // 全频段整体能量，用于统一增强边缘。
    uniform float uOverall;
    // 模式编号：0 为万花筒，1 为流体色场。
    uniform float uMode;

    // GLSL ES 没有内置 PI 常量，这里提供完整圆周计算使用的数值。
    #define PI 3.14159265359

    // 根据输入标量生成随音频变化的周期调色板。
    vec3 palette(float value) {
        // a 是调色板中心颜色，决定整体基础亮度。
        vec3 a = vec3(0.42, 0.46, 0.49);
        // b 是余弦颜色振幅，决定每个通道可变化的范围。
        vec3 b = vec3(0.48, 0.42, 0.36);
        // c 控制三个颜色通道沿 value 变化的频率。
        vec3 c = vec3(1.0, 0.82, 0.64);
        // d 使用低、中、高频分别偏移 RGB 相位，让音乐改变整体色相。
        vec3 d = vec3(0.08 + uBass * 0.18, 0.31 + uMid * 0.12, 0.58 + uHigh * 0.15);
        // 通过余弦调色公式输出连续且循环的 RGB 颜色。
        return a + b * cos(6.28318 * (c * value + d));
    }

    // 绘制极坐标折叠形成的万花筒图案。
    vec3 drawKaleidoscope(vec2 uv) {
        // 当前像素到画面中心的距离。
        float radius = length(uv);
        // 当前像素围绕中心的极坐标角度。
        float angle = atan(uv.y, uv.x);
        // 高频能量把基础 8 个扇区最多增加到 12 个。
        float segments = 8.0 + floor(uHigh * 5.0);
        // 计算单个扇区对应的弧度。
        float sector = 2.0 * PI / segments;
        // 将任意角度镜像折叠进半个扇区，生成对称图案。
        angle = abs(mod(angle + sector * 0.5, sector) - sector * 0.5);

        // 把折叠后的极坐标还原为二维坐标。
        vec2 folded = vec2(cos(angle), sin(angle)) * radius;
        // 连续时间让折叠坐标轻微漂移，低频增加漂移幅度。
        folded += vec2(
            sin(uTime * 0.35 + radius * 4.0),
            cos(uTime * 0.28 - radius * 5.0)
        ) * (0.08 + uBass * 0.16);

        // 同心环随时间向外传播，中频增加环的空间密度，低频增加传播速度。
        float rings = sin(radius * (24.0 + uMid * 18.0) - uTime * (2.0 + uBass * 4.0));
        // 沿折叠 X 轴生成放射线，高频同时增加线条密度。
        float rays = sin(folded.x * (34.0 + uHigh * 24.0) + uTime * 1.4);
        // 斜向干涉项打破纯同心圆结构，增加局部变化。
        float interference = sin((folded.x + folded.y) * 18.0 - uTime * 1.1);
        // 按 46%/34%/20% 合并环、射线和干涉项。
        float pattern = rings * 0.46 + rays * 0.34 + interference * 0.2;
        // smoothstep 只提亮接近图案边界的位置，整体能量会扩大亮边范围。
        float edge = smoothstep(0.035, 0.0, abs(pattern) - 0.045 - uOverall * 0.08);
        // 图案值、半径和时间共同选择调色板位置。
        vec3 color = palette(pattern * 0.25 + radius * 0.55 + uTime * 0.025);
        // 基础亮度叠加边缘高光，高频进一步强化细线。
        color *= 0.32 + edge * (1.2 + uHigh * 1.5);
        // 在中心叠加随半径指数衰减的低频绿色光晕。
        color += vec3(0.12, 0.55, 0.48) * uBass * exp(-radius * 2.6);
        // 返回当前像素的万花筒线性 RGB 颜色。
        return color;
    }

    // 绘制多轮坐标反馈形成的流体色场。
    vec3 drawFluid(vec2 uv) {
        // 把 0-1 指针坐标移到以 0 为中心的偏移量，并限制扰动范围。
        vec2 pointerOffset = (uPointer - 0.5) * 0.35;
        // 低频轻微收缩坐标空间，指针偏移改变流体中心。
        vec2 point = uv * (1.3 - uBass * 0.12) - pointerOffset;
        // field 累计六层坐标反馈产生的标量场。
        float field = 0.0;

        // 固定六次循环可以被 WebGL 编译器展开，避免动态循环开销。
        for (int iteration = 0; iteration < 6; iteration++) {
            // 将整数循环序号转为 float，作为每层不同的相位和频率。
            float layer = float(iteration);
            // 当前点使用另一坐标轴的正弦/余弦反馈，形成旋涡式扭曲。
            point = vec2(
                point.x + sin(point.y * (2.1 + layer * 0.16) + uTime * (0.24 + layer * 0.025)),
                point.y + cos(point.x * (1.8 + layer * 0.19) - uTime * (0.2 + layer * 0.032))
            );
            // 每轮缩小坐标，中频能量会略微减缓收缩以扩大流体细节。
            point *= 0.72 + uMid * 0.025;
            // 把当前层正弦值加入 field，高层权重逐步减小以保持稳定。
            field += sin(point.x * 3.2 + point.y * 2.4 + layer + uTime * 0.35) / (1.0 + layer * 0.4);
        }

        // field 和中心距离生成等高线，高频增加等高线密度。
        float contour = sin(field * (3.2 + uHigh * 2.6) + length(uv) * 6.0);
        // 标量场和时间共同选择基础调色板颜色。
        vec3 color = palette(field * 0.1 + uTime * 0.018);
        // 使用等高线值调制明暗，保留 46% 最低亮度。
        color *= 0.46 + 0.54 * smoothstep(-0.8, 0.9, contour);
        // 正 field 区域叠加低频驱动的暖红色。
        color += vec3(0.94, 0.18, 0.39) * uBass * max(0.0, field) * 0.18;
        // 负 field 区域叠加高频驱动的亮蓝色。
        color += vec3(0.1, 0.72, 1.0) * uHigh * max(0.0, -field) * 0.2;
        // 返回当前像素的流体线性 RGB 颜色。
        return color;
    }

    // 片段着色器入口：为 Canvas 中的每一个像素计算最终颜色。
    void main() {
        // 把左下角起始的像素坐标转换为中心 0、短边范围约 -1 到 1 的坐标。
        vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) / min(uResolution.x, uResolution.y);
        // 根据 uMode 只执行当前选择的万花筒或流体分支。
        vec3 color = uMode < 0.5 ? drawKaleidoscope(uv) : drawFluid(uv);
        // 按像素到中心距离生成暗角，保持画面中心视觉焦点。
        float vignette = smoothstep(1.55, 0.25, length(uv));
        // 暗角外仍保留 42% 亮度，中心最高增加到 114%。
        color *= 0.42 + vignette * 0.72;
        // 进行轻微伽马提亮，并用 max 防止负值参与 pow 产生无效颜色。
        color = pow(max(color, 0.0), vec3(0.86));
        // 输出完全不透明的最终像素颜色。
        gl_FragColor = vec4(color, 1.0);
    }
`;

/**
 * 使用 ShaderMaterial 绘制随五段频率实时变化的全屏片段着色器。
 *
 * @param props.analyserRef 当前音轨的分析节点引用。
 * @param props.animationSpeed Shader 连续时间的推进倍率。
 * @param props.mode 当前万花筒或流体模式。
 * @param props.responseGain 音频能量写入 uniform 前的放大倍率。
 * @returns 包含 WebGL Canvas、频段仪表和 GLSL 标识的舞台。
 */
export const ShaderStage = ({
    analyserRef,
    animationSpeed,
    mode,
    responseGain,
}: ShaderStageProps) => {
    // Renderer 创建的 Canvas 会挂载到这个响应式容器。
    const hostRef = useRef<HTMLDivElement>(null);
    // 五段能量仪表通过 CSS 变量更新，不进入 React state。
    const energyRef = useRef<HTMLDivElement>(null);
    // 动画倍率存入 ref，让滑块变化即时生效且不重新创建 ShaderMaterial。
    const animationSpeedRef = useRef(animationSpeed);
    // 响应倍率存入 ref，从下一渲染帧开始作用于所有音频 uniform。
    const responseGainRef = useRef(responseGain);
    // React 每次渲染同步最新 props，累计时间和 WebGL 资源保持不变。
    animationSpeedRef.current = animationSpeed;
    responseGainRef.current = responseGain;

    // 分析节点引用或模式变化时重建 WebGL 生命周期；倍率变化不触发该 effect。
    useEffect(() => {
        // 第一步：取得舞台 DOM；尚未挂载时终止初始化。
        const host = hostRef.current;
        if (!host) return;

        // 第二步：Shader 由片段计算主导，关闭几何抗锯齿以减少额外开销。
        const renderer = new THREE.WebGLRenderer({antialias: false, powerPreference: 'high-performance'});
        // 像素倍率最高为 2，兼顾高 DPI 清晰度和片段着色器填充率。
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        // 固定不透明深色清屏色，初始化与释放阶段不会闪白。
        renderer.setClearColor('#030506', 1);
        // 把 Renderer 创建的 Canvas 直接挂载到全宽舞台。
        host.appendChild(renderer.domElement);

        // 第三步：创建只包含一个全屏四边形的最小场景。
        const scene = new THREE.Scene();
        // 正交相机覆盖 -1 到 1 的裁剪空间，不产生透视变形。
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        // uniforms 对象保存 JS 每帧写入、GLSL 每像素读取的共享数据。
        const uniforms = {
            // 初始化为 1x1，resize 会立即覆盖成真实绘图缓冲区尺寸。
            uResolution: {value: new THREE.Vector2(1, 1)},
            // 指针默认位于画面中心。
            uPointer: {value: new THREE.Vector2(0.5, 0.5)},
            // Shader 连续时间从 0 秒开始累计。
            uTime: {value: 0},
            // 四个能量 uniform 从静音值开始，通过平滑插值靠近真实音频。
            uBass: {value: 0},
            uMid: {value: 0},
            uHigh: {value: 0},
            uOverall: {value: 0},
            // 将字符串模式转换为 GLSL 更容易分支的数值。
            uMode: {value: mode === 'kaleidoscope' ? 0 : 1},
        };
        // 第四步：把顶点、片段着色器和 uniforms 组合成 ShaderMaterial。
        const material = new THREE.ShaderMaterial({vertexShader, fragmentShader, uniforms});
        // 2x2 平面正好覆盖整个正交裁剪空间。
        const geometry = new THREE.PlaneGeometry(2, 2);
        // 创建 Mesh 并加入场景；后续所有视觉变化都由片段着色器完成。
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        // 第五步：音频帧读取器复用 TypedArray，Clock 提供秒单位的真实帧间隔。
        const reader = new AudioFrameReader();
        const clock = new THREE.Clock();
        // 保存 requestAnimationFrame id，effect 清理时停止循环。
        let animationFrameId = 0;
        // 累计已按用户倍率缩放的视觉时间，调速时不重置相位。
        let visualElapsed = 0;

        /** 同步 WebGL 缓冲区和 uResolution，保证坐标换算使用相同单位。 */
        const resize = () => {
            // 以容器 CSS 尺寸调整 Renderer，至少保留 1x1 有效缓冲区。
            renderer.setSize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight), false);
            // 使用 Canvas 内部真实像素尺寸，其中已经包含 devicePixelRatio。
            uniforms.uResolution.value.set(renderer.domElement.width, renderer.domElement.height);
        };

        /**
         * 将指针位置标准化为 0-1，交给流体模式作为扰动中心。
         *
         * @param event 舞台容器收到的 PointerEvent。
         */
        const handlePointerMove = (event: PointerEvent) => {
            // 读取舞台相对视口的坐标和尺寸。
            const bounds = host.getBoundingClientRect();
            // X 从左到右映射为 0-1；Y 反转为从下到上 0-1，匹配 WebGL 坐标方向。
            uniforms.uPointer.value.set(
                (event.clientX - bounds.left) / Math.max(1, bounds.width),
                1 - (event.clientY - bounds.top) / Math.max(1, bounds.height),
            );
        };

        // 第六步：监听容器尺寸变化和指针移动。
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        host.addEventListener('pointermove', handlePointerMove);
        // ResizeObserver 异步触发，挂载后先主动初始化一次尺寸。
        resize();

        /** 按“音频 -> 时间 -> uniform -> 仪表 -> WebGL”的顺序绘制一帧。 */
        const render = () => {
            // 第七步：从当前分析节点读取音频；节点为空时 reader 返回静音帧。
            const frame = reader.read(analyserRef.current);
            // 每帧向目标值移动 16%，降低频谱采样导致的颜色与形状抖动。
            const smoothing = 0.16;
            // 帧间隔最多计 50ms，再乘用户速度倍率后累加到连续时间。
            visualElapsed += Math.min(clock.getDelta(), 0.05) * animationSpeedRef.current;
            // 把连续时间写入 uTime，所有 GLSL 运动都由它派生。
            uniforms.uTime.value = visualElapsed;
            // 读取最新响应倍率，Slider 变化无需重建渲染器。
            const gain = responseGainRef.current;
            // 分别放大低、中、高和整体能量，并限制在 0-1。
            const bass = Math.min(1, frame.energy.bass * gain);
            const mid = Math.min(1, frame.energy.mid * gain);
            const high = Math.min(1, frame.energy.high * gain);
            const overall = Math.min(1, frame.energy.overall * gain);
            // 第八步：四个能量 uniform 平滑靠近本帧目标值。
            uniforms.uBass.value += (bass - uniforms.uBass.value) * smoothing;
            uniforms.uMid.value += (mid - uniforms.uMid.value) * smoothing;
            uniforms.uHigh.value += (high - uniforms.uHigh.value) * smoothing;
            uniforms.uOverall.value += (overall - uniforms.uOverall.value) * smoothing;

            // 第九步：更新五段仪表 CSS 变量，静音时保留 5% 最小可见宽度。
            energyRef.current?.style.setProperty('--sub', `${Math.max(5, Math.min(1, frame.energy.sub * gain) * 100)}%`);
            energyRef.current?.style.setProperty('--bass', `${Math.max(5, bass * 100)}%`);
            energyRef.current?.style.setProperty('--mid', `${Math.max(5, mid * 100)}%`);
            energyRef.current?.style.setProperty('--high', `${Math.max(5, high * 100)}%`);
            energyRef.current?.style.setProperty('--air', `${Math.max(5, Math.min(1, frame.energy.air * gain) * 100)}%`);

            // 第十步：绘制全屏四边形，片段着色器为每个像素计算颜色。
            renderer.render(scene, camera);
            // 当前帧完成后登记下一帧，形成连续动画循环。
            animationFrameId = requestAnimationFrame(render);
        };

        // 启动第一帧 Shader 动画。
        animationFrameId = requestAnimationFrame(render);
        // effect 清理函数在组件卸载或 mode/analyserRef 变化时执行。
        return () => {
            // 先停止动画，避免继续访问待释放的 uniforms 和 Renderer。
            cancelAnimationFrame(animationFrameId);
            // 断开 DOM 尺寸和指针监听。
            resizeObserver.disconnect();
            host.removeEventListener('pointermove', handlePointerMove);
            // 释放全屏平面几何体和 ShaderMaterial 的 GPU 资源。
            geometry.dispose();
            material.dispose();
            // 释放 Renderer 内部缓存并主动归还 WebGL 上下文配额。
            renderer.dispose();
            renderer.forceContextLoss();
            // 最后从 DOM 移除 Renderer 创建的 Canvas。
            renderer.domElement.remove();
        };
    }, [analyserRef, mode]);

    return (
        // hostRef 是 Canvas 挂载点，也为频段仪表和 GLSL 标识提供定位上下文。
        <div ref={hostRef} className={style.shaderStage} aria-label="GLSL 音频响应着色器">
            {/* 五段频率标签仅为视觉仪表，宽度由逐帧 CSS 变量驱动。 */}
            <div ref={energyRef} className={style.frequencyScale} aria-hidden="true">
                <span><b>次低频</b><i /></span>
                <span><b>低频</b><i /></span>
                <span><b>中频</b><i /></span>
                <span><b>高频</b><i /></span>
                <span><b>空气感</b><i /></span>
            </div>
            {/* 标识当前效果由 GLSL 片段着色器和音频 uniform 驱动。 */}
            <div className={style.glslBadge}>GLSL / AUDIO UNIFORMS</div>
        </div>
    );
};
