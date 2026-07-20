/** 引入固定高与不定高模型共同返回的虚拟窗口结构。 */
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

    /**
     * 创建不定高度虚拟列表模型。
     *
     * @param itemCount 完整列表的逻辑项目数量。
     * @param estimatedItemHeight 未测量项目统一使用的预估高度，单位为 px。
     * @throws {RangeError} estimatedItemHeight 不是有限正数时抛出。
     */
    constructor(
        itemCount: number,
        private readonly estimatedItemHeight: number,
    ) {
        // 预估高度参与总高度、前缀和及定位计算，因此必须是有限正数。
        if (!Number.isFinite(estimatedItemHeight) || estimatedItemHeight <= 0) {
            // 在模型创建阶段暴露配置问题，避免无效高度进入树结构。
            throw new RangeError('estimatedItemHeight must be greater than 0');
        }
        // 复用 setItemCount 的归一化与重建逻辑初始化项目数量。
        this.setItemCount(itemCount);
    }

    /** 返回模型当前维护的项目数量。 */
    get itemCount(): number {
        // 只暴露只读结果，外部必须通过 setItemCount 修改数量。
        return this.itemCountValue;
    }

    /** 返回预估高度和已测量高度共同组成的逻辑总高度。 */
    get totalHeight(): number {
        // itemCount 位置正好位于最后一项之后，其前缀偏移就是完整总高度。
        return this.getOffset(this.itemCount);
    }

    /** 数据量变化时保留仍在范围内的测量值，不为未渲染项目分配内存。 */
    setItemCount(nextCount: number): void {
        // 逻辑数量必须是非负整数，小数向下取整，负数归零。
        const count = Math.max(0, Math.floor(nextCount));
        // 只有列表缩短时才可能存在超出新范围的历史测量值。
        if (count < this.itemCountValue) {
            // 遍历稀疏测量 Map，而不是扫描完整逻辑数据范围。
            this.measuredHeights.forEach((_, index) => {
                // 删除新列表末尾之外的实测高度，防止旧数据影响总高度。
                if (index >= count) {
                    this.measuredHeights.delete(index);
                }
            });
        }
        // 保存归一化后的新逻辑数量。
        this.itemCountValue = count;
        // Fenwick 节点覆盖区间依赖 itemCount，数量变化后必须重新构建。
        this.rebuildTree();
    }

    /** 返回指定项目顶部相对完整列表顶部的距离；index 可等于 itemCount。 */
    getOffset(index: number): number {
        // 将查询索引转换为 [0, itemCount] 范围内的整数。
        let cursor = Math.min(this.itemCount, Math.max(0, Math.floor(index)));
        // 累加已测量高度相对统一预估值产生的前缀差值。
        let deltaSum = 0;
        // cursor 会在查询树时递减，因此先保存原始项目数量用于计算基线高度。
        const itemLength = cursor;
        // Fenwick 前缀查询每次移除最低有效位，最多执行 O(log n) 次。
        while (cursor > 0) {
            // 当前树节点不存在表示该覆盖区间没有任何实测高度差。
            deltaSum += this.tree.get(cursor) ?? 0;
            // cursor & -cursor 得到最低有效位，跳转到上一个前缀节点。
            cursor -= cursor & -cursor;
        }
        // 统一预估基线加实测差值，得到 index 之前所有项目的真实/预估混合高度。
        return itemLength * this.estimatedItemHeight + deltaSum;
    }

    /** 写入 DOM 实测高度；返回高度差，0 表示无需刷新布局。 */
    updateItemHeight(index: number, nextHeight: number): number {
        // 拒绝越界索引以及 NaN、Infinity、0、负数高度，避免污染高度模型。
        if (
            index < 0
            || index >= this.itemCount
            || !Number.isFinite(nextHeight)
            || nextHeight <= 0
        ) {
            // 返回 0 表示调用方不需要刷新布局或补偿滚动位置。
            return 0;
        }

        // 保留两位小数，减少 ResizeObserver 亚像素噪声导致的无意义更新。
        const height = Math.round(nextHeight * 100) / 100;
        // 已测量项目使用上次真实值，否则使用统一预估值作为旧高度。
        const currentHeight = this.measuredHeights.get(index) ?? this.estimatedItemHeight;
        // 高度差既用于修正 Fenwick Tree，也用于计算滚动锚点补偿。
        const delta = height - currentHeight;
        // 小于 0.5px 的变化视为布局噪声，不触发树更新和 React 刷新。
        if (Math.abs(delta) < 0.5) {
            return 0;
        }

        // 实测值接近预估值时无需占用 measuredHeights 的稀疏存储空间。
        if (Math.abs(height - this.estimatedItemHeight) < 0.5) {
            // 删除可能存在的旧实测记录，使该项目重新回到统一基线。
            this.measuredHeights.delete(index);
        } else {
            // 只有明显偏离预估值的项目才保存真实高度。
            this.measuredHeights.set(index, height);
        }
        // Fenwick Tree 使用 1-based 索引，因此将业务索引加 1 后传播高度差。
        this.addToTree(index + 1, delta);
        // 将本次有效高度差返回给 React 层，用于决定滚动补偿。
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
        // 逻辑滚动位置不能小于列表顶部。
        const scrollTop = Math.max(0, params.scrollTop);
        // 未测得视口或异常负高度统一按 0 处理。
        const viewportHeight = Math.max(0, params.viewportHeight);
        // 不定高列表按像素而不是条数扩展缓冲区，并保证缓冲值非负。
        const overscanPx = Math.max(0, params.overscanPx);
        // 从视口顶部向前扩展 overscanPx，再定位包含该偏移量的第一项。
        const startIndex = this.findIndexAtOffset(Math.max(0, scrollTop - overscanPx));
        // 视口底部向后扩展 overscanPx，但不能超过完整列表总高度。
        const endOffset = Math.min(this.totalHeight, scrollTop + viewportHeight + overscanPx);
        // 定位末端偏移所在项并加 1，形成与 Array.slice 一致的开区间上界。
        const endIndex = Math.min(this.itemCount, this.findIndexAtOffset(endOffset) + 1);

        // 返回 React 视图层渲染当前窗口所需的全部几何信息。
        return {
            // 当前渲染窗口第一条记录的索引。
            startIndex,
            // 当前渲染窗口结束索引，不包含该索引对应的记录。
            endIndex,
            // 通过混合高度前缀和计算渲染窗口在完整列表中的逻辑偏移。
            offsetY: this.getOffset(startIndex),
            // 总高度包含统一预估基线和全部有效实测差值。
            totalHeight: this.totalHeight,
        };
    }

    /** 使用 Fenwick Tree 的 binary lifting 定位包含指定偏移量的项目。 */
    private findIndexAtOffset(offset: number): number {
        // 空列表没有任何可定位项目，统一返回索引 0。
        if (!this.itemCount) {
            return 0;
        }

        // index 表示当前确认其前缀高度不超过目标偏移的 Fenwick 索引。
        let index = 0;
        // prefixHeight 保存 index 对应的累计混合高度，避免重复查询前缀和。
        let prefixHeight = 0;
        // bit 从不超过 itemCount 的最大 2 次幂开始逐位尝试。
        let bit = 1;
        // 左移一位等价于乘 2，用于寻找 binary lifting 的最高搜索位。
        while ((bit << 1) <= this.itemCount) {
            bit <<= 1;
        }

        // 每轮将搜索位减半，最终得到累计高度不超过 offset 的最大索引。
        for (; bit > 0; bit >>= 1) {
            // 尝试从已确认索引向前跳过当前 bit 覆盖的区间。
            const next = index + bit;
            // Fenwick 节点覆盖 lowbit(next) 个项目，先计算这些项目的预估基线高度。
            const implicitEstimatedHeight = (next & -next) * this.estimatedItemHeight;
            // 基线高度加稀疏树中保存的实测差值，得到该节点的混合真实高度。
            const nodeHeight = implicitEstimatedHeight + (this.tree.get(next) ?? 0);
            // 候选索引有效且累计高度仍未超过目标时，接受本次跳跃。
            if (next <= this.itemCount && prefixHeight + nodeHeight <= offset) {
                // 更新已确认的最大 Fenwick 索引。
                index = next;
                // 同步累计已接受区间的高度，供下一位判断使用。
                prefixHeight += nodeHeight;
            }
        }
        // 最多返回最后一项索引，避免目标偏移位于总高度末端时越界。
        return Math.min(index, this.itemCount - 1);
    }

    /** 根据少量已测量高度重建稀疏 Fenwick 增量树。 */
    private rebuildTree(): void {
        // 先删除旧 itemCount 范围下生成的全部 Fenwick 节点。
        this.tree.clear();
        // 只遍历已有实测项目，不扫描完整逻辑列表。
        this.measuredHeights.forEach((height, index) => {
            // 将每项相对统一预估值的差异重新写入新的树覆盖范围。
            this.addToTree(index + 1, height - this.estimatedItemHeight);
        });
    }

    /** 将单项高度差传播到包含它的所有累计区间。 */
    private addToTree(index: number, delta: number): void {
        // 从当前 1-based 索引开始，沿父节点更新所有包含该项目的 Fenwick 区间。
        for (let cursor = index; cursor <= this.itemCount; cursor += cursor & -cursor) {
            // 将新差值累加到节点原有差值上；不存在的稀疏节点按 0 处理。
            const nextDelta = (this.tree.get(cursor) ?? 0) + delta;
            // 接近 0 的节点不再提供有效修正，删除它可保持 Map 稀疏。
            if (Math.abs(nextDelta) < 0.0001) {
                // 删除无有效差值的节点，避免长期测量后积累无意义键值。
                this.tree.delete(cursor);
            } else {
                // 保存该 Fenwick 覆盖区间最新的累计高度差。
                this.tree.set(cursor, nextDelta);
            }
        }
    }
}
