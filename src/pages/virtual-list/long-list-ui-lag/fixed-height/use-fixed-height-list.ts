import React from 'react';
import {
    FixedHeightVirtualizer,
    getCompressedScrollMetrics,
    getPhysicalRenderOffset,
    toLogicalScrollTop,
} from '../core';
import {
    createDataRange,
    createFixedItem,
    DEFAULT_DATA_SIZE,
} from '../shared/demo-data';

/** 每个列表项包含下边框在内的固定高度。 */
export const FIXED_ITEM_HEIGHT = 72;
/** 慢速滚动时前后保留的最小缓冲行数。 */
const MIN_OVERSCAN = 6;
/** 高速滚动时允许的最大缓冲行数。 */
const MAX_OVERSCAN = 28;
/** 固定高度列表同样限制物理占位层高度，避免亿级逻辑高度被浏览器截断。 */
const MAX_PHYSICAL_SCROLL_HEIGHT = 8_000_000;
const virtualizer = new FixedHeightVirtualizer(FIXED_ITEM_HEIGHT);

/** 固定高度页面的 React 状态适配层；区间计算仍由纯 TypeScript 核心完成。 */
export const useFixedHeightList = () => {
    // 步骤 1：只保存逻辑总数，可见项目稍后按索引即时生成。
    const [itemCount, setItemCount] = React.useState(DEFAULT_DATA_SIZE);

    // 步骤 2：分别维护浏览器物理位置和完整列表逻辑位置。
    const [viewportHeight, setViewportHeight] = React.useState(0);
    const [physicalScrollTop, setPhysicalScrollTop] = React.useState(0);
    const [logicalScrollTop, setLogicalScrollTop] = React.useState(0);
    const [overscan, setOverscan] = React.useState(MIN_OVERSCAN);
    const [selectedIds, setSelectedIds] = React.useState<Set<number>>(() => new Set());
    const viewportRef = React.useRef<HTMLElement>(null);

    // 步骤 3：高频 scroll 事件先写 ref，同一绘制帧最多提交一次 React 更新。
    const frameIdRef = React.useRef(0);
    const latestPhysicalScrollTopRef = React.useRef(0);
    const latestLogicalScrollTopRef = React.useRef(0);
    const previousLogicalScrollTopRef = React.useRef(0);

    const range = React.useMemo(() => virtualizer.getRange({
        scrollTop: logicalScrollTop,
        viewportHeight,
        itemCount,
        overscan,
    }), [itemCount, logicalScrollTop, overscan, viewportHeight]);

    const scrollMetrics = React.useMemo(() => getCompressedScrollMetrics({
        logicalTotalHeight: range.totalHeight,
        viewportHeight,
        maxPhysicalHeight: MAX_PHYSICAL_SCROLL_HEIGHT,
    }), [range.totalHeight, viewportHeight]);

    const renderOffsetY = getPhysicalRenderOffset({
        physicalScrollTop,
        logicalScrollTop,
        logicalRangeOffset: range.offsetY,
    });

    const renderedItems = React.useMemo(
        () => createDataRange(range.startIndex, range.endIndex, createFixedItem),
        [range.endIndex, range.startIndex],
    );

    const viewportHeightRef = React.useRef(viewportHeight);
    const rangeRef = React.useRef(range);
    const scrollMetricsRef = React.useRef(scrollMetrics);
    viewportHeightRef.current = viewportHeight;
    rangeRef.current = range;
    scrollMetricsRef.current = scrollMetrics;

    const commitScroll = React.useCallback(() => {
        frameIdRef.current = 0;
        const nextLogicalScrollTop = latestLogicalScrollTopRef.current;
        const distance = Math.abs(
            nextLogicalScrollTop - previousLogicalScrollTopRef.current,
        );
        previousLogicalScrollTopRef.current = nextLogicalScrollTop;
        setOverscan(Math.min(
            MAX_OVERSCAN,
            MIN_OVERSCAN + Math.ceil(distance / FIXED_ITEM_HEIGHT),
        ));
        setPhysicalScrollTop(latestPhysicalScrollTopRef.current);
        setLogicalScrollTop(nextLogicalScrollTop);
    }, []);

    const handleScroll = React.useCallback((event: React.UIEvent<HTMLElement>) => {
        const viewport = event.currentTarget;
        const nextPhysicalScrollTop = viewport.scrollTop;
        latestPhysicalScrollTopRef.current = nextPhysicalScrollTop;
        latestLogicalScrollTopRef.current = toLogicalScrollTop({
            physicalScrollTop: nextPhysicalScrollTop,
            maxPhysicalScrollTop: Math.max(0, viewport.scrollHeight - viewport.clientHeight),
            maxLogicalScrollTop: Math.max(
                0,
                rangeRef.current.totalHeight - viewportHeightRef.current,
            ),
            scrollScale: scrollMetricsRef.current.scrollScale,
        });
        if (!frameIdRef.current) {
            frameIdRef.current = requestAnimationFrame(commitScroll);
        }
    }, [commitScroll]);

    // 步骤 4：只观察滚动容器尺寸，窗口和侧栏变化后自动重算可见行数。
    React.useLayoutEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return undefined;

        const observer = new ResizeObserver(([entry]) => {
            viewportHeightRef.current = entry.contentRect.height;
            setViewportHeight(entry.contentRect.height);
        });
        observer.observe(viewport);
        return () => observer.disconnect();
    }, []);

    React.useEffect(() => () => {
        if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
    }, []);

    const toggleSelected = React.useCallback((id: number) => {
        setSelectedIds((current) => {
            const next = new Set(current);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }, []);

    const scrollToTop = React.useCallback(() => {
        viewportRef.current?.scrollTo({top: 0, behavior: 'smooth'});
    }, []);

    // 步骤 5：切换规模只更新数字，不创建与总量等长的数据数组。
    const changeDataSize = React.useCallback((size: number) => {
        setItemCount(size);
        setSelectedIds(new Set());
        setPhysicalScrollTop(0);
        setLogicalScrollTop(0);
        setOverscan(MIN_OVERSCAN);
        latestPhysicalScrollTopRef.current = 0;
        latestLogicalScrollTopRef.current = 0;
        previousLogicalScrollTopRef.current = 0;
        viewportRef.current?.scrollTo({top: 0});
    }, []);

    return {
        changeDataSize,
        handleScroll,
        itemCount,
        overscan,
        range,
        renderedItems,
        renderOffsetY,
        scrollMetrics,
        selectedIds,
        selectedSize: itemCount,
        scrollToTop,
        toggleSelected,
        viewportRef,
    };
};
