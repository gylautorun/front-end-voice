import {get} from 'lodash-es';
import {computed, observable, action, makeAutoObservable, runInAction} from 'mobx';
import {ReactionManager} from '../../../utils/mobx/reaction-manager';
import {generateList, IListItem} from '../method';

const binarySearch = function(list: IPosition[], scrollTop: number): number {  
    const len = list.length;
    let left = 0;
    let right = len - 1;
    let tempIndex = -1;
    while (left <= right) {  
        let midIndex = Math.floor((left + right) / 2);
        let midVal = list[midIndex].bottom;
        console.log('midVal', {
            midIndex,
            item: list[midIndex],
            left,
            right,
            tempIndex
        });
        if (midVal === scrollTop) {
            return midIndex;
        }
        else if (midVal < scrollTop) {
            left = midIndex + 1;
        }
        else {
            // list不一定存在与target相等的项，不断收缩右区间，寻找最匹配的项
            if(tempIndex === -1 || tempIndex > midIndex) {
                tempIndex = midIndex;
            }
            right--;
        }
    }
    console.log('binarySearch', {
        tempIndex: tempIndex,
        scrollTop,
        list,
    });
    // 如果没有搜索到完全匹配的项 就返回最匹配的项
    return tempIndex;
};
interface IPosition {
    index: number;
    top: number;
    bottom: number;
    height: number;
}
class State {
    reactions = new ReactionManager();
    constructor() {
        makeAutoObservable(this, {
            listHeight: computed,
            visibleCount: computed,
            visibleData: computed,
            bufferCount: computed,
            aboveCount: computed,
            belowCount: computed,
            length: computed,
            end: computed,
            currentOffset: computed,
        });
        this.initPositions(this.list, this.preItemSize);
        this.reaction();
    }
    list: IListItem[] = generateList();
    positions: IPosition[] = [];
    preItemSize = 50; // 初始给一个开始高度
    screenHeight = 0;
    // currentOffset = 0;
    start = 0;
    // /即每个缓冲区只缓冲 1 * 最大可见列表项数 个元素
    bufferPercent = 1;
    refs: Array<HTMLDivElement | null> = [];

    created() {
        this.initPositions(this.list, this.preItemSize);
    };
    get length() {
        return this.list.length;
    }
    get listHeight() {
        return this.positions[this.positions.length - 1].bottom;
    }
    get visibleCount() {
        return Math.ceil(this.screenHeight / this.preItemSize);
    };
    get visibleData() {
        return this.list.slice(
            this.start - this.aboveCount,
            this.end + this.belowCount
        );
    };
    /**
     * 可视区域 上下各 在显示个数
     */
    get bufferCount() {
        return Math.floor(this.visibleCount * this.bufferPercent); // 向下取整
    };
    /**
     * 下面 使用索引和缓冲数量的最小值 避免缓冲不存在或者过多的数据
     * aboveCount 向上缓冲
     * belowCount 向下缓冲
     */
    get aboveCount() {
        return Math.min(this.start, this.bufferCount);
    };
    get belowCount() {
        return Math.min(this.length - this.end, this.bufferCount);
    };
    get end(): number {
        return Math.min(this.start + this.visibleCount, this.length - 1);
    }
    get currentOffset() {
        if(this.start >= 1) {
            // return this.positions[this.start].top;
            // 计算偏移量时包括上缓冲区的列表项
            const safetyStart = this.start - this.aboveCount;
            const {top} = this.positions[safetyStart] || {top: 0};
            const offset = this.positions[this.start].top - top;
            return this.positions[this.start - 1].bottom - offset;
        }
        else {
            return 0;
        }
    }
    // 滚动回调
    scrollEvent(target: HTMLElement | null) {
        if (!target) {
            return;
        }
        const {scrollTop} = target;
        this.start = this.getStartIndex(scrollTop);
        this.updatePositions();
        // this.currentOffset = this.getCurrentOffset();
        console.log('scrollEvent', {
            start: this.start,
            scrollTop,
            end: this.end,
            currentOffset: this.currentOffset,
            positions: this.positions,
        });
        // Promise.resolve().then(() => {
        //     runInAction(() => {
        //         // // 根据真实元素大小，修改对应的缓存列表
        //         this.updatePositions();
        //         // 更新完缓存列表后，重新赋值偏移量
        //         this.currentOffset = this.getCurrentOffset();
        //         console.log('Promise', {
        //             start: this.start,
        //             end: this.end,
        //             currentOffset: this.currentOffset,
        //             positions: this.positions,
        //         });
        //     });
        // });
    };
    // 初始化列表
    initPositions(list: Item[], itemSize: number) {
        this.positions = list.map((item, index) => {
            return  {
                index,
                top: index * itemSize,
                bottom: (index + 1) * itemSize,
                height: itemSize, 
            };
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
            const index = Number(get(node, 'dataset.id', -1)) - 1;
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
    getStartIndex(scrollTop = 0) {
        return binarySearch(this.positions, scrollTop);
    };
    // getCurrentOffset() {
    //     if(this.start >= 1) {
    //         return this.positions[this.start].top;
    //         // 计算偏移量时包括上缓冲区的列表项
    //         const safetyStart = this.start - this.aboveCount;
    //         const {top} = this.positions[safetyStart] || {top: 0};
    //         const offset = this.positions[this.start].top - top;
    //         return this.positions[this.start - 1].bottom - offset;
    //     }
    //     else {
    //         return 0;
    //     }
    // };

    reaction() {
        // this.reactions.reaction(
        // );
    }

    dispose() {
        this.reactions.dispose();
    }
}

export const store = new State();