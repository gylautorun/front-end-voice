export function repeat(value: string, count: number) {
    return value.repeat(count);
}
export interface IListItem {
    id: number;
    title: string;
    value: string;
}
export const GENERATE_LIST_NUM = 100 * 1000;
export const generateList = (num = GENERATE_LIST_NUM, repeatNum = 50) => {
    const data = [];
    const value = Math.random().toString(36).substring(2, 15);
    for (let i = 1; i <= num; i++) {
        data.push({
            id: i,
            title: `标题${i}`,
            value: repeat(`内容${value}`, repeatNum),
        });
    }
    return data;
};