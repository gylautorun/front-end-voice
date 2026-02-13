import { createPromise } from '@/utils/util-create-promise';


export interface IListItem {
    id: number;
    index: number;
    title: string;
    value: string;
}

export interface IPosition {
    index: number;
    top: number;
    bottom: number;
    height: number;
}

// 浏览器对 DOM 元素高度有限制，通常在33554440000px 左右
export const BROWSER_MAX_RENDERING_HEIGHT = 33554440000; // 33554440000px
/**
 * dom 区域最大高度 33.5544 * 10000 * 100 = 33554440000px
 * - 超过就显示不了了
 */
export const GENERATE_LIST_NUM = 5 * 10000;

// 使用 Vite 5 推荐的方式创建 Worker
export const generateList = async (num = GENERATE_LIST_NUM, repeatNum = 50, itemHeight = 150): Promise<{ data: IListItem[], positions: IPosition[] }> => {
    const { promise, resolve, reject } = createPromise<{ data: IListItem[], positions: IPosition[] }>();
    
    try {
        // 动态导入 Worker
        import('./generate-worker.ts?worker').then(({ default: WorkerClass }) => {
            // 创建 Worker 实例
            const worker = new WorkerClass();
            
            // 接收 Worker 消息
            worker.onmessage = (event) => {
                const { success, data, positions } = event.data;
                if (success) {
                    resolve({ data, positions });
                } else {
                    reject(new Error('Failed to generate list'));
                }
                // 关闭 Worker
                worker.terminate();
            };
            
            // 发送消息给 Worker
            worker.postMessage({ num, repeatNum, itemHeight });
            
            // 处理错误
            worker.onerror = (error) => {
                reject(error);
                worker.terminate();
            };
        }).catch(reject);
    } catch (error) {
        reject(error);
    }
    
    return promise;
};

// 获取实际的总高度，用于滚动计算
export const getActualListHeight = (positions: IPosition[]): number => {
    return positions[positions.length - 1]?.bottom || 0;
};

// 获取限制后的列表高度，避免超过浏览器限制
export const getListHeight = (positions: IPosition[]): number => {
    const MAX_HEIGHT = 10000000; // 1000万像素，约10公里
    const calculatedHeight = positions[positions.length - 1]?.bottom || 0;
    return Math.min(calculatedHeight, MAX_HEIGHT);
};
