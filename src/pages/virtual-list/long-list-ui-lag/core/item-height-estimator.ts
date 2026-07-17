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
 * + expectedContentLines * contentLineHeight + borderHeight + safetyBuffer`。
 *
 * @param options 影响单个列表项预估高度的布局参数。
 * @param options.verticalPadding 项目上、下内边距之和，单位为 px。例如上下各 16px 时传入 32。
 * @param options.titleLineHeight 单行标题的 CSS `line-height`，单位为 px。
 * @param options.titleMarginBottom 标题与正文之间的垂直间距，单位为 px。
 * @param options.expectedContentLines 预计正文行数，可使用样本平均值或截尾平均值，例如 6.5。
 * @param options.contentLineHeight 正文单行的 CSS `line-height`，单位为 px。
 * @param options.borderHeight 项目上、下边框高度之和，单位为 px；未传时按 0 计算。
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
 *     safetyBuffer: 5,
 * }); // 205
 * ```
 */
export const estimateItemHeight = (options: ItemHeightEstimateOptions): number => {
    const normalizedOptions = {
        ...options,
        borderHeight: options.borderHeight ?? 0,
        safetyBuffer: options.safetyBuffer ?? 0,
    };
    const values = Object.entries(normalizedOptions);
    values.forEach(([name, value]) => {
        if (!Number.isFinite(value) || value < 0) {
            throw new RangeError(`${name} must be a non-negative finite number`);
        }
    });

    return Math.ceil(
        options.verticalPadding
        + options.titleLineHeight
        + options.titleMarginBottom
        + options.expectedContentLines * options.contentLineHeight
        + normalizedOptions.borderHeight
        + normalizedOptions.safetyBuffer,
    );
};
