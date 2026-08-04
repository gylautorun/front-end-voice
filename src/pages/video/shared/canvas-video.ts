/** Canvas 根据 CSS 尺寸同步高 DPI 像素缓冲区后的结果。 */
export interface CanvasDisplaySize {
    /** CSS 像素宽度。 */
    width: number;
    /** CSS 像素高度。 */
    height: number;
    /** 实际使用的设备像素倍率，最高限制为 2。 */
    ratio: number;
}

/**
 * 根据 Canvas 当前布局尺寸更新真实缓冲区，并保持后续坐标使用 CSS 像素。
 */
export const resizeCanvasToDisplay = (
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
): CanvasDisplaySize => {
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return {width, height, ratio};
};

/** 视频 cover 裁剪计算结果，所有数值均位于视频源像素坐标。 */
export interface VideoCoverRect {
    sourceX: number;
    sourceY: number;
    sourceWidth: number;
    sourceHeight: number;
}

/**
 * 计算 object-fit: cover 对应的视频源裁剪区域。
 */
export const getVideoCoverRect = (
    videoWidth: number,
    videoHeight: number,
    targetWidth: number,
    targetHeight: number,
): VideoCoverRect => {
    const safeVideoWidth = Math.max(1, videoWidth);
    const safeVideoHeight = Math.max(1, videoHeight);
    const videoAspect = safeVideoWidth / safeVideoHeight;
    const targetAspect = Math.max(1, targetWidth) / Math.max(1, targetHeight);

    if (videoAspect > targetAspect) {
        const sourceWidth = safeVideoHeight * targetAspect;
        return {
            sourceX: (safeVideoWidth - sourceWidth) / 2,
            sourceY: 0,
            sourceWidth,
            sourceHeight: safeVideoHeight,
        };
    }

    const sourceHeight = safeVideoWidth / targetAspect;
    return {
        sourceX: 0,
        sourceY: (safeVideoHeight - sourceHeight) / 2,
        sourceWidth: safeVideoWidth,
        sourceHeight,
    };
};

/**
 * 以 cover 方式把当前视频帧绘制到指定矩形。
 */
export const drawVideoCover = (
    context: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    x: number,
    y: number,
    width: number,
    height: number,
) => {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false;
    const source = getVideoCoverRect(video.videoWidth, video.videoHeight, width, height);
    context.drawImage(
        video,
        source.sourceX,
        source.sourceY,
        source.sourceWidth,
        source.sourceHeight,
        x,
        y,
        width,
        height,
    );
    return true;
};
