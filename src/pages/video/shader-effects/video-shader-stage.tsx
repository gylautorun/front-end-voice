import {RefObject, useEffect, useRef} from 'react';
import * as THREE from 'three';
import style from './style.module.scss';

/** 视频 Shader 支持的五种片段效果。 */
export type VideoShaderMode = 'water' | 'distortion' | 'liquid' | 'chromatic' | 'ripple';

/** WebGL 视频舞台参数。 */
interface VideoShaderStageProps {
    /** 被上传为 VideoTexture 的共享视频元素。 */
    videoRef: RefObject<HTMLVideoElement>;
    /** 当前 GLSL 效果。 */
    mode: VideoShaderMode;
    /** UV 形变强度。 */
    intensity: number;
    /** Shader 时间推进速度。 */
    speed: number;
}

/** 全屏平面顶点着色器，只把 UV 传给片段阶段。 */
const vertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
    }
`;

/** 五种视频效果共用的片段着色器。 */
const fragmentShader = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uVideo;
    uniform vec2 uResolution;
    uniform vec2 uVideoResolution;
    uniform vec2 uPointer;
    uniform float uTime;
    uniform float uIntensity;
    uniform float uMode;

    // 把视频 UV 转成 object-fit: cover，避免不同宽高比的视频被拉伸。
    vec2 coverUv(vec2 uv) {
        float canvasAspect = uResolution.x / max(1.0, uResolution.y);
        float videoAspect = uVideoResolution.x / max(1.0, uVideoResolution.y);
        vec2 centered = uv - 0.5;
        if (canvasAspect > videoAspect) {
            centered.y *= videoAspect / canvasAspect;
        } else {
            centered.x *= canvasAspect / videoAspect;
        }
        return centered + 0.5;
    }

    // 无纹理依赖的二维随机值，用于液化噪声。
    float random(vec2 point) {
        return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
    }

    // 对四个网格随机值做平滑插值，生成连续 Value Noise。
    float noise(vec2 point) {
        vec2 cell = floor(point);
        vec2 local = fract(point);
        local = local * local * (3.0 - 2.0 * local);
        return mix(
            mix(random(cell), random(cell + vec2(1.0, 0.0)), local.x),
            mix(random(cell + vec2(0.0, 1.0)), random(cell + vec2(1.0, 1.0)), local.x),
            local.y
        );
    }

    void main() {
        vec2 uv = coverUv(vUv);
        vec2 pointer = coverUv(uPointer);
        float amount = uIntensity;

        // 0：两组正弦波分别扰动 X/Y，形成连续水面折射。
        if (uMode < 0.5) {
            uv.x += sin(uv.y * 34.0 + uTime * 2.2) * 0.008 * amount;
            uv.y += sin(uv.x * 27.0 - uTime * 1.7) * 0.012 * amount;
        }
        // 1：离中心越近旋转越强，形成镜头旋拧式扭曲。
        else if (uMode < 1.5) {
            vec2 delta = uv - 0.5;
            float radius = length(delta);
            float angle = atan(delta.y, delta.x) + (1.0 - smoothstep(0.0, 0.72, radius)) * amount * 1.1;
            uv = 0.5 + vec2(cos(angle), sin(angle)) * radius;
        }
        // 2：两层移动噪声产生非均匀液化位移。
        else if (uMode < 2.5) {
            float fieldA = noise(uv * 5.0 + vec2(uTime * 0.22, -uTime * 0.16));
            float fieldB = noise(uv.yx * 8.0 + vec2(-uTime * 0.13, uTime * 0.19));
            uv += (vec2(fieldA, fieldB) - 0.5) * 0.105 * amount;
        }
        // 4：指针为波源，指数衰减的正弦位移形成扩散波纹。
        else if (uMode > 3.5) {
            vec2 delta = uv - pointer;
            float radius = max(0.001, length(delta));
            float wave = sin(radius * 58.0 - uTime * 5.4) * exp(-radius * 3.2);
            uv += normalize(delta) * wave * 0.018 * amount;
        }

        uv = clamp(uv, 0.001, 0.999);
        // 3：RGB 分别从不同 UV 取样，其他模式也保留轻微动态色散。
        if (uMode > 2.5 && uMode < 3.5) {
            vec2 direction = normalize(uv - 0.5 + vec2(0.001));
            float offset = (0.008 + sin(uTime * 2.0) * 0.003) * amount;
            float red = texture2D(uVideo, clamp(uv + direction * offset, 0.001, 0.999)).r;
            float green = texture2D(uVideo, uv).g;
            float blue = texture2D(uVideo, clamp(uv - direction * offset, 0.001, 0.999)).b;
            gl_FragColor = vec4(red, green, blue, 1.0);
        } else {
            vec3 color = texture2D(uVideo, uv).rgb;
            gl_FragColor = vec4(color, 1.0);
        }
    }
`;

