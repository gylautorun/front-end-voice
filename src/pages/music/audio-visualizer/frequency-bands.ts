/** 单个听觉频段在图例和 Canvas 中共用的完整定义。 */
export interface FrequencyBand {
    /** 频段在柱状图、球形轮廓和图例中的唯一颜色。 */
    color: string;
    /** 面向用户展示的中文频段名称。 */
    label: string;
    /** 频段上界，单位为 Hz，匹配时不包含该边界。 */
    max: number;
    /** 频段下界，单位为 Hz，匹配时包含该边界。 */
    min: number;
    /** 图例中展示的经过格式化的频率范围。 */
    range: string;
}

/** 人耳可感知频谱的可视化起点。 */
export const MIN_VISUAL_FREQUENCY = 20;
/** 人耳可感知频谱的可视化终点。 */
export const MAX_VISUAL_FREQUENCY = 20000;

/**
 * 按频率从低到高排列的七段频谱。
 * 颜色使用紫、蓝、青、绿、黄、橙、红，保证相邻频段也能快速区分。
 */
export const FREQUENCY_BANDS: FrequencyBand[] = [
    {label: '次低频', range: '20-60 Hz', min: 20, max: 60, color: '#9b6dff'},
    {label: '低频', range: '60-250 Hz', min: 60, max: 250, color: '#3b82f6'},
    {label: '中低频', range: '250-500 Hz', min: 250, max: 500, color: '#00c2d7'},
    {label: '中频', range: '500 Hz-2 kHz', min: 500, max: 2000, color: '#2ccb7f'},
    {label: '中高频', range: '2-4 kHz', min: 2000, max: 4000, color: '#f2c94c'},
    {label: '高频', range: '4-8 kHz', min: 4000, max: 8000, color: '#ff8a34'},
    {label: '超高频', range: '8-20 kHz', min: 8000, max: 20000, color: '#f04452'},
];

/**
 * 根据实际 Hz 查找对应频段。
 * 超过上限的数值归入最后一段，避免绘制时出现空颜色。
 */
export const getFrequencyBand = (frequency: number) => (
    // 依次检查频率是否位于 [min, max) 区间。
    FREQUENCY_BANDS.find(band => frequency >= band.min && frequency < band.max)
    // 边界外数值回退到超高频，保证始终返回有效频段。
    || FREQUENCY_BANDS[FREQUENCY_BANDS.length - 1]
);

/**
 * 将 0–1 的画布水平进度转换为对数分布的实际 Hz。
 * 对数轴能给低频留出更多水平空间，更接近人耳对音高的感知。
 */
export const getLogFrequency = (progress: number, sampleRate: number) => {
    // 取 20 kHz 与奈奎斯特频率中的较小值，防止超出音频可分析范围。
    const maximum = Math.min(MAX_VISUAL_FREQUENCY, sampleRate / 2);
    // 按指数比例从 20 Hz 平滑映射到 maximum。
    return MIN_VISUAL_FREQUENCY * Math.pow(maximum / MIN_VISUAL_FREQUENCY, progress);
};
