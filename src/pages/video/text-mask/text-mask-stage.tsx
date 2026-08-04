import {RefObject, useEffect, useRef} from 'react';
import {drawVideoCover, resizeCanvasToDisplay} from '../shared/canvas-video';
import style from './style.module.scss';

/** 文字视频遮罩舞台参数。 */
interface TextMaskStageProps {
    /** 需要裁剪进文字内部的视频元素。 */
    videoRef: RefObject<HTMLVideoElement>;
    /** 用户输入的遮罩文字。 */
    text: string;
    /** 字号倍率，1 为自动计算后的默认尺寸。 */
    textScale: number;
    /** 是否显示文字轮廓。 */
    showOutline: boolean;
}

/** 把长文字拆成最多两行，保证移动端也能完整显示。 */
const splitTextLines = (value: string) => {
    const characters = Array.from(value.trim() || 'VIDEO');
    if (characters.length <= 8) return [characters.join('')];
    const middle = Math.ceil(characters.length / 2);
    return [characters.slice(0, middle).join(''), characters.slice(middle).join('')];
};

/**
 * 先绘制完整视频，再通过 destination-in 仅保留文字覆盖区域。
 */
export const TextMaskStage = ({showOutline, text, textScale, videoRef}: TextMaskStageProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // 参数同步到 ref 后，拖动 Slider 不会重建 ResizeObserver 和动画循环。
    const settingsRef = useRef({showOutline, text, textScale});
    settingsRef.current = {showOutline, text, textScale};

    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return;
        let size = resizeCanvasToDisplay(canvas, context);
        let animationFrameId = 0;

        /** 每帧按照“视频 -> 文字蒙版 -> 轮廓”的顺序合成。 */
        const draw = () => {
            const video = videoRef.current;
            const settings = settingsRef.current;
            context.clearRect(0, 0, size.width, size.height);

            if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                // 第一步：视频先铺满透明 Canvas，此时整张视频暂时可见。
                drawVideoCover(context, video, 0, 0, size.width, size.height);
                // 第二步：destination-in 只保留后续文字与视频相交的像素。
                context.globalCompositeOperation = 'destination-in';
                context.fillStyle = '#fff';
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                const lines = splitTextLines(settings.text);
                const longestLine = lines.reduce((longest, line) => line.length > longest.length ? line : longest, '');
                const widthLimitedSize = size.width / Math.max(2.5, longestLine.length * 0.68);
                const heightLimitedSize = size.height / (lines.length === 1 ? 2.1 : 3.1);
                const fontSize = Math.max(34, Math.min(widthLimitedSize, heightLimitedSize) * settings.textScale);
                const lineHeight = fontSize * 0.88;
                context.font = `900 ${fontSize}px Arial Black, sans-serif`;
                lines.forEach((line, index) => {
                    const y = size.height / 2 + (index - (lines.length - 1) / 2) * lineHeight;
                    context.fillText(line, size.width / 2, y, size.width * 0.92);
                });

                // 第三步：恢复普通混合模式，轮廓不会再次裁剪视频像素。
                context.globalCompositeOperation = 'source-over';
                if (settings.showOutline) {
                    context.strokeStyle = 'rgba(245, 249, 247, 0.56)';
                    context.lineWidth = Math.max(1, fontSize * 0.014);
                    lines.forEach((line, index) => {
                        const y = size.height / 2 + (index - (lines.length - 1) / 2) * lineHeight;
                        context.strokeText(line, size.width / 2, y, size.width * 0.92);
                    });
                }
            }

            animationFrameId = requestAnimationFrame(draw);
        };

        const resizeObserver = new ResizeObserver(() => {
            size = resizeCanvasToDisplay(canvas, context);
        });
        resizeObserver.observe(canvas);
        animationFrameId = requestAnimationFrame(draw);
        return () => {
            cancelAnimationFrame(animationFrameId);
            resizeObserver.disconnect();
        };
    }, [videoRef]);

    return <canvas ref={canvasRef} className={style.canvas} aria-label="文字内部实时播放的视频遮罩" />;
};
