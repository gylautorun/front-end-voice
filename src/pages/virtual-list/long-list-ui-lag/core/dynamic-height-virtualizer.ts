import type {VirtualRange} from './types';

/**
 * 不定高度虚拟列表模型。
 *
 * 未测量项目先使用预估高度；DOM 挂载后写入实测高度。Fenwick Tree 让高度
 * 修正、累计偏移查询和滚动位置定位都保持 O(log n)。
 */
export class DynamicHeightVirtualizer {
    /** 完整列表的逻辑项目数量，不创建同等长度的数组。 */
    private itemCountValue = 0;
    /** 只保存已测量项目的真实高度，未出现的索引使用统一预估高度。 */
    private measuredHeights = new Map<number, number>();
    /** 只保存测量高度相对预估高度的 Fenwick 增量节点。 */
    private tree = new Map<number, number>();

    constructor(
        itemCount: number,
        private readonly estimatedItemHeight: number,
    ) {
        if (!Number.isFinite(estimatedItemHeight) || estimatedItemHeight <= 0) {
            throw new RangeError('estimatedItemHeight must be greater than 0');
        }
        this.setItemCount(itemCount);
    }

    /** 返回模型当前维护的项目数量。 */
    get itemCount(): number {
        return this.itemCountValue;
    }

    /** 返回预估高度和已测量高度共同组成的逻辑总高度。 */
    get totalHeight(): number {
        return this.getOffset(this.itemCount);
    }

    /** 数据量变化时保留仍在范围内的测量值，不为未渲染项目分配内存。 */
    setItemCount(nextCount: number): void {
        const count = Math.max(0, Math.floor(nextCount));
        if (count < this.itemCountValue) {
            this.measuredHeights.forEach((_, index) => {
                if (index >= count) this.measuredHeights.delete(index);
            });
        }
        this.itemCountValue = count;
        this.rebuildTree();
    }

    /** 返回指定项目顶部相对完整列表顶部的距离；index 可等于 itemCount。 */
    getOffset(index: number): number {
        let cursor = Math.min(this.itemCount, Math.max(0, Math.floor(index)));
        let deltaSum = 0;
        const itemLength = cursor;
        while (cursor > 0) {
            deltaSum += this.tree.get(cursor) ?? 0;
            cursor -= cursor & -cursor;
        }
        return itemLength * this.estimatedItemHeight + deltaSum;
    }

    /** 写入 DOM 实测高度；返回高度差，0 表示无需刷新布局。 */
    updateItemHeight(index: number, nextHeight: number): number {
        if (index < 0 || index >= this.itemCount || !Number.isFinite(nextHeight) || nextHeight <= 0) {
            return 0;
        }

        const height = Math.round(nextHeight * 100) / 100;
        const currentHeight = this.measuredHeights.get(index) ?? this.estimatedItemHeight;
        const delta = height - currentHeight;
        if (Math.abs(delta) < 0.5) return 0;

        if (Math.abs(height - this.estimatedItemHeight) < 0.5) {
            this.measuredHeights.delete(index);
        } else {
            this.measuredHeights.set(index, height);
        }
        this.addToTree(index + 1, delta);
        return delta;
    }

    /** 根据累计高度定位可见项，再按像素缓冲扩展渲染范围。 */
    getRange(params: {
        /** 完整逻辑坐标系中的滚动位置。 */
        scrollTop: number;
        /** DOM 滚动容器的可见高度。 */
        viewportHeight: number;
        /** 可见区前后额外预渲染的像素高度。 */
        overscanPx: number;
    }): VirtualRange {
        const scrollTop = Math.max(0, params.scrollTop);
        const viewportHeight = Math.max(0, params.viewportHeight);
        const overscanPx = Math.max(0, params.overscanPx);
        const startIndex = this.findIndexAtOffset(Math.max(0, scrollTop - overscanPx));
        const endOffset = Math.min(this.totalHeight, scrollTop + viewportHeight + overscanPx);
        const endIndex = Math.min(this.itemCount, this.findIndexAtOffset(endOffset) + 1);

        return {
            startIndex,
            endIndex,
            offsetY: this.getOffset(startIndex),
            totalHeight: this.totalHeight,
        };
    }

    /** 使用 Fenwick Tree 的 binary lifting 定位包含指定偏移量的项目。 */
    private findIndexAtOffset(offset: number): number {
        if (!this.itemCount) return 0;

        let index = 0;
        let prefixHeight = 0;
        let bit = 1;
        while ((bit << 1) <= this.itemCount) bit <<= 1;

        for (; bit > 0; bit >>= 1) {
            const next = index + bit;
            const implicitEstimatedHeight = (next & -next) * this.estimatedItemHeight;
            const nodeHeight = implicitEstimatedHeight + (this.tree.get(next) ?? 0);
            if (next <= this.itemCount && prefixHeight + nodeHeight <= offset) {
                index = next;
                prefixHeight += nodeHeight;
            }
        }
        return Math.min(index, this.itemCount - 1);
    }

    /** 根据少量已测量高度重建稀疏 Fenwick 增量树。 */
    private rebuildTree(): void {
        this.tree.clear();
        this.measuredHeights.forEach((height, index) => {
            this.addToTree(index + 1, height - this.estimatedItemHeight);
        });
    }

    /** 将单项高度差传播到包含它的所有累计区间。 */
    private addToTree(index: number, delta: number): void {
        for (let cursor = index; cursor <= this.itemCount; cursor += cursor & -cursor) {
            const nextDelta = (this.tree.get(cursor) ?? 0) + delta;
            if (Math.abs(nextDelta) < 0.0001) {
                this.tree.delete(cursor);
            } else {
                this.tree.set(cursor, nextDelta);
            }
        }
    }
}
