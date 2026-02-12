// 生成数据的 Web Worker
interface IListItem {
    id: number;
    index: number;
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

function generateList(num: number, repeatNum: number, startIndex = 0): IListItem[] {
    const data: IListItem[] = [];
    const value = Math.random().toString(36).substring(2, 15);
    for (let i = 1; i <= num; i++) {
        const globalIndex = startIndex + i - 1;
        data.push({
            id: globalIndex + 1,
            index: globalIndex,
            title: `标题${globalIndex + 1}`,
            value: repeat(`内容${value}`, repeatNum),
        });
    }
    return data;
}

function calculatePositions(data: IListItem[], itemHeight: number): IPosition[] {
    return data.map((_, index) => {
        const res = {
            index,
            top: index * itemHeight,
            bottom: (index + 1) * itemHeight,
            height: itemHeight,
        };
        return {
            ...res,
        };
    });
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const { num, repeatNum, itemHeight } = event.data;
    
    try {
        // 减小批次大小，避免内存不足
        const MAX_BATCH_SIZE = 10000; // 每批最多生成1 万条数据
        const batches = Math.ceil(num / MAX_BATCH_SIZE);
        
        // 如果数据量过大，使用分批处理
        if (batches > 1) {
            let allData: IListItem[] = [];
            let allPositions: IPosition[] = [];
            let currentBatch = 0;
            
            // 分批生成数据
            const processBatch = () => {
                const start = currentBatch * MAX_BATCH_SIZE;
                const end = Math.min(start + MAX_BATCH_SIZE, num);
                const batchSize = end - start;
                
                try {
                    // 生成当前批次的数据，传递起始索引
                const batchData = generateList(batchSize, repeatNum, start);
                    
                    // 直接计算当前批次的位置，使用全局索引
                    const batchPositions = batchData.map((item) => {
                        const globalIndex = item.index;
                        return {
                            index: globalIndex,
                            top: globalIndex * itemHeight,
                            bottom: (globalIndex + 1) * itemHeight,
                            height: itemHeight
                        };
                    });
                    
                    // 添加到总数据中
                    allData = allData.concat(batchData);
                    allPositions = allPositions.concat(batchPositions);
                    
                    currentBatch++;
                    
                    // 检查是否还有批次需要处理
                    if (currentBatch < batches) {
                        // 使用 setTimeout 避免阻塞 Worker
                        setTimeout(processBatch, 0);
                    } else {
                        // 所有批次处理完成，返回结果
                        self.postMessage({ success: true, data: allData, positions: allPositions } as WorkerResponse);
                    }
                } catch (batchError) {
                    console.error('Error processing batch:', batchError);
                    self.postMessage({ success: false, data: allData, positions: allPositions } as WorkerResponse);
                }
            };
            
            // 开始处理第一批
            processBatch();
        } else {
            // 数据量不大，一次性生成
            const data = generateList(num, repeatNum, 0);
            const positions = calculatePositions(data, itemHeight);
            
            // 返回结果
            self.postMessage({ success: true, data, positions } as WorkerResponse);
        }
    } catch (error) {
        console.error('Error generating data:', error);
        self.postMessage({ success: false, data: [], positions: [] } as WorkerResponse);
    }
};