/** 把字符串模式转换成 GLSL 数值分支。 */
const MODE_INDEX: Record<VideoShaderMode, number> = {
    water: 0,
    distortion: 1,
    liquid: 2,
    chromatic: 3,
    ripple: 4,
};

/** 使用 Three.js VideoTexture 驱动全屏 GLSL 视频特效。 */
export const VideoShaderStage = ({intensity, mode, speed, videoRef}: VideoShaderStageProps) => {
    const hostRef = useRef<HTMLDivElement>(null);
    // 控制值放入 ref，拖动 Slider 和切换模式都不重建 WebGL 上下文。
    const settingsRef = useRef({intensity, mode, speed});
    settingsRef.current = {intensity, mode, speed};

    useEffect(() => {
        const host = hostRef.current;
        const video = videoRef.current;
        if (!host || !video) return;

        // 第一步：创建高性能 Renderer 和覆盖裁剪空间的正交场景。
        const renderer = new THREE.WebGLRenderer({antialias: false, powerPreference: 'high-performance'});
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor('#020405', 1);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        host.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // 第二步：同一个 VideoTexture 持续读取 video 当前帧，无需 Canvas 中转。
        const videoTexture = new THREE.VideoTexture(video);
        videoTexture.colorSpace = THREE.SRGBColorSpace;
        videoTexture.minFilter = THREE.LinearFilter;
        videoTexture.magFilter = THREE.LinearFilter;
        const uniforms = {
            uVideo: {value: videoTexture},
            uResolution: {value: new THREE.Vector2(1, 1)},
            uVideoResolution: {value: new THREE.Vector2(960, 540)},
            uPointer: {value: new THREE.Vector2(0.5, 0.5)},
            uTime: {value: 0},
            uIntensity: {value: settingsRef.current.intensity},
            uMode: {value: MODE_INDEX[settingsRef.current.mode]},
        };
        const material = new THREE.ShaderMaterial({vertexShader, fragmentShader, uniforms});
        const geometry = new THREE.PlaneGeometry(2, 2);
        scene.add(new THREE.Mesh(geometry, material));

        let animationFrameId = 0;
        let previousTimestamp = 0;
        let elapsed = 0;

        /** 同步 Renderer 和片段着色器使用的真实缓冲区尺寸。 */
        const resize = () => {
            renderer.setSize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight), false);
            uniforms.uResolution.value.set(renderer.domElement.width, renderer.domElement.height);
        };

        /** 指针位置作为波纹扩散中心。 */
        const handlePointerMove = (event: PointerEvent) => {
            const bounds = host.getBoundingClientRect();
            uniforms.uPointer.value.set(
                (event.clientX - bounds.left) / Math.max(1, bounds.width),
                1 - (event.clientY - bounds.top) / Math.max(1, bounds.height),
            );
        };

        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        host.addEventListener('pointermove', handlePointerMove);
        resize();

        /** 每帧同步控制参数、视频尺寸和连续时间后提交 WebGL 绘制。 */
        const render = (timestamp: number) => {
            const delta = previousTimestamp ? Math.min(0.05, (timestamp - previousTimestamp) / 1000) : 0;
            previousTimestamp = timestamp;
            elapsed += delta * settingsRef.current.speed;
            uniforms.uTime.value = elapsed;
            uniforms.uIntensity.value = settingsRef.current.intensity;
            uniforms.uMode.value = MODE_INDEX[settingsRef.current.mode];
            if (video.videoWidth && video.videoHeight) {
                uniforms.uVideoResolution.value.set(video.videoWidth, video.videoHeight);
            }
            renderer.render(scene, camera);
            animationFrameId = requestAnimationFrame(render);
        };
        animationFrameId = requestAnimationFrame(render);

        return () => {
            cancelAnimationFrame(animationFrameId);
            resizeObserver.disconnect();
            host.removeEventListener('pointermove', handlePointerMove);
            geometry.dispose();
            material.dispose();
            videoTexture.dispose();
            renderer.dispose();
            renderer.forceContextLoss();
            renderer.domElement.remove();
        };
    }, [videoRef]);

    return <div ref={hostRef} className={style.stage} aria-label="WebGL 视频片段着色器效果" />;
};
