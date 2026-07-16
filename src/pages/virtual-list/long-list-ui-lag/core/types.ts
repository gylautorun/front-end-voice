/** 一次虚拟列表计算得到的渲染窗口，endIndex 遵循 Array.slice 的开区间语义。 */
export interface VirtualRange {
    /** 本次渲染包含的第一项索引。 */
    startIndex: number;
    /** 本次渲染结束索引，不包含该索引对应的项目。 */
    endIndex: number;
    /** 渲染块相对完整列表顶部的纵向偏移，单位为 px。 */
    offsetY: number;
    /** 完整列表的逻辑总高度，单位为 px。 */
    totalHeight: number;
}

/** 超长列表中物理滚动坐标与完整逻辑坐标的映射结果。 */
export interface CompressedScrollMetrics {
    /** 浏览器中用于撑开滚动条的安全高度。 */
    physicalTotalHeight: number;
    /** 物理滚动距离映射到逻辑滚动距离的比例。 */
    scrollScale: number;
}
