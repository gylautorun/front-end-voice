/** 导出固定高度 O(1) 虚拟窗口计算模型。 */
export {FixedHeightVirtualizer} from './fixed-height-virtualizer';
/** 导出不定高度稀疏 Fenwick Tree 虚拟窗口计算模型。 */
export {DynamicHeightVirtualizer} from './dynamic-height-virtualizer';
/** 导出未测量项目统一高度的可解释预估函数。 */
export {estimateItemHeight} from './item-height-estimator';
/** 导出超长列表物理/逻辑坐标换算函数。 */
export {
    // 计算安全物理高度和滚动压缩比例。
    getCompressedScrollMetrics,
    // 将逻辑窗口偏移转换为浏览器安全的 transform 偏移。
    getPhysicalRenderOffset,
    // 将浏览器物理 scrollTop 映射到完整列表逻辑坐标。
    toLogicalScrollTop,
} from './scroll-coordinate';
/** 导出预估高度函数的参数类型，供框架适配层配置布局组成项。 */
export type {ItemHeightEstimateOptions} from './item-height-estimator';
/** 导出核心模型共用的虚拟窗口和坐标压缩结果类型。 */
export type {CompressedScrollMetrics, VirtualRange} from './types';
