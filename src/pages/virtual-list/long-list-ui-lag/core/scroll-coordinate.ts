import type {CompressedScrollMetrics} from './types';

/** 计算超长列表的物理占位高度以及物理到逻辑坐标的压缩比例。 */
export const getCompressedScrollMetrics = (params: {
    logicalTotalHeight: number;
    viewportHeight: number;
    maxPhysicalHeight: number;
}): CompressedScrollMetrics => {
    const viewportHeight = Math.max(0, params.viewportHeight);
    const logicalTotalHeight = Math.max(0, params.logicalTotalHeight);
    const maxPhysicalHeight = Math.max(viewportHeight, params.maxPhysicalHeight);
    const physicalTotalHeight = Math.min(logicalTotalHeight, maxPhysicalHeight);
    const physicalScrollable = Math.max(0, physicalTotalHeight - viewportHeight);
    const logicalScrollable = Math.max(0, logicalTotalHeight - viewportHeight);
    const scrollScale = physicalScrollable > 0
        ? Math.max(1, logicalScrollable / physicalScrollable)
        : 1;

    return {physicalTotalHeight, scrollScale};
};

/** 将浏览器实际 scrollTop 映射到完整列表的逻辑 scrollTop。 */
export const toLogicalScrollTop = (params: {
    physicalScrollTop: number;
    maxPhysicalScrollTop: number;
    maxLogicalScrollTop: number;
    scrollScale: number;
}): number => {
    const physicalScrollTop = Math.max(0, params.physicalScrollTop);
    if (physicalScrollTop <= 1) return 0;
    if (params.maxPhysicalScrollTop - physicalScrollTop <= 1) {
        return Math.max(0, params.maxLogicalScrollTop);
    }
    return physicalScrollTop * Math.max(1, params.scrollScale);
};

/** 把逻辑渲染窗口放回安全的物理滚动坐标附近，避免超大 transform。 */
export const getPhysicalRenderOffset = (params: {
    physicalScrollTop: number;
    logicalScrollTop: number;
    logicalRangeOffset: number;
}): number => params.physicalScrollTop - (
    params.logicalScrollTop - params.logicalRangeOffset
);
