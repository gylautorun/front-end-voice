/** 引入物理滚动高度和坐标压缩比例的返回类型。 */
import type {CompressedScrollMetrics} from './types';

/** 计算超长列表的物理占位高度以及物理到逻辑坐标的压缩比例。 */
export const getCompressedScrollMetrics = (params: {
    /** 完整数据在业务逻辑坐标系中的总高度，单位为 px。 */
    logicalTotalHeight: number;
    /** 浏览器滚动容器当前可见高度，单位为 px。 */
    viewportHeight: number;
    /** 浏览器中允许 spacer 使用的安全最大高度，单位为 px。 */
    maxPhysicalHeight: number;
}): CompressedScrollMetrics => {
    // 视口高度不能为负；初次测量前或异常输入统一按 0 处理。
    const viewportHeight = Math.max(0, params.viewportHeight);
    // 逻辑总高度不能为负，空列表按 0 处理。
    const logicalTotalHeight = Math.max(0, params.logicalTotalHeight);
    // 物理高度上限至少等于视口，否则滚动容器连可见区域都无法容纳。
    const maxPhysicalHeight = Math.max(viewportHeight, params.maxPhysicalHeight);
    // 逻辑高度未超限时保持原高度，超限时截断为浏览器安全高度。
    const physicalTotalHeight = Math.min(logicalTotalHeight, maxPhysicalHeight);
    // 物理可滚动距离等于物理总高度减视口高度，空列表时最小为 0。
    const physicalScrollable = Math.max(0, physicalTotalHeight - viewportHeight);
    // 逻辑可滚动距离使用完整数据总高度计算，保留业务坐标范围。
    const logicalScrollable = Math.max(0, logicalTotalHeight - viewportHeight);
    // 有物理滚动空间时计算逻辑/物理比例，否则使用 1 避免除以 0。
    const scrollScale = physicalScrollable > 0
        // 比例最小为 1；未超过物理上限时逻辑坐标与物理坐标保持一致。
        ? Math.max(1, logicalScrollable / physicalScrollable)
        // 无滚动空间时不需要坐标压缩。
        : 1;

    // 将 DOM spacer 高度和坐标换算比例一起返回给 React 适配层。
    return {
        // 浏览器实际用于撑开滚动条的高度。
        physicalTotalHeight,
        // 每 1px 物理滚动距离对应的逻辑滚动距离。
        scrollScale,
    };
};

/** 将浏览器实际 scrollTop 映射到完整列表的逻辑 scrollTop。 */
export const toLogicalScrollTop = (params: {
    /** 浏览器当前实际 scrollTop，属于物理坐标系。 */
    physicalScrollTop: number;
    /** 浏览器滚动容器能够到达的最大物理 scrollTop。 */
    maxPhysicalScrollTop: number;
    /** 完整逻辑列表能够到达的最大逻辑 scrollTop。 */
    maxLogicalScrollTop: number;
    /** 物理滚动距离映射到逻辑滚动距离的比例。 */
    scrollScale: number;
}): number => {
    // 忽略浏览器回弹产生的负值，将物理位置限制在列表顶部及以下。
    const physicalScrollTop = Math.max(0, params.physicalScrollTop);
    // 1px 容差用于稳定顶部边界，确保拖到顶部时精确返回逻辑位置 0。
    if (physicalScrollTop <= 1) {
        return 0;
    }
    // 同样使用 1px 容差识别物理滚动条已经到达底部。
    if (params.maxPhysicalScrollTop - physicalScrollTop <= 1) {
        // 底部直接返回最大逻辑位置，避免浮点乘法导致无法定位最后一项。
        return Math.max(0, params.maxLogicalScrollTop);
    }
    // 中间区域使用压缩比例做线性映射，并保证错误输入不会产生小于 1 的比例。
    return physicalScrollTop * Math.max(1, params.scrollScale);
};

/** 把逻辑渲染窗口放回安全的物理滚动坐标附近，避免超大 transform。 */
export const getPhysicalRenderOffset = (params: {
    /** 浏览器当前实际物理 scrollTop。 */
    physicalScrollTop: number;
    /** 物理位置映射得到的完整列表逻辑 scrollTop。 */
    logicalScrollTop: number;
    /** 当前虚拟窗口顶部在完整逻辑列表中的偏移。 */
    logicalRangeOffset: number;
}): number => {
    // 计算逻辑窗口顶部位于当前逻辑视口顶部上方或下方的相对距离。
    const logicalDistanceFromViewport = params.logicalScrollTop - params.logicalRangeOffset;
    // 用物理 scrollTop 减去该相对距离，将 transform 保持在浏览器安全坐标附近。
    return params.physicalScrollTop - logicalDistanceFromViewport;
};
