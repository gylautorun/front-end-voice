import {getFrequencyBand, getLogFrequency} from '../frequency-bands';
import {clamp, drawGrid, getBandEnergy, getInterpolatedAmplitude} from './canvas-utils';
import {AudioFrame, CanvasScene, MirrorState} from './types';

/** 空间平滑使用的左右邻居数量；数值越大，波形轮廓越柔和。 */
const SMOOTHING_RADIUS = 4;

/** 对一组频谱高度做三角权重平滑，去掉相邻频点间杂乱的尖刺。 */
const smoothLevels = (levels: number[]) => levels.map((_, currentIndex) => {
    // 当前柱附近的原始幅度加权总和。
    let weightedTotal = 0;
    // 实际参与平均的权重总和。
    let weightTotal = 0;
    // 从左侧四根柱遍历到右侧四根柱。
    for (let offset = -SMOOTHING_RADIUS; offset <= SMOOTHING_RADIUS; offset += 1) {
        // 越靠近当前柱权重越大，从而保留主要频谱走势。
        const weight = SMOOTHING_RADIUS + 1 - Math.abs(offset);
        // 边缘位置复用首尾值，避免数组越界。
        const sourceIndex = clamp(currentIndex + offset, 0, levels.length - 1);
        // 累加当前邻居的加权幅度。
        weightedTotal += levels[sourceIndex] * weight;
        // 累加本轮权重。
        weightTotal += weight;
    }
    // 返回 0-1 范围内的局部平滑幅度。
    return weightedTotal / weightTotal;
});

/**
 * 绘制以中间基线为中心的对称窄柱频谱。
 * 实际 FFT 能量决定主高度，三角函数只负责整理整体轮廓，不制造脱离音乐的随机抖动。
 */
export const drawMirrorSpectrum = (
    scene: CanvasScene,
    frame: AudioFrame,
    state: MirrorState,
) => {
    const {context, height, width} = scene;
    const {sampleRate, sensitivity, timestamp} = frame;
    // 先铺设与其他模式一致的背景网格。
    drawGrid(scene);

    // 所有窄柱都以画布垂直中心为共同基线。
    const baseline = height / 2;
    // 左右保留空间，避免第一根和最后一根柱贴边。
    const horizontalPadding = 24;
    // 上下各保留 46px，灵敏度最高时也不会触碰画布边缘。
    const maximumAmplitude = Math.max(28, baseline - 46);
    // 实际可用于排布窄柱的水平宽度。
    const drawableWidth = Math.max(1, width - horizontalPadding * 2);
    // 镜像模式使用更多柱，使它比普通频谱柱更细密。
    const barCount = clamp(Math.floor(drawableWidth / 4.5), 64, 180);
    // 每根柱占用的水平槽位宽度。
    const slotWidth = drawableWidth / barCount;
    // 线宽限制在 1-2px，明显窄于普通柱状图。
    const barWidth = clamp(slotWidth * 0.34, 1, 2);

    // 先按照对数频率轴采集每根窄柱的原始能量。
    const rawLevels = Array.from({length: barCount}, (_, index) => {
        // 将柱下标转换为 0-1 的水平进度。
        const progress = index / Math.max(1, barCount - 1);
        // 与普通频谱柱共用 20 Hz-20 kHz 对数轴。
        const frequency = getLogFrequency(progress, sampleRate);
        // 读取当前频率在相邻 FFT bin 之间的插值幅度。
        return getInterpolatedAmplitude(frame, frequency);
    });
    // 对相邻频点执行空间平滑，得到连续、可读的频谱轮廓。
    const smoothedLevels = smoothLevels(rawLevels);

    // 三个宽频段控制不同正弦谐波的参与强度。
    const bassEnergy = getBandEnergy(frame, {minimum: 20, maximum: 250});
    const midEnergy = getBandEnergy(frame, {minimum: 250, maximum: 4000});
    const highEnergy = getBandEnergy(frame, {minimum: 4000, maximum: 20000});
    // 音乐总体能量只轻微改变相位速度，避免静态机械滚动。
    const totalEnergy = clamp(bassEnergy * 0.45 + midEnergy * 0.35 + highEnergy * 0.2, 0, 1);
    // 时间戳转换为缓慢运动的正弦相位。
    const phase = timestamp * (0.00045 + totalEnergy * 0.0007);

    // 先绘制中线，窄柱随后覆盖它形成清晰的上下贯穿效果。
    context.save();
    context.strokeStyle = 'rgba(242, 201, 76, 0.52)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(horizontalPadding, baseline);
    context.lineTo(width - horizontalPadding, baseline);
    context.stroke();
    context.restore();

    // 隔离窄柱使用的线帽、透明度和阴影状态。
    context.save();
    context.lineCap = 'round';
    context.globalAlpha = 0.92;
    // 逐根绘制从上端点贯穿中线到下端点的对称窄柱。
    for (let index = 0; index < barCount; index += 1) {
        // 归一化水平位置，用于频率映射和三角函数塑形。
        const progress = index / Math.max(1, barCount - 1);
        // 低频形成宽波峰，中高频叠加更密集但幅度较小的波峰。
        const harmonicEnvelope = 0.78
            + Math.sin(progress * Math.PI * 4 - phase) * (0.07 + bassEnergy * 0.08)
            + Math.sin(progress * Math.PI * 10 + phase * 1.35) * (0.04 + midEnergy * 0.06)
            + Math.sin(progress * Math.PI * 18 - phase * 1.8) * (0.02 + highEnergy * 0.04);
        // sin(0..PI) 让两端稍低、中间更饱满，形成完整波形构图。
        const compositionEnvelope = 0.7 + Math.pow(Math.sin(progress * Math.PI), 0.55) * 0.3;
        // FFT 能量仍是高度主体，正弦包络只平滑和塑造外轮廓。
        const targetLevel = Math.min(
            maximumAmplitude,
            Math.max(
                2,
                Math.pow(smoothedLevels[index], 1.12)
                    * maximumAmplitude
                    * sensitivity
                    * harmonicEnvelope
                    * compositionEnvelope,
            ),
        );
        // 上升使用较快缓动、下降使用较慢缓动，既跟拍又避免闪烁。
        const previousLevel = state.levels[index] ?? targetLevel;
        const easing = targetLevel > previousLevel ? 0.34 : 0.13;
        const level = previousLevel + (targetLevel - previousLevel) * easing;
        // 保存本帧高度，供下一动画帧继续做时间平滑。
        state.levels[index] = level;

        // 当前窄柱放在对应槽位中心。
        const x = horizontalPadding + (index + 0.5) * slotWidth;
        // 当前水平位置仍使用七频段的明确颜色。
        const frequency = getLogFrequency(progress, sampleRate);
        context.strokeStyle = getFrequencyBand(frequency).color;
        context.lineWidth = barWidth;
        // 从上侧端点一次画到下侧端点，保证严格以中线镜像。
        context.beginPath();
        context.moveTo(x, baseline - level);
        context.lineTo(x, baseline + level);
        context.stroke();
    }
    // 画布变窄导致柱数减少时，删除不再使用的跨帧高度。
    state.levels.length = barCount;
    // 恢复窄柱绘制前的 Canvas 状态。
    context.restore();
};
