/** 由可预知的行布局参数计算未渲染项目的代表性预估高度。 */
export interface ItemHeightEstimateOptions {
    /** 项目上下内边距之和，单位为 px。 */
    verticalPadding: number;
    /** 单行标题的行高，单位为 px。 */
    titleLineHeight: number;
    /** 标题与正文之间的垂直间距，单位为 px。 */
    titleMarginBottom: number;
    /** 根据样本或业务分布得到的预计正文行数。 */
    expectedContentLines: number;
    /** 正文单行行高，单位为 px。 */
    contentLineHeight: number;
    /** 项目上下边框高度之和，单位为 px。 */
    borderHeight?: number;
    /** 按出现概率折算后的媒体区域平均占位高度，包含媒体与正文间距，单位为 px。 */
    expectedMediaBlockHeight?: number;
    /** 为字体取整、缩放和轻微布局误差保留的高度。 */
    safetyBuffer?: number;
}

/**
 * 计算统一预估高度。
 *
 * 该结果只是未测量区域的初始基线；DOM 挂载后的真实高度仍由 ResizeObserver 修正。
 *
 * 计算公式：
 * `verticalPadding + titleLineHeight + titleMarginBottom
 * + expectedContentLines * contentLineHeight + borderHeight
 * + expectedMediaBlockHeight + safetyBuffer`。
 *
 * @param options 影响单个列表项预估高度的布局参数。
 * @param options.verticalPadding 项目上、下内边距之和，单位为 px。例如上下各 16px 时传入 32。
 * @param options.titleLineHeight 单行标题的 CSS `line-height`，单位为 px。
 * @param options.titleMarginBottom 标题与正文之间的垂直间距，单位为 px。
 * @param options.expectedContentLines 预计正文行数，可使用样本平均值或截尾平均值，例如 6.5。
 * @param options.contentLineHeight 正文单行的 CSS `line-height`，单位为 px。
 * @param options.borderHeight 项目上、下边框高度之和，单位为 px；未传时按 0 计算。
 * @param options.expectedMediaBlockHeight 按图片出现概率折算后的平均媒体占位，未传时按 0 计算。
 * @param options.safetyBuffer 字体取整、缩放等误差的预留高度，单位为 px；未传时按 0 计算。
 * @returns 向上取整后的代表性预估高度，单位为 px。
 * @throws {RangeError} 任一参数不是有限数字或小于 0 时抛出。
 *
 * @example
 * ```ts
 * estimateItemHeight({
 *     verticalPadding: 32,
 *     titleLineHeight: 17,
 *     titleMarginBottom: 7,
 *     expectedContentLines: 6.5,
 *     contentLineHeight: 22,
 *     borderHeight: 1,
 *     expectedMediaBlockHeight: 48,
 *     safetyBuffer: 5,
 * }); // 253
 * ```
 */
export const estimateItemHeight = (options: ItemHeightEstimateOptions): number => {
    // 保留全部必填参数，并为三个可选参数补上 0，便于统一校验和求和。
    const normalizedOptions = {
        // 展开调用方传入的全部布局参数。
        ...options,
        // 没有边框时不增加额外高度。
        borderHeight: options.borderHeight ?? 0,
        // 没有图片或其他媒体时，平均媒体占位按 0 计算。
        expectedMediaBlockHeight: options.expectedMediaBlockHeight ?? 0,
        // 调用方未设置安全余量时不做额外补偿。
        safetyBuffer: options.safetyBuffer ?? 0,
    };
    // 转换为 [参数名, 参数值] 列表，使所有字段共用同一套校验逻辑。
    const values = Object.entries(normalizedOptions);
    // 逐个检查必填字段和已归一化的可选字段。
    values.forEach(([name, value]) => {
        // 高度组成项只接受非负有限数字，0 允许表示该部分不存在。
        if (!Number.isFinite(value) || value < 0) {
            // 在错误中包含参数名，方便调用方快速定位错误配置。
            throw new RangeError(`${name} must be a non-negative finite number`);
        }
    });

    // 将各布局组成项相加，并向上取整得到可安全覆盖小数像素的统一预估高度。
    return Math.ceil(
        // 加入项目上、下内边距。
        options.verticalPadding
        // 加入单行标题占用的高度。
        + options.titleLineHeight
        // 加入标题与正文之间的垂直间距。
        + options.titleMarginBottom
        // 用预计正文行数乘单行行高，得到正文的平均占位。
        + options.expectedContentLines * options.contentLineHeight
        // 加入项目上、下边框的总高度。
        + normalizedOptions.borderHeight
        // 加入按出现概率折算后的图片或其他媒体平均占位。
        + normalizedOptions.expectedMediaBlockHeight
        // 最后加入字体取整、缩放和轻微布局误差的安全余量。
        + normalizedOptions.safetyBuffer,
    );
};
