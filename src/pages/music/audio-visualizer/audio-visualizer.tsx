import {RefObject, useEffect, useRef} from 'react';
import {drawBars} from './visualizers/draw-bars';
import {drawMirrorSpectrum} from './visualizers/draw-mirror-spectrum';
import {drawOrb} from './visualizers/draw-orb';
import {
    AudioFrame,
    BarsState,
    CanvasScene,
    MirrorState,
    OrbState,
    VISUALIZATION_MODE_ARIA_LABELS,
    VisualizationMode,
} from './visualizers/types';

/** 供页面模式控件复用的可视化模式类型。 */
export type {VisualizationMode} from './visualizers/types';

/** Canvas 可视化组件的运行参数。 */
interface AudioVisualizerProps {
    /** 指向 Web Audio 分析节点，每帧直接从 current 读取数据。 */
    analyserRef: RefObject<AnalyserNode | null>;
    /** 控制是否按低频能量生成水滴粒子。 */
    isPlaying: boolean;
    /** 当前使用频谱柱、镜像波形或球形水滴波纹。 */
    mode: VisualizationMode;
    /** 用户设定的视觉幅度倍率。 */
    sensitivity: number;
}

/** 持有 Canvas、分析数据和 requestAnimationFrame 生命周期的 React 组件。 */
export const AudioVisualizer = ({
    analyserRef,
    isPlaying,
    mode,
    sensitivity,
}: AudioVisualizerProps) => {
    // 指向实际绘制表面。
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // 普通频谱柱跨帧只保存峰值高度。
    const barsStateRef = useRef<BarsState>({peaks: []});
    // 镜像窄柱跨帧保存缓动高度，防止频谱快速闪烁。
    const mirrorStateRef = useRef<MirrorState>({levels: []});
    // 球形模式集中保存粒子和上一次粒子生成时间。
    const orbStateRef = useRef<OrbState>({droplets: [], lastDropTime: 0});

    // 模式、灵敏度或播放状态改变时重建绘制循环。
    useEffect(() => {
        // 取得挂载后的 Canvas DOM。
        const canvas = canvasRef.current;
        // Canvas 尚未存在时不创建动画。
        if (!canvas) return;

        // 获取 2D 绘图上下文。
        const context = canvas.getContext('2d');
        // 浏览器不支持 2D Canvas 时安全结束。
        if (!context) return;

        // 保存下一帧 ID，卸载时用于取消动画。
        let animationFrameId = 0;
        // 当前 Canvas CSS 宽高，ResizeObserver 回调会持续更新。
        let width = 1;
        let height = 1;
        // 缓存频域和时域数组，仅在 FFT 尺寸变化时重建。
        let frequencyData = new Uint8Array(0);
        let timeData = new Uint8Array(0);

        /** 同步 Canvas CSS 尺寸和高 DPI 物理像素尺寸。 */
        const resizeCanvas = () => {
            // 读取布局计算后的 CSS 尺寸。
            const bounds = canvas.getBoundingClientRect();
            // 最多使用 2 倍像素比，兼顾清晰度和每帧绘制成本。
            const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
            // 宽高至少为 1，避免隐藏阶段出现零尺寸数学问题。
            width = Math.max(1, bounds.width);
            height = Math.max(1, bounds.height);
            // 将 CSS 尺寸乘以像素比得到实际缓冲区宽高。
            const renderWidth = Math.round(width * pixelRatio);
            const renderHeight = Math.round(height * pixelRatio);
            // 只在物理尺寸改变时重置 Canvas，避免每帧清空状态。
            if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
                canvas.width = renderWidth;
                canvas.height = renderHeight;
            }
            // 将后续绘制单位恢复为 CSS 像素，内部自动适配高 DPI。
            context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        };

        // 监听 Canvas 布局尺寸，侧边栏或视窗变化时自动重算缓冲区。
        const resizeObserver = new ResizeObserver(resizeCanvas);
        resizeObserver.observe(canvas);
        // 首帧之前主动执行一次，不等待 ResizeObserver 回调。
        resizeCanvas();

        /** 读取 AnalyserNode 并组装所有绘制器共用的音频帧对象。 */
        const readAudioFrame = (timestamp: number): AudioFrame => {
            // 每帧读取最新节点，兼容用户开始播放后才创建音频图。
            const analyser = analyserRef.current;
            // 节点创建或 FFT 大小改变时一次性重建复用数组。
            if (analyser && frequencyData.length !== analyser.frequencyBinCount) {
                frequencyData = new Uint8Array(analyser.frequencyBinCount);
                timeData = new Uint8Array(analyser.frequencyBinCount);
            }
            // 节点就绪后将最新频域和时域数据写入复用数组。
            if (analyser) {
                analyser.getByteFrequencyData(frequencyData);
                analyser.getByteTimeDomainData(timeData);
            }
            // 使用对象传参，绘制器不再依赖七到十二个位置参数的顺序。
            return {
                frequencyData,
                fftSize: analyser?.fftSize || 8192,
                isPlaying,
                sampleRate: analyser?.context.sampleRate || 44100,
                sensitivity,
                timeData,
                timestamp,
            };
        };

        /** 每个浏览器刷新帧读取音频数据并完整重绘 Canvas。 */
        const draw = (timestamp: number) => {
            // 所有绘制器共享同一个 Canvas 场景对象。
            const scene: CanvasScene = {context, height, width};
            // 所有绘制器共享同一个音频数据对象。
            const frame = readAudioFrame(timestamp);

            // 清空上一帧的全部像素并设置视觉舞台背景。
            context.clearRect(0, 0, width, height);
            context.fillStyle = '#101513';
            context.fillRect(0, 0, width, height);

            // 组件只负责模式调度，具体算法由独立绘制器维护。
            if (mode === 'bars') {
                drawBars(scene, frame, barsStateRef.current);
            } else if (mode === 'mirror') {
                drawMirrorSpectrum(scene, frame, mirrorStateRef.current);
            } else {
                drawOrb(scene, frame, orbStateRef.current);
            }

            // 预约下一个屏幕刷新帧。
            animationFrameId = requestAnimationFrame(draw);
        };

        // 启动首个动画帧。
        animationFrameId = requestAnimationFrame(draw);
        // effect 重建或组件卸载时停止旧绘制循环与尺寸监听。
        return () => {
            cancelAnimationFrame(animationFrameId);
            resizeObserver.disconnect();
        };
    }, [analyserRef, isPlaying, mode, sensitivity]);

    return (
        // Canvas 仅承载图形，模式映射为辅助技术提供准确语义。
        <canvas
            ref={canvasRef}
            aria-label={VISUALIZATION_MODE_ARIA_LABELS[mode]}
        />
    );
};
