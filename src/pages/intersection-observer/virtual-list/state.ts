import {makeAutoObservable} from 'mobx';

function repeat(value: string, count: number) {
    return value.repeat(count);
}

/** IntersectionObserver 虚拟列表中的单条数据。 */
export interface VirtualListItem {
    id: number;
    value: string;
    visible: boolean;
}

const getList = (): VirtualListItem[] => {
    // 显式标注元素类型，防止空数组被推断为 never[]。
    const data: VirtualListItem[] = [];
    for (let i = 1; i <= 10000; i++) {
        data.push({
            id: i,
            value: `${i}${repeat('字符内容', Math.random() * 50)}`,
            visible: false,
        });
    }
    return data;
};
class State {
    constructor() {
        makeAutoObservable(this);
    }
    data = getList();
}

export const store = new State();
