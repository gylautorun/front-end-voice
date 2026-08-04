import {RefObject, useEffect, useRef} from 'react';
import {AudioFrameReader} from '../shared/audio-frame';
import style from './style.module.scss';

/** 全屏氛围背景参数。 */
interface AmbientCanvasProps {
    /** 页面共享的音频分析节点。 */
    analyserRef: RefObject<AnalyserNode | null>;
}

/** 绘制宽幅色场和多层波线，低频控制亮度、中高频控制波形细节。 */
export const AmbientCanvas = ({analyserRef}: AmbientCanvasProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return;

        const reader = new AudioFrameReader();
        let width = 1;
        let height = 1;
        let animationFrameId = 0;

        /** 按设备像素比同步 Canvas 缓冲区。 */
        const resize = () => {
            const bounds = canvas.getBoundingClientRect();
            const ratio = Math.min(window.devicePixelRatio || 1, 2);
            width = Math.max(1, bounds.width);
            height = Math.max(1, bounds.height);
            canvas.width = Math.round(width * ratio);
            canvas.height = Math.round(height * ratio);
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
        };

        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
        resize();

        /** 绘制一层跨越整个舞台的平滑波线。 */
        const drawWave = (
            data: Uint8Array,
            centerY: number,
            amplitude: number,
            color: string,
            lineWidth: number,
            phase: number,
        ) => {
            context.beginPath();
            context.strokeStyle = color;
            context.lineWidth = lineWidth;
            const pointCount = Math.min(data.length, 360);

            for (let index = 0; index < pointCount; index += 1) {
                const dataIndex = Math.floor(index / Math.max(1, pointCount - 1) * (data.length - 1));
                const normalized = (data[dataIndex] - 128) / 128;
                const x = index / Math.max(1, pointCount - 1) * width;
                const y = centerY + normalized * amplitude + Math.sin(index * 0.035 + phase) * 5;
                if (index === 0) context.moveTo(x, y);
                else context.lineTo(x, y);
            }
            context.stroke();
        };

        /** 每帧读取音频并重绘背景。 */
        const draw = (timestamp: number) => {
            const frame = reader.read(analyserRef.current);
            context.clearRect(0, 0, width, height);
            context.fillStyle = '#070809';
            context.fillRect(0, 0, width, height);

            // 大范围径向色场覆盖整个背景，不使用孤立装饰色块。
            const firstGlow = context.createRadialGradient(
                width * 0.22,
                height * 0.5,
                0,
                width * 0.22,
                height * 0.5,
                Math.max(width, height) * 0.78,
            );
            firstGlow.addColorStop(0, `rgba(239, 71, 111, ${0.14 + frame.energy.bass * 0.35})`);
            firstGlow.addColorStop(1, 'rgba(7, 8, 9, 0)');
            context.fillStyle = firstGlow;
            context.fillRect(0, 0, width, height);

            const secondGlow = context.createRadialGradient(
                width * 0.78,
                height * 0.38,
                0,
                width * 0.78,
                height * 0.38,
                Math.max(width, height) * 0.72,
            );
            secondGlow.addColorStop(0, `rgba(34, 190, 181, ${0.12 + frame.energy.mid * 0.34})`);
            secondGlow.addColorStop(0.58, `rgba(53, 183, 255, ${frame.energy.high * 0.11})`);
            secondGlow.addColorStop(1, 'rgba(7, 8, 9, 0)');
            context.fillStyle = secondGlow;
            context.fillRect(0, 0, width, height);

            context.save();
            context.globalCompositeOperation = 'screen';
            drawWave(frame.timeData, height * 0.47, height * 0.12, 'rgba(94, 224, 174, 0.12)', 5, timestamp * 0.001);
            drawWave(frame.timeData, height * 0.52, height * 0.18, 'rgba(53, 183, 255, 0.08)', 12, -timestamp * 0.0007);
            context.restore();

            animationFrameId = requestAnimationFrame(draw);
        };

        animationFrameId = requestAnimationFrame(draw);
        return () => {
            cancelAnimationFrame(animationFrameId);
            resizeObserver.disconnect();
        };
    }, [analyserRef]);

    return <canvas ref={canvasRef} className={style.ambientCanvas} aria-hidden="true" />;
};
