export interface IListItem {
    id: number;
    title: string;
    value: string;
}

export interface IPosition {
    index: number;
    top: number;
    bottom: number;
    height: number;
}

import { createPromise } from '@/utils/util-create-promise';

export const GENERATE_LIST_NUM = 3 * 10 * 1000;

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