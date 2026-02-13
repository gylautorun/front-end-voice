import {get} from 'lodash-es';
import {computed, observable, action, makeAutoObservable, runInAction} from 'mobx';
import {ReactionManager} from '../../../utils/mobx/reaction-manager';
import {
    generateList,
    IListItem,
    GENERATE_LIST_NUM,
    getActualListHeight,
} from '../method';

const binarySearch = function(list: IPosition[], scrollTop: number): number {  
    const len = list.length;
    if (len === 0) return 0;
    
    let left = 0;
    let right = len - 1;
    let result = 0;
    
    while (left <= right) {  
        const midIndex = Math.floor((left + right) / 2);
        const midVal = list[midIndex].bottom;
        
        if (midVal === scrollTop) {
            return midIndex;
        }
        else if (midVal < scrollTop) {
            left = midIndex + 1;
            result = midIndex + 1;
        }
        else {
            right = midIndex - 1;
        }
    }
    
    return Math.min(result, len - 1);
};
interface IPosition {
    index: number;
    top: number;
    bottom: number;
    height: number;
}
class State {
    reactions = new ReactionManager();
    list: IListItem[] = [];
    positions: IPosition[] = [];
    preItemSize = 50; // 初始给一个开始高度
    screenHeight = 0;
    // currentOffset = 0;
    start = 0;
    // 即每个缓冲区只缓冲 1 * 最大可见列表项数 个元素
    bufferPercent = 1;
    refMap = new Map<number, HTMLDivElement>();
    loading = true;

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
            loading: observable,
            refMap: observable,
            addRef: action,
            updatePositions: action,
            scrollEvent: action,
        });
        this.created();
        this.reaction();
    }
    
    async created() {
        try {
            const { data, positions } = await generateList(GENERATE_LIST_NUM, 50, this.preItemSize);
            this.list = data;
            this.positions = positions;
        } catch (error) {
            console.error('Failed to generate list:', error);
        } finally {
            this.loading = false;
        }
    }

    addRef(element: HTMLDivElement) {
        const id = Number(element.dataset.id || -1);
        if (!this.refMap.has(id)) {
            this.refMap.set(id, element);
        }
    }

    get length() {
        return this.list.length;
    }

    get listHeight() {
        return getActualListHeight(this.positions);
    }

    get visibleCount() {
        // 确保即使 screenHeight 为 0 时也能返回一个合理的值，避免渲染全部数据
        return Math.max(1, Math.ceil(this.screenHeight / this.preItemSize));
    }

    get visibleData() {
        const startIndex = Math.max(0, this.start - this.aboveCount);
        const endIndex = Math.min(this.length, this.end + this.belowCount);
        console.log('visibleData debug:', {
            start: this.start,
            end: this.end,
            aboveCount: this.aboveCount,
            belowCount: this.belowCount,
            startIndex,
            endIndex,
            visibleCount: this.visibleCount,
            screenHeight: this.screenHeight,
            length: this.length
        });
        return this.list.slice(startIndex, endIndex);
    }
    /**
     * 可视区域 上下各 在显示个数
     */
    get bufferCount() {
        return Math.floor(this.visibleCount * this.bufferPercent); // 向下取整
    }
    /**
     * 下面 使用索引和缓冲数量的最小值 避免缓冲不存在或者过多的数据
     * aboveCount 向上缓冲
     * belowCount 向下缓冲
     */
    get aboveCount() {
        return Math.min(this.start, this.bufferCount);
    }

    get belowCount() {
        return Math.min(this.length - this.end, this.bufferCount);
    }

    get end(): number {
        return Math.min(this.start + this.visibleCount, this.length - 1);
    }

    get currentOffset() {
        const startIndex = this.start - this.aboveCount;
        return this.positions[startIndex]?.top || 0;
    }

    // 滚动回调
    scrollEvent(target: HTMLElement | null) {
        if (!target) {
            return;
        }
        console.log(11111111111)
        const {scrollTop} = target;
        console.time('scrollEvent');
        this.start = this.getStartIndex(scrollTop);
        this.updatePositions();
        console.timeEnd('scrollEvent');
    }
    
    // 渲染后更新positions
    updatePositions() {
        console.time('updatePositions');
        const nodes = Array.from(this.refMap.values());
        // for (const node of nodes) {
        //     if (!node) {
        //         continue;
        //     }
        //     // 获取 真实DOM高度
        //     const {height} = node.getBoundingClientRect();
        //     // 根据 元素索引 获取 缓存列表对应的列表项
        //     const index = Number(node.dataset.id || -1) - 1;
            
        //     if (index < 0 || index >= this.positions.length) {
        //         continue;
        //     }
            
        //     const oldHeight = this.positions[index].height;
        //     // dValue：真实高度与预估高度的差值 决定该列表项是否要更新
        //     const dValue = oldHeight - height;
        //     // 如果有高度差 !!dValue === true
        //     if(dValue) {
        //         // 更新对应列表项的 bottom 和 height
        //         this.positions[index].bottom = this.positions[index].bottom - dValue;
        //         this.positions[index].height = height;
        //         // 依次更新positions中后续元素的 top bottom
        //         for(let k = index + 1; k < this.positions.length; k++) {
        //             this.positions[k].top = this.positions[k - 1].bottom;
        //             this.positions[k].bottom = this.positions[k].bottom - dValue;
        //         }
        //     }
        // }
        // 2500ms

        const processedIndices = new Set<number>();
        const batchSize = 10;
        let currentIndex = 0;
        
        const processBatch = () => {
            const endIndex = Math.min(currentIndex + batchSize, nodes.length);
            
            runInAction(() => {
                for (let i = currentIndex; i < endIndex; i++) {
                    const node = nodes[i];
                    if (!node) continue;
                    
                    const {height} = node.getBoundingClientRect();
                    const index = Number(node.dataset.id || -1) - 1;
                    
                    if (index < 0 || index >= this.positions.length || processedIndices.has(index)) {
                        continue;
                    }
                    
                    processedIndices.add(index);
                    const oldHeight = this.positions[index].height;
                    const dValue = oldHeight - height;
                    
                    if (dValue) {
                        this.positions[index].bottom -= dValue;
                        this.positions[index].height = height;
                        
                        for (let k = index + 1; k < this.positions.length; k++) {
                            this.positions[k].top = this.positions[k - 1].bottom;
                            this.positions[k].bottom -= dValue;
                        }
                    }
                }
            });
            
            currentIndex = endIndex;
            
            if (currentIndex < nodes.length) {
                requestAnimationFrame(processBatch);
            } else {
                console.timeEnd('updatePositions');
            }
        };
        
        // 500ms
        processBatch();
        console.timeEnd('updatePositions');
    }

    getStartIndex(scrollTop = 0) {
        const idx = binarySearch(this.positions, scrollTop);
        return idx;
    }

    reaction() {
        // this.reactions.reaction(
        // );
    }

    dispose() {
        this.reactions.dispose();
        this.refMap.clear();
    }
}

export const store = new State();
