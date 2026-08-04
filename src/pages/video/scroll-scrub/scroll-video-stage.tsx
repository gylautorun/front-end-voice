import {RefObject, UIEventHandler, useEffect, useRef} from 'react';
import {drawVideoCover, resizeCanvasToDisplay} from '../shared/canvas-video';
import {VideoSourceKind} from '../shared/use-video-source';
import style from './style.module.scss';

/** 滚动映射使用平滑追赶或精确同步。 */
export type ScrubMode = 'smooth' | 'precise';

/** 滚动逐帧舞台参数。 */
interface ScrollVideoStageProps {
    /** 上传文件时读取和定位的 VideoElement。 */
    videoRef: RefObject<HTMLVideoElement>;
    /** 演示流使用生成帧，上传文件使用视频 seek。 */
    sourceKind: VideoSourceKind;
    /** 有限视频时长。 */
    duration: number;
    /** 平滑或精确追帧模式。 */
    scrubMode: ScrubMode;
    /** 滚动轨道相对可视区域的倍数。 */
    scrollLength: number;
}

/** 绘制与 0-1 进度完全确定的内置 240 帧视觉序列。 */
const drawGeneratedSequence = (
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    progress: number,
) => {
    const frame = Math.round(progress * 239);
    context.fillStyle = progress < 0.34 ? '#071113' : progress < 0.67 ? '#17101b' : '#11170e';
    context.fillRect(0, 0, width, height);

    // 规则网格随进度向左右分开，提供明显的逐帧空间变化。
    context.strokeStyle = 'rgba(142, 169, 160, 0.2)';
    context.lineWidth = 1;
    const gridOffset = (progress * 80) % 40;
    for (let x = -40 + gridOffset; x < width + 40; x += 40) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x + (progress - 0.5) * 160, height);
        context.stroke();
    }
    for (let y = 0; y < height; y += 40) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
    }

    const centerX = width / 2;
    const centerY = height / 2;
    const travel = (progress - 0.5) * width * 1.15;
    context.fillStyle = '#ef476f';
    context.fillRect(centerX - 280 + travel, centerY - 150, 250, 300);
    context.fillStyle = '#4f7cff';
    context.fillRect(centerX + 30 - travel, centerY - 190, 190, 380);
    context.fillStyle = '#ffd166';
    context.beginPath();
    context.arc(
        centerX + Math.sin(progress * Math.PI * 2) * width * 0.26,
        centerY + Math.cos(progress * Math.PI) * height * 0.2,
        42 + progress * 74,
        0,
        Math.PI * 2,
    );
    context.fill();

    context.fillStyle = '#f4f7f5';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `800 ${Math.max(34, Math.min(width, height) * 0.105)}px sans-serif`;
    context.fillText(progress < 0.34 ? 'OPEN' : progress < 0.67 ? 'SHIFT' : 'RESOLVE', centerX, centerY);
    context.font = '700 11px monospace';
    context.fillText(`GENERATED FRAME ${String(frame).padStart(3, '0')} / 239`, centerX, centerY + 62);
};

/** 将滚动容器的 0-1 位置映射到生成帧或上传视频 currentTime。 */
export const ScrollVideoStage = ({
    duration,
    scrubMode,
    scrollLength,
    sourceKind,
    videoRef,
}: ScrollVideoStageProps) => {
    const viewportRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const progressBarRef = useRef<HTMLDivElement>(null);
    const frameLabelRef = useRef<HTMLSpanElement>(null);
    const targetProgressRef = useRef(0);
    const displayedProgressRef = useRef(0);
    const settingsRef = useRef({duration, scrubMode, sourceKind});
    settingsRef.current = {duration, scrubMode, sourceKind};

    /** 读取滚动高度并写入目标进度，绘制循环负责平滑和视频 seek。 */
    const handleScroll: UIEventHandler<HTMLDivElement> = event => {
        const element = event.currentTarget;
        const maximumScroll = Math.max(1, element.scrollHeight - element.clientHeight);
        targetProgressRef.current = Math.max(0, Math.min(1, element.scrollTop / maximumScroll));
        // 用户开始滚动就暂停普通播放，随后由滚动位置精确接管 currentTime。
        if (settingsRef.current.sourceKind === 'uploaded') videoRef.current?.pause();
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return;
        let size = resizeCanvasToDisplay(canvas, context);
        let animationFrameId = 0;

        /** 每帧平滑进度、更新原生仪表并绘制当前视频帧。 */
        const draw = () => {
            const settings = settingsRef.current;
            const target = targetProgressRef.current;
            const video = videoRef.current;
            // 普通播放期间进度跟随 currentTime；滚动暂停后再按目标位置追帧。
            if (settings.sourceKind === 'uploaded' && settings.duration > 0 && video && !video.paused) {
                displayedProgressRef.current = video.currentTime / settings.duration;
                targetProgressRef.current = displayedProgressRef.current;
            } else if (settings.scrubMode === 'smooth') {
                displayedProgressRef.current += (target - displayedProgressRef.current) * 0.14;
            } else {
                displayedProgressRef.current = target;
            }
            const progress = Math.max(0, Math.min(1, displayedProgressRef.current));
            progressBarRef.current?.style.setProperty('transform', `scaleY(${Math.max(0.002, progress)})`);

            context.clearRect(0, 0, size.width, size.height);
            if (settings.sourceKind === 'uploaded' && settings.duration > 0 && video) {
                // 上传视频通过 currentTime 真正定位；保留最后 50ms 避免落到 ended 黑帧。
                const targetTime = progress * Math.max(0, settings.duration - 0.05);
                if (video.paused && Math.abs(video.currentTime - targetTime) > 0.025) {
                    video.currentTime = targetTime;
                }
                context.fillStyle = '#020405';
                context.fillRect(0, 0, size.width, size.height);
                drawVideoCover(context, video, 0, 0, size.width, size.height);
                if (frameLabelRef.current) {
                    frameLabelRef.current.textContent = `${targetTime.toFixed(2)}s / ${settings.duration.toFixed(2)}s`;
                }
            } else {
                drawGeneratedSequence(context, size.width, size.height, progress);
                if (frameLabelRef.current) {
                    frameLabelRef.current.textContent = `FRAME ${String(Math.round(progress * 239)).padStart(3, '0')}`;
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

    return (
        <div
            ref={viewportRef}
            className={style.viewport}
            tabIndex={0}
            aria-label="滚动控制视频逐帧播放区域"
            onScroll={handleScroll}
        >
            <div className={style.stickyStage}>
                <canvas ref={canvasRef} />
                <div className={style.frameStatus}><span ref={frameLabelRef}>FRAME 000</span></div>
                <div className={style.progressRail} aria-hidden="true"><i ref={progressBarRef} /></div>
                <div className={style.chapterLabels} aria-hidden="true">
                    <span>00 / OPEN</span>
                    <span>01 / SHIFT</span>
                    <span>02 / RESOLVE</span>
                </div>
            </div>
            <div className={style.scrollSpacer} style={{height: `${Math.max(100, (scrollLength - 1) * 100)}%`}} />
        </div>
    );
};
