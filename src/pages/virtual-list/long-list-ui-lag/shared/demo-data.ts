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
/** 动态高度演示正文的最少行数。 */
export const DYNAMIC_CONTENT_MIN_LINES = 3;
/** 动态高度演示正文的最多行数。 */
export const DYNAMIC_CONTENT_MAX_LINES = 10;
/** 每隔 4 条动态记录插入一张图片，即图片记录占比为 25%。 */
export const DYNAMIC_IMAGE_INTERVAL = 4;
/** 图片在列表中的预留宽度。 */
export const DYNAMIC_IMAGE_WIDTH = 320;
/** 16:9 图片在列表中的预留高度。 */
export const DYNAMIC_IMAGE_HEIGHT = 180;
/** 未提供固有宽高时，通过 CSS aspect-ratio 预留相同的 16:9 空间。 */
export const DYNAMIC_IMAGE_ASPECT_RATIO = '16 / 9';

/** 动态记录中两种图片占位策略共用的业务字段。 */
interface DynamicDemoImageBase {
    /** 使用固定 seed 的稳定图片地址。 */
    src: string;
    /** 图片不可见时提供内容说明，也用于无障碍阅读。 */
    alt: string;
}

/** 使用 HTML 固有宽高，让浏览器在图片下载前计算宽高比。 */
export interface DynamicDemoImageWithDimensions extends DynamicDemoImageBase {
    /** 选择 HTML width/height 固有尺寸占位策略。 */
    layout: 'dimensions';
    /** 图片固有宽度，同时作为 HTML width 属性，单位为 px。 */
    width: number;
    /** 图片固有高度，同时作为 HTML height 属性，单位为 px。 */
    height: number;
    /** dimensions 策略禁止再传 CSS 比例，避免两套配置不一致。 */
    aspectRatio?: never;
}

/** 不依赖 HTML 宽高，使用 CSS aspect-ratio 在图片下载前预留空间。 */
export interface DynamicDemoImageWithAspectRatio extends DynamicDemoImageBase {
    /** 选择 CSS aspect-ratio 占位策略。 */
    layout: 'aspect-ratio';
    /** CSS 宽高比，例如 16:9 对应字符串 `16 / 9`。 */
    aspectRatio: string;
    /** aspect-ratio 策略禁止传 HTML width 属性。 */
    width?: never;
    /** aspect-ratio 策略禁止传 HTML height 属性。 */
    height?: never;
}

/** 每张图片必须且只能选择一种加载前占位策略。 */
export type DynamicDemoImage =
    | DynamicDemoImageWithDimensions
    | DynamicDemoImageWithAspectRatio;

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
    /** 部分记录附带的图片；没有图片时不生成该字段。 */
    image?: DynamicDemoImage;
}

/** 使用固定 seed 保持图片地址稳定，避免同一记录滚回视口后更换图片。 */
const DYNAMIC_IMAGE_URLS = [
    'https://picsum.photos/seed/virtual-list-dashboard/640/360',
    'https://picsum.photos/seed/virtual-list-office/640/360',
    'https://picsum.photos/seed/virtual-list-city/640/360',
    'https://picsum.photos/seed/virtual-list-workspace/640/360',
] as const;

/** 根据完整列表中的 0-based 索引即时创建一条固定高度数据。 */
export const createFixedItem = (index: number): FixedDemoItem => ({
    id: index + 1,
    title: `业务记录 ${String(index + 1).padStart(6, '0')}`,
    summary: `稳定行高与按需渲染，当前数据索引为 ${index}`,
});

/** 根据完整列表中的 0-based 索引即时创建一条不定高度数据。 */
export const createDynamicItem = (index: number): DynamicDemoItem => {
    const hasImage = index % DYNAMIC_IMAGE_INTERVAL === 0;
    const imageIndex = Math.floor(index / DYNAMIC_IMAGE_INTERVAL) % DYNAMIC_IMAGE_URLS.length;
    const usesAspectRatio = imageIndex % 2 === 1;
    const imageBase = {
        src: DYNAMIC_IMAGE_URLS[imageIndex],
        alt: `动态高度记录 ${index + 1} 的业务配图`,
    };

    return {
        id: index + 1,
        title: `动态高度记录 ${String(index + 1).padStart(6, '0')}`,
        lineCount: DYNAMIC_CONTENT_MIN_LINES + (
            (index * 5) % (DYNAMIC_CONTENT_MAX_LINES - DYNAMIC_CONTENT_MIN_LINES + 1)
        ),
        image: hasImage ? (usesAspectRatio ? {
            ...imageBase,
            layout: 'aspect-ratio',
            aspectRatio: DYNAMIC_IMAGE_ASPECT_RATIO,
        } : {
            ...imageBase,
            layout: 'dimensions',
            width: DYNAMIC_IMAGE_WIDTH,
            height: DYNAMIC_IMAGE_HEIGHT,
        }) : undefined,
    };
};

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
