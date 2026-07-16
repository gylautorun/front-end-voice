import type {VirtualRange} from './types';

/** 固定高度虚拟列表模型，所有区间与偏移计算均为 O(1)。 */
export class FixedHeightVirtualizer {
    /**
     * @param itemHeight 每个列表项包含边框在内的固定高度，单位为 px。
     */
    constructor(private readonly itemHeight: number) {
        if (!Number.isFinite(itemHeight) || itemHeight <= 0) {
            throw new RangeError('itemHeight must be greater than 0');
        }
    }

    /** 根据滚动位置计算本帧真正需要渲染的数据区间。 */
    getRange(params: {
        /** 当前滚动容器距离列表顶部的距离。 */
        scrollTop: number;
        /** 当前滚动容器的可见高度。 */
        viewportHeight: number;
        /** 完整数据源的项目数量。 */
        itemCount: number;
        /** 可见区前后额外预渲染的项目数量。 */
        overscan: number;
    }): VirtualRange {
        const itemCount = Math.max(0, Math.floor(params.itemCount));
        const overscan = Math.max(0, Math.floor(params.overscan));
        const scrollTop = Math.max(0, params.scrollTop);
        const viewportHeight = Math.max(0, params.viewportHeight);
        const firstVisibleIndex = Math.min(itemCount, Math.floor(scrollTop / this.itemHeight));
        const visibleCount = Math.ceil(viewportHeight / this.itemHeight);
        const startIndex = Math.max(0, firstVisibleIndex - overscan);
        const endIndex = Math.min(itemCount, firstVisibleIndex + visibleCount + overscan);

        return {
            startIndex,
            endIndex,
            offsetY: startIndex * this.itemHeight,
            totalHeight: itemCount * this.itemHeight,
        };
    }
}
