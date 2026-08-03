import {AudioFrame, CanvasScene} from './types';

/** 频域采样函数实际需要的音频帧字段。 */
type SpectrumSource = Pick<AudioFrame, 'fftSize' | 'frequencyData' | 'sampleRate'>;

/** 将数值限制在指定闭区间，用于防止 FFT 下标和尺寸越界。 */
export const clamp = (value: number, minimum: number, maximum: number) => (
    Math.min(maximum, Math.max(minimum, value))
);

/** 绘制不参与音频数据计算的固定背景网格。 */
export const drawGrid = ({context, height, width}: CanvasScene) => {
    // 保存调用前的画笔状态，避免网格样式污染其他图形。
    context.save();
    // 使用低透明浅色线，保证网格不抢占音乐图形焦点。
    context.strokeStyle = 'rgba(235, 244, 239, 0.055)';
    context.lineWidth = 1;
    // 每 40 CSS 像素绘制一条横纵辅助线。
    const gridSize = 40;
    // 从左到右绘制垂直网格。
    for (let x = gridSize; x < width; x += gridSize) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
    }
    // 从上到下绘制水平网格。
    for (let y = gridSize; y < height; y += gridSize) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
    }
    // 恢复调用前的 Canvas 状态。
    context.restore();
};

/** 在两个相邻 FFT bin 之间线性插值，避免低频相邻柱使用完全相同的高度。 */
export const getInterpolatedAmplitude = (source: SpectrumSource, frequency: number) => {
    const {fftSize, frequencyData, sampleRate} = source;
    // 无分析数据时返回零幅度。
    if (!frequencyData.length) return 0;
    // 将实际 Hz 换算为可带小数的 FFT bin 精确位置。
    const exactIndex = frequency * fftSize / sampleRate;
    // 取得左侧整数 bin，并限制在数组范围内。
    const lowerIndex = clamp(Math.floor(exactIndex), 0, frequencyData.length - 1);
    // 取得右侧相邻 bin，末尾时回退到最后一项。
    const upperIndex = Math.min(frequencyData.length - 1, lowerIndex + 1);
    // 小数部分代表当前频率靠近右侧 bin 的比例。
    const interpolation = exactIndex - Math.floor(exactIndex);
    // 按距离权重混合左右 bin 幅度。
    const value = frequencyData[lowerIndex] * (1 - interpolation)
        + frequencyData[upperIndex] * interpolation;
    // AnalyserNode 返回 0-255，这里归一化为 0-1。
    return value / 255;
};

/** 计算指定 Hz 区间内所有 FFT bin 的平均归一化能量。 */
export const getBandEnergy = (
    source: SpectrumSource,
    range: {maximum: number; minimum: number},
) => {
    const {fftSize, frequencyData, sampleRate} = source;
    // 尚未创建 AnalyserNode 时返回安静值。
    if (!frequencyData.length) return 0;
    // FFT 每个 bin 覆盖的 Hz = 采样率 / FFT 尺寸。
    const hertzPerBin = sampleRate / fftSize;
    // 将频率下界转为数组起始下标并做越界保护。
    const from = clamp(
        Math.floor(range.minimum / hertzPerBin),
        0,
        frequencyData.length - 1,
    );
    // 将频率上界转为不包含的结束下标，至少覆盖一个 bin。
    const to = clamp(
        Math.ceil(range.maximum / hertzPerBin),
        from + 1,
        frequencyData.length,
    );
    // 累计区间内 0-255 的频域幅度。
    let total = 0;
    for (let index = from; index < to; index += 1) {
        total += frequencyData[index];
    }
    // 先求平均值，再除以 255 归一化到 0-1。
    return total / (to - from) / 255;
};
