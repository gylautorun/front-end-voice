import {getFrequencyBand, getLogFrequency} from '../frequency-bands';
import {clamp, drawGrid, getInterpolatedAmplitude} from './canvas-utils';
import {AudioFrame, BarsState, CanvasScene} from './types';

/** 绘制对数频率轴、七频段颜色的柱状频谱。 */
export const drawBars = (
    scene: CanvasScene,
    frame: AudioFrame,
    state: BarsState,
) => {
    const {context, height, width} = scene;
    const {sampleRate, sensitivity} = frame;
    // 先铺设背景网格，频谱柱随后覆盖在其上。
    drawGrid(scene);

    // 基线距离底部 34px，为倒影留出空间。
    const baseline = height - 34;
    // 可变柱高使用画布主要垂直空间。
    const availableHeight = Math.max(80, height - 72);
    // 强制保留 44px 顶部留白，防止高灵敏度时贴顶。
    const maximumBarHeight = Math.max(24, baseline - 44);
    // 根据画布宽度在 36-112 之间动态选择柱数。
    const barCount = clamp(Math.floor(width / 11), 36, 112);
    // 窄画布减小柱间隔，保证单柱仍可见。
    const gap = width < 560 ? 2 : 3;
    // 扣除两侧 24px 留白和所有间隔后计算单柱宽度。
    const barWidth = Math.max(2, (width - 48 - gap * (barCount - 1)) / barCount);
    // 计算实际柱组的左起点，使整组水平居中。
    const startX = (width - (barWidth + gap) * barCount + gap) / 2;

    // 隔离柱状图绘制状态。
    context.save();
    // 每根柱根据实际频率独立计算高度和颜色。
    for (let index = 0; index < barCount; index += 1) {
        // 将柱下标归一化到 0-1。
        const progress = index / Math.max(1, barCount - 1);
        // 将水平进度映射到 20 Hz-20 kHz 对数频率轴。
        const frequency = getLogFrequency(progress, sampleRate);
        // 用相邻 bin 插值读取该 Hz 的平滑幅度。
        const amplitude = getInterpolatedAmplitude(frame, frequency);
        // 幅度经非线性整形和灵敏度缩放后，再限制到顶部留白之下。
        const barHeight = Math.min(
            maximumBarHeight,
            Math.max(3, Math.pow(amplitude, 1.28) * availableHeight * sensitivity),
        );
        // 计算当前柱的水平坐标。
        const x = startX + index * (barWidth + gap);
        // Canvas 从上往下为正，因此用基线减去柱高得到顶部坐标。
        const y = baseline - barHeight;
        // 频率所属的七段频谱决定该柱颜色。
        context.fillStyle = getFrequencyBand(frequency).color;
        // 主柱保持较高不透明度。
        context.globalAlpha = 0.96;
        context.fillRect(x, y, barWidth, barHeight);

        // 峰值至少与当前柱等高，否则每帧向下衰减 1.8px。
        const nextPeak = Math.min(
            maximumBarHeight,
            Math.max(barHeight, (state.peaks[index] || 0) - 1.8),
        );
        // 缓存峰值，下一帧继续执行衰减。
        state.peaks[index] = nextPeak;
        // 峰值标记比主柱更透明。
        context.globalAlpha = 0.72;
        context.fillRect(x, baseline - nextPeak - 5, barWidth, 2);

        // 在基线下方绘制短倒影，增加与底面的视觉联系。
        context.globalAlpha = 0.12;
        context.fillRect(x, baseline + 6, barWidth, Math.min(barHeight * 0.16, 18));
    }
    // 画布缩放导致柱数变少时，截断多余峰值。
    state.peaks.length = barCount;
    // 恢复绘制柱之前的 Canvas 状态。
    context.restore();

    // 单独绘制频谱基线。
    context.save();
    context.strokeStyle = 'rgba(235, 244, 239, 0.24)';
    context.beginPath();
    context.moveTo(24, baseline + 1);
    context.lineTo(width - 24, baseline + 1);
    context.stroke();
    // 恢复基线之前的 Canvas 状态。
    context.restore();
};
