/** 引入固定高与不定高模型共同返回的虚拟窗口结构。 */
import type {VirtualRange} from './types';

/** 固定高度虚拟列表模型，所有区间与偏移计算均为 O(1)。 */
export class FixedHeightVirtualizer {
    /**
     * 创建一个固定高度虚拟列表计算器。
     *
     * @param itemHeight 每个列表项包含边框在内的固定高度，单位为 px。
     * @throws {RangeError} itemHeight 不是有限正数时抛出。
     */
    constructor(private readonly itemHeight: number) {
        // 固定高公式需要用 itemHeight 做除数，因此必须排除 NaN、Infinity、0 和负数。
        if (!Number.isFinite(itemHeight) || itemHeight <= 0) {
            // 尽早暴露配置错误，避免后续产生 Infinity 或无效索引。
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
        // 条数必须是非负整数，小数向下取整，负数归零。
        const itemCount = Math.max(0, Math.floor(params.itemCount));
        // 缓冲数量同样转换为非负整数，确保后续索引仍是整数。
        const overscan = Math.max(0, Math.floor(params.overscan));
        // 顶部之外的负滚动值按 0 处理，兼容回弹滚动产生的瞬时负数。
        const scrollTop = Math.max(0, params.scrollTop);
        // 未测得视口或异常的负高度都按 0 处理。
        const viewportHeight = Math.max(0, params.viewportHeight);
        // 固定行高下可直接用除法定位第一条可见记录，并限制在数据范围内。
        const firstVisibleIndex = Math.min(itemCount, Math.floor(scrollTop / this.itemHeight));
        // 向上取整，确保最后一条只露出一部分时也包含在可见区中。
        const visibleCount = Math.ceil(viewportHeight / this.itemHeight);
        // 在第一条可见记录之前增加缓冲，但不能产生负索引。
        const startIndex = Math.max(0, firstVisibleIndex - overscan);
        // 在可见记录之后增加缓冲，并限制为 Array.slice 使用的开区间上界。
        const endIndex = Math.min(itemCount, firstVisibleIndex + visibleCount + overscan);

        // 返回视图层渲染窗口所需的全部几何信息。
        return {
            // 当前窗口第一条记录的 0-based 索引。
            startIndex,
            // 当前窗口结束索引，不包含该索引对应的记录。
            endIndex,
            // 固定高度下，窗口顶部偏移可以通过索引乘行高直接得到。
            offsetY: startIndex * this.itemHeight,
            // 完整列表的逻辑高度只与总条数和固定行高有关。
            totalHeight: itemCount * this.itemHeight,
        };
    }
}
