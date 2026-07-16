/** 固定高与不定高页面共用的数据规模选项，最大用于验证十亿级逻辑数据。 */
export const DATA_SIZE_OPTIONS = [
    10_000,
    100_000,
    500_000,
    1_000_000,
    5_000_000,
    10_000_000,
    20_000_000,
    50_000_000,
    100_000_000,
    1_000_000_000,
] as const;
/** 页面首次打开时默认生成的数据量。 */
export const DEFAULT_DATA_SIZE = 100_000;

/** 两种演示数据共用的稳定业务字段。 */
export interface BaseDemoItem {
    /** 从 1 开始的稳定标识，同时用作 React key。 */
    id: number;
    /** 列表项主标题。 */
    title: string;
}

export interface FixedDemoItem extends BaseDemoItem {
    /** 固定为单行展示的辅助摘要。 */
    summary: string;
}

export interface DynamicDemoItem extends BaseDemoItem {
    /** 当前项目实际渲染的正文行数，范围为 3 到 10。 */
    lineCount: number;
}

/** 根据完整列表中的 0-based 索引即时创建一条固定高度数据。 */
export const createFixedItem = (index: number): FixedDemoItem => ({
        id: index + 1,
        title: `业务记录 ${String(index + 1).padStart(6, '0')}`,
        summary: `稳定行高与按需渲染，当前数据索引为 ${index}`,
});

/** 根据完整列表中的 0-based 索引即时创建一条不定高度数据。 */
export const createDynamicItem = (index: number): DynamicDemoItem => ({
        id: index + 1,
        title: `动态高度记录 ${String(index + 1).padStart(6, '0')}`,
        lineCount: 3 + ((index * 5) % 8),
});

/** 只生成当前虚拟窗口所需的数据，内存不随逻辑总量增长。 */
export const createDataRange = <T>(
    startIndex: number,
    endIndex: number,
    createItem: (index: number) => T,
): T[] => {
    const start = Math.max(0, Math.floor(startIndex));
    const end = Math.max(start, Math.floor(endIndex));
    return Array.from({length: end - start}, (_, offset) => createItem(start + offset));
};
