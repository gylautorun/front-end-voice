/**
 * 固定高和不定高模型统一返回的虚拟窗口协议。
 *
 * `endIndex` 遵循 `Array.slice` 的开区间语义，视图层可以直接使用
 * `[startIndex, endIndex)` 按需生成当前窗口的数据。
 */
export interface VirtualRange {
    /** 本次渲染包含的第一项 0-based 索引。 */
    startIndex: number;
    /** 本次渲染结束的 0-based 索引，不包含该索引对应的项目。 */
    endIndex: number;
    /** 当前渲染块顶部相对完整逻辑列表顶部的纵向偏移，单位为 px。 */
    offsetY: number;
    /** 预估高度和实测高度共同构成的完整列表逻辑总高度，单位为 px。 */
    totalHeight: number;
}

/**
 * 超长列表中物理滚动坐标与完整逻辑坐标的映射结果。
 *
 * DOM 只使用安全的 `physicalTotalHeight`，虚拟模型使用 `scrollScale`
 * 将浏览器位置还原到完整逻辑数据空间。
 */
export interface CompressedScrollMetrics {
    /** 浏览器中用于撑开滚动条的安全物理高度，单位为 px。 */
    physicalTotalHeight: number;
    /** 每 1px 物理滚动距离对应的逻辑滚动距离，最小值为 1。 */
    scrollScale: number;
}
