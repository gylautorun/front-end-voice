import {computed, makeAutoObservable} from 'mobx';
import {ReactionManager} from '../../../utils/mobx/reaction-manager';
import {generateList, IListItem, IPosition, GENERATE_LIST_NUM} from '../method';
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
    itemHeight = 100; // 高度
    dataSize = GENERATE_LIST_NUM;
    screenHeight = 0;
    start = 0;
    loading = true;
    // 即每个缓冲区只缓冲 1 * 最大可见列表项数 个元素
    bufferPercent = 1;

    /** 使用现有 Worker 按指定规模重新生成列表，不改变虚拟滚动计算逻辑。 */
    async created(size = this.dataSize) {
        const loadVersion = ++this.loadVersion;
        this.dataSize = size;
        this.loading = true;
        this.start = 0;
        this.list = [];
        this.positions = [];
        try {
            const { data, positions } = await generateList(size, 50, this.itemHeight);
            if (loadVersion !== this.loadVersion) return;
            this.list = data;
            this.positions = positions;
        } catch (error) {
            if (loadVersion !== this.loadVersion) return;
            console.error('Failed to generate list:', error);
        } finally {
            if (loadVersion === this.loadVersion) this.loading = false;
        }
    }

    /** 下拉框切换后重新执行原有数据生成流程。 */
    changeDataSize(size: number) {
        if (size === this.dataSize) return;
        void this.created(size);
    }
    get total() {
        return this.list.length;
    }
    get listHeight() {
        return this.total * this.itemHeight;
    }
    get visibleCount() {
        // 确保即使 screenHeight 为 0 时也能返回一个合理的值，避免渲染全部数据
        return Math.max(1, Math.ceil(this.screenHeight / this.itemHeight));
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
        return Math.min(this.total - this.end, this.bufferCount);
    }
    get visibleData() {
        // console.log('visibleData', {
        //     start: this.start,
        //     end: this.end,
        //     visibleCount: this.visibleCount,
        //     aboveCount: this.aboveCount,
        //     belowCount: this.belowCount,
        //     total: this.total,
        //     screenHeight: this.screenHeight,
        //     itemHeight: this.itemHeight,
        //     listHeight: this.listHeight,
        // });
        return this.list.slice(
            this.start - this.aboveCount,
            this.end + this.belowCount
        );
    }
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
    }

    reaction() {
        // this.reactions.reaction(
        // );
    }

    /** 标识最近一次加载，防止快速切换时旧 Worker 结果覆盖新数据。 */
    private loadVersion = 0;

    dispose() {
        this.reactions.dispose();
    }
}

export const store = new State();
