import {makeAutoObservable} from 'mobx';

function repeat(value: string, count: number) {
    return value.repeat(count);
}
const getList = () => {
    const data = [];
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