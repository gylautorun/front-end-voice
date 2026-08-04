import {RefObject, useEffect, useRef} from 'react';
import {AudioAnalysisFrame, AudioFrameReader} from '../shared/audio-frame';
import style from './style.module.scss';

/** 每次 Canvas 绘制回调可以读取的运行数据。 */
export interface CreativeCanvasFrame {
    /** 当前 Canvas 的 2D 绘图上下文。 */
    context: CanvasRenderingContext2D;
    /** 当前 Canvas 的 CSS 像素宽度。 */
    width: number;
    /** 当前 Canvas 的 CSS 像素高度。 */
    height: number;
    /** requestAnimationFrame 提供的连续毫秒时间。 */
    timestamp: number;
    /** 距离上一帧的秒数，最大限制为 0.05 秒。 */
    delta: number;
    /** 当前音频的频域、时域和分段能量快照。 */
    audio: AudioAnalysisFrame;
}

/** 创意音乐页面共用 Canvas 的属性。 */
interface AudioCanvasProps {
    /** 页面共享的实时分析节点。 */
    analyserRef: RefObject<AnalyserNode | null>;
    /** 无障碍阅读器使用的画布名称。 */
    label: string;
    /** 页面提供的逐帧绘制方法。 */
    onDraw: (frame: CreativeCanvasFrame) => void;
}

/**
 * 管理高 DPI 缓冲区、ResizeObserver、音频帧读取和动画释放。
 * 页面只实现 onDraw，不需要重复建立 requestAnimationFrame 生命周期。
 */
export const AudioCanvas = ({analyserRef, label, onDraw}: AudioCanvasProps) => {
    // 保存真实 Canvas 元素，effect 挂载后创建 2D 上下文。
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // 每次 React 渲染同步最新回调，不因为页面状态变化重启动画循环。
    const drawRef = useRef(onDraw);
    drawRef.current = onDraw;

    useEffect(() => {
        // 第一步：取得 Canvas 和 2D 上下文；不可用时不启动循环。
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return;

        // 第二步：创建独立音频读取器并初始化逻辑尺寸。
        const reader = new AudioFrameReader();
        let width = 1;
        let height = 1;
        let previousTimestamp = 0;
        let animationFrameId = 0;

        /** 根据元素实际尺寸同步高 DPI 绘图缓冲区。 */
        const resize = () => {
            const bounds = canvas.getBoundingClientRect();
            const ratio = Math.min(window.devicePixelRatio || 1, 2);
            width = Math.max(1, bounds.width);
            height = Math.max(1, bounds.height);
            canvas.width = Math.round(width * ratio);
            canvas.height = Math.round(height * ratio);
            // 绘制坐标继续使用 CSS 像素，页面算法不需要感知设备倍率。
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
        };

        // 第三步：观察 Canvas 自身尺寸，兼容侧栏和移动端布局变化。
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
        resize();

        /** 读取音频并把完整帧数据交给当前页面绘制。 */
        const draw = (timestamp: number) => {
            const delta = previousTimestamp
                ? Math.min(0.05, Math.max(0, (timestamp - previousTimestamp) / 1000))
                : 0;
            previousTimestamp = timestamp;
            drawRef.current({
                context,
                width,
                height,
                timestamp,
                delta,
                audio: reader.read(analyserRef.current),
            });
            animationFrameId = requestAnimationFrame(draw);
        };

        // 第四步：启动首帧，并在卸载时停止动画及尺寸观察。
        animationFrameId = requestAnimationFrame(draw);
        return () => {
            cancelAnimationFrame(animationFrameId);
            resizeObserver.disconnect();
        };
    }, [analyserRef]);

    return <canvas ref={canvasRef} className={style.canvas} aria-label={label} />;
};
