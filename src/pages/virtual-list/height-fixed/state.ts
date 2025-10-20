import {computed, observable, action, makeAutoObservable} from 'mobx';
import {ReactionManager} from '../../../utils/mobx/reaction-manager';
import {generateList, IListItem} from '../method';

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
            total: computed,
            end: computed,
        });
        this.created();
        this.reaction();
    }
    list: IListItem[] = [];
    positions: IPosition[] = [];
    itemHeight = 150; // 高度
    screenHeight = 0;
    start = 0;
    // 即每个缓冲区只缓冲 1 * 最大可见列表项数 个元素
    bufferPercent = 1;

    created() {
        const data = generateList();
        this.list = data;
        this.positions = data.map((_, index) => {
            return  {
                index,
                top: index * this.itemHeight,
                bottom: (index + 1) * this.itemHeight,
                height: this.itemHeight,
            };
        });
    };
    get total() {
        return this.list.length;
    }
    get listHeight() {
        return this.total * this.itemHeight;
    }
    get visibleCount() {
        return Math.ceil(this.screenHeight / this.itemHeight);
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
        return Math.min(this.total - this.end, this.bufferCount);
    };
    get visibleData() {
        return this.list.slice(
            this.start - this.aboveCount,
            this.end + this.belowCount
        );
    };
    get end(): number {
        return Math.min(this.start + this.visibleCount, this.total - 1);
    }
    // 滚动回调
    scrollEvent(target: HTMLElement | null) {
        if (!target) {
            return;
        }
        const {scrollTop} = target;
        const {start, itemHeight} = this;
        const currIndex = Math.floor(scrollTop / itemHeight);
        if (start !== currIndex) {
            this.start = currIndex;
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