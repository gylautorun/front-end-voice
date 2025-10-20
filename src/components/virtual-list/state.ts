import {get} from 'lodash-es';
import {computed, makeAutoObservable, runInAction} from 'mobx';
import {binarySearch} from './binary-search';
export interface IPosition {
    index: number;
    top: number;
    bottom: number;
    height: number;
}
class State {
    constructor() {
        makeAutoObservable(this, {
            listHeight: computed,
            visibleSize: computed,
            visibleData: computed,
            bufferSize: computed,
            virtualStart: computed,
            virtualEnd: computed,
            length: computed,
            end: computed,
        });
        const {list, itemSize} = this;
        this.positions = list.map((_, index) => {
            return  {
                index,
                top: index * itemSize,
                bottom: (index + 1) * itemSize,
                height: itemSize, 
            };
        });
        this.reaction();
    }
    list = [];
    positions: IPosition[] = [];
    itemSize = 80; // 初始给一个开始高度
    screenHeight = 0;
    currentOffset = 0;
    /**
     * 可视区显示的 start 索引
     */
    start = 0;
    /**
     * 可视区 上下 缓冲可视区屏幕比率
     * 每个缓冲区只缓冲 1 * 最大可见列表项数 个元素
     * - 上下两个缓冲区
     */
    bufferRatio = 1;
    refs: Array<HTMLDivElement | null> = [];

    get length(): number {
        return this.list.length;
    }
    get listHeight(): number {
        return this.positions[this.positions.length - 1].bottom;
    }
    /**
     * 可视区显示的个数
     */
    get visibleSize(): number {
        return Math.ceil(this.screenHeight / this.itemSize);
    };
    /**
     * 可视区域 上下各 在显示个数
     */
    get bufferSize(): number {
        return Math.floor(this.visibleSize * this.bufferRatio); // 向下取整
    };
    /**
     * 可视区显示的 end 索引
     */
    get end(): number {
        return this.start + this.visibleSize;
    }
    /**
     * 下面 使用索引和缓冲数量的最小值 避免缓冲不存在或者过多的数据
     * virtualStart 向上缓冲
     * virtualEnd 向下缓冲
     */
    get virtualStart(): number {
        return Math.max(0, this.start - this.bufferSize);
    };
    get virtualEnd(): number {
        return Math.min(this.length - 1, this.end + this.bufferSize);
    };
    get visibleData() {
        return this.list.slice(this.virtualStart, this.virtualEnd);
    };
    getCurrentOffset = (scrollTop: number) => {
        if(this.start >= 1) {
            // return this.positions[this.start].top;
            // 计算偏移量时包括上缓冲区的列表项
            const safetyStart = this.virtualStart;
            const {top} = this.positions[safetyStart] || {top: 0};
            const offset = this.positions[this.start].top - top;
            return this.positions[this.start - 1].bottom - offset;
        }
        else {
            return 0;
        }
    };
    // getCurrentOffset() {
    //     if(this.start >= 1) {
    //         return this.positions[this.start].top;
    //         // 计算偏移量时包括上缓冲区的列表项
    //         const safetyStart = this.start - this.virtualStart;
    //         const {top} = this.positions[safetyStart] || {top: 0};
    //         const offset = this.positions[this.start].top - top;
    //         return this.positions[this.start - 1].bottom - offset;
    //     }
    //     else {
    //         return 0;
    //     }
    // };
    getStartIndex = (scrollTop = 0) => {
        const idx = binarySearch(this.positions, scrollTop);
        console.log('getStartIndex', {
            idx,
            scrollTop,
        })
        return idx;
    };
    // 滚动回调
    scrollEvent(target: HTMLElement | null) {
        if (!target) {
            return;
        }
        const {scrollTop} = target;
        this.start = this.getStartIndex(scrollTop);
        this.updatePositions();
        this.currentOffset = this.getCurrentOffset(scrollTop);
        console.log('scrollEvent', {
            start: this.start,
            scrollTop,
            end: this.end,
            currentOffset: this.currentOffset,
            positions: this.positions,
        });
    };
    // 渲染后更新positions
    updatePositions() {
        const nodes = this.refs || [];
        for (const node of nodes) {
            if (!node) {
                continue;
            }
            // 获取 真实DOM高度
            const {height} = node.getBoundingClientRect();
            // 根据 元素索引 获取 缓存列表对应的列表项
            const index = Number(get(node, 'dataset.id', 0)) - 1;
            const oldHeight = this.positions[index].height;
            // dValue：真实高度与预估高度的差值 决定该列表项是否要更新
            const dValue = oldHeight - height;
            // 如果有高度差 !!dValue === true
            if(dValue) {
                // 更新对应列表项的 bottom 和 height
                this.positions[index].bottom = this.positions[index].bottom - dValue;
                this.positions[index].height = height;
                // 依次更新positions中后续元素的 top bottom
                for(let k = index + 1; k < this.positions.length; k++) {
                    this.positions[k].top = this.positions[k - 1].bottom;
                    this.positions[k].bottom = this.positions[k].bottom - dValue;
                }
            }
        }
    };

    reaction() {
        // this.reactions.reaction(
        // );
    }

    dispose() {
        this.reactions.dispose();
    }
}

export const store = new State();