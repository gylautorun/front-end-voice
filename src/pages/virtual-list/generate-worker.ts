// 生成数据的 Web Worker

interface IListItem {
    id: number;
    title: string;
    value: string;
}

interface IPosition {
    index: number;
    top: number;
    bottom: number;
    height: number;
}

interface WorkerMessage {
    num: number;
    repeatNum: number;
    itemHeight: number;
}

interface WorkerResponse {
    success: boolean;
    data: IListItem[];
    positions: IPosition[];
}

function repeat(value: string, count: number): string {
    return value.repeat(count);
}

function generateList(num: number, repeatNum: number): IListItem[] {
    const data: IListItem[] = [];
    const value = Math.random().toString(36).substring(2, 15);
    for (let i = 1; i <= num; i++) {
        data.push({
            id: i,
            title: `标题${i}`,
            value: repeat(`内容${value}`, repeatNum),
        });
    }
    return data;
}

function calculatePositions(data: IListItem[], itemHeight: number): IPosition[] {
    return data.map((_, index) => {
        return {
            index,
            top: index * itemHeight,
            bottom: (index + 1) * itemHeight,
            height: itemHeight,
        };
    });
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const { num, repeatNum, itemHeight } = event.data;
    
    try {
        // 生成数据
        const data = generateList(num, repeatNum);
        // 计算位置
        const positions = calculatePositions(data, itemHeight);
        
        // 返回结果
        self.postMessage({ success: true, data, positions } as WorkerResponse);
    } catch (error) {
        self.postMessage({ success: false, data: [], positions: [] } as WorkerResponse);
    }
};
