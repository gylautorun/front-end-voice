import React from 'react';
import {
    DynamicHeightVirtualizer,
    getCompressedScrollMetrics,
    getPhysicalRenderOffset,
    toLogicalScrollTop,
    type CompressedScrollMetrics,
    type VirtualRange,
} from '../core';
import {
    createDataRange,
    createDynamicItem,
    DEFAULT_DATA_SIZE,
    type DynamicDemoItem,
} from '../shared/demo-data';

/** 3 至 10 行内容在当前样式下使用的中位预估高度。 */
const ESTIMATED_ITEM_HEIGHT = 205;
/** 不定高度列表按像素预渲染，避免高低差异让条数缓冲失真。 */
const OVERSCAN_PX = 600;
/** 低于浏览器单元素高度上限的安全物理滚动高度。 */
const MAX_PHYSICAL_SCROLL_HEIGHT = 8_000_000;

export interface RenderedDynamicItem {
    item: DynamicDemoItem;
    /** 项目在完整数据源中的真实索引。 */
    index: number;
}

/** 动态高度页面的 React 适配层，累计高度模型和坐标换算均来自框架无关核心。 */
export const useDynamicHeightList = () => {
    // 步骤 1：只保存逻辑总数，避免千万到十亿级数据对象占用内存。
    const [itemCount, setItemCount] = React.useState(DEFAULT_DATA_SIZE);
    // useRef 的普通参数会在每次渲染时求值，因此显式惰性创建模型实例。
    const virtualizerRef = React.useRef<DynamicHeightVirtualizer | null>(null);
    if (!virtualizerRef.current) {
        virtualizerRef.current = new DynamicHeightVirtualizer(
            DEFAULT_DATA_SIZE,
            ESTIMATED_ITEM_HEIGHT,
        );
    }
    const measuredIndexesRef = React.useRef(new Set<number>());

    // 步骤 2：分别保存浏览器物理位置和完整列表逻辑位置。
    const [viewportHeight, setViewportHeight] = React.useState(0);
    const [physicalScrollTop, setPhysicalScrollTop] = React.useState(0);
    const [logicalScrollTop, setLogicalScrollTop] = React.useState(0);
    const [layoutVersion, setLayoutVersion] = React.useState(0);
    const [measuredCount, setMeasuredCount] = React.useState(0);
    // 选择状态以稳定业务 id 保存，不依赖当前虚拟窗口中的 DOM 是否存在。
    const [selectedIds, setSelectedIds] = React.useState<Set<number>>(() => new Set());
    const viewportRef = React.useRef<HTMLElement>(null);
    const visibleListRef = React.useRef<HTMLDivElement>(null);

    const range = React.useMemo<VirtualRange>(() => {
        // virtualizer 是非响应式实例，显式读取版本号以表达高度树变化后的刷新依赖。
        void layoutVersion;
        return virtualizerRef.current!.getRange({
            scrollTop: logicalScrollTop,
            viewportHeight,
            overscanPx: OVERSCAN_PX,
        });
    }, [layoutVersion, logicalScrollTop, viewportHeight]);

    const scrollMetrics = React.useMemo<CompressedScrollMetrics>(
        () => getCompressedScrollMetrics({
            logicalTotalHeight: range.totalHeight,
            viewportHeight,
            maxPhysicalHeight: MAX_PHYSICAL_SCROLL_HEIGHT,
        }),
        [range.totalHeight, viewportHeight],
    );

    const renderOffsetY = getPhysicalRenderOffset({
        physicalScrollTop,
        logicalScrollTop,
        logicalRangeOffset: range.offsetY,
    });

    const renderedItems = React.useMemo<RenderedDynamicItem[]>(
        () => createDataRange(
            range.startIndex,
            range.endIndex,
            (index) => ({item: createDynamicItem(index), index}),
        ),
        [range.endIndex, range.startIndex],
    );

    // 步骤 3：观察器与 rAF 回调通过 ref 读取最新值，避免频繁销毁和重建。
    const viewportHeightRef = React.useRef(viewportHeight);
    const rangeRef = React.useRef(range);
    const scrollMetricsRef = React.useRef(scrollMetrics);
    const latestPhysicalScrollTopRef = React.useRef(0);
    const latestLogicalScrollTopRef = React.useRef(0);
    const frameIdRef = React.useRef(0);
    const viewportObserverRef = React.useRef<ResizeObserver>();
    const rowObserverRef = React.useRef<ResizeObserver>();
    viewportHeightRef.current = viewportHeight;
    rangeRef.current = range;
    scrollMetricsRef.current = scrollMetrics;

    const commitScroll = React.useCallback(() => {
        frameIdRef.current = 0;
        setPhysicalScrollTop(latestPhysicalScrollTopRef.current);
        setLogicalScrollTop(latestLogicalScrollTopRef.current);
    }, []);

    // 步骤 4：原生滚动位置在下一帧统一映射并提交到 React。
    const handleScroll = React.useCallback((event: Event) => {
        const viewport = event.currentTarget as HTMLElement;
        const nextPhysicalScrollTop = viewport.scrollTop;
        const maxPhysicalScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        const maxLogicalScrollTop = Math.max(
            0,
            rangeRef.current.totalHeight - viewportHeightRef.current,
        );

        latestPhysicalScrollTopRef.current = nextPhysicalScrollTop;
        latestLogicalScrollTopRef.current = toLogicalScrollTop({
            physicalScrollTop: nextPhysicalScrollTop,
            maxPhysicalScrollTop,
            maxLogicalScrollTop,
            scrollScale: scrollMetricsRef.current.scrollScale,
        });
        if (!frameIdRef.current) {
            frameIdRef.current = requestAnimationFrame(commitScroll);
        }
    }, [commitScroll]);

    /**
     * 动态列表之前注册了 { passive: false } 的 wheel 监听，浏览器每次滚轮输入都必须等待主线程执行，拖动滚动条则不会经过该监听。
     * 现在：
     *      删除非 passive wheel 监听和 preventDefault()。
     *      保留 passive scroll 监听与 rAF 合帧更新。
     *      边界滚动隔离继续由 overscroll-behavior: contain 处理。
     * 
     * 
     * 现象指向 wheel 专属路径：拖动滚动条不会触发 wheel，而当前动态列表为阻止边界回弹注册了 { passive: false } 的滚轮监听。
     * 浏览器每次滚轮输入都必须等待主线程处理后才能滚动，这正是拖拽正常、滚轮偶发卡顿的典型差异。
     * 先移除这条阻塞合成线程的监听，边界隔离继续交给现有 overscroll-behavior: contain。
     * 现在滚轮和触控板滚动都由浏览器合成线程先行处理，React 仍只在 passive scroll 回调里记录位置，并通过 rAF 每帧提交一次。
     */
    // const handleWheel = React.useCallback((event: WheelEvent) => {
    //     const viewport = event.currentTarget as HTMLElement;
    //     const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    //     const isLeavingTop = event.deltaY < 0 && viewport.scrollTop <= 1;
    //     const isLeavingBottom = event.deltaY > 0 && maxScrollTop - viewport.scrollTop <= 1;
    //     if (isLeavingTop || isLeavingBottom) event.preventDefault();
    // }, []);

    // 步骤 5：批量回写真实行高，并补偿视口上方高度变化引起的内容跳动。
    const measureRows = React.useCallback((entries: ResizeObserverEntry[]) => {
        const viewport = viewportRef.current;
        const virtualizer = virtualizerRef.current!;
        const wasPinnedToBottom = viewport
            ? viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 2
            : false;
        let scrollCompensation = 0;
        let changed = false;

        entries.forEach((entry) => {
            const index = Number((entry.target as HTMLElement).dataset.index);
            const bottomBeforeUpdate = virtualizer.getOffset(index + 1);
            const measuredHeight = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height;
            const delta = virtualizer.updateItemHeight(index, measuredHeight);
            if (!delta) return;

            changed = true;
            measuredIndexesRef.current.add(index);
            if (bottomBeforeUpdate <= latestLogicalScrollTopRef.current) {
                scrollCompensation += delta;
            }
        });

        if (!changed) return;

        const currentViewportHeight = viewportHeightRef.current;
        const nextMetrics = getCompressedScrollMetrics({
            logicalTotalHeight: virtualizer.totalHeight,
            viewportHeight: currentViewportHeight,
            maxPhysicalHeight: MAX_PHYSICAL_SCROLL_HEIGHT,
        });
        let nextLogicalScrollTop = latestLogicalScrollTopRef.current + scrollCompensation;
        let nextPhysicalScrollTop = nextLogicalScrollTop / nextMetrics.scrollScale;

        if (wasPinnedToBottom) {
            nextLogicalScrollTop = Math.max(0, virtualizer.totalHeight - currentViewportHeight);
            nextPhysicalScrollTop = Math.max(
                0,
                nextMetrics.physicalTotalHeight - currentViewportHeight,
            );
        }

        latestLogicalScrollTopRef.current = nextLogicalScrollTop;
        latestPhysicalScrollTopRef.current = nextPhysicalScrollTop;
        setMeasuredCount(measuredIndexesRef.current.size);
        setLayoutVersion((version) => version + 1);
        setLogicalScrollTop(nextLogicalScrollTop);
        setPhysicalScrollTop(nextPhysicalScrollTop);

        if (viewport && Math.abs(viewport.scrollTop - nextPhysicalScrollTop) > 0.5) {
            viewport.scrollTop = nextPhysicalScrollTop;
        }
    }, []);

    // 步骤 6：一个观察器负责视口，一个观察器只测量当前几十个可见节点。
    React.useLayoutEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return undefined;

        // 滚动只读取位置，使用 passive 原生监听避免事件委托差异并保持滚动性能。
        viewport.addEventListener('scroll', handleScroll, {passive: true});
        // // wheel 需要阻止边界回弹，因此必须直接注册非 passive 原生监听。
        // viewport.addEventListener('wheel', handleWheel, {passive: false});
        rowObserverRef.current = new ResizeObserver(measureRows);
        viewportObserverRef.current = new ResizeObserver(([entry]) => {
            viewportHeightRef.current = entry.contentRect.height;
            setViewportHeight(entry.contentRect.height);
        });
        viewportObserverRef.current.observe(viewport);

        return () => {
            viewport.removeEventListener('scroll', handleScroll);
            // viewport.removeEventListener('wheel', handleWheel);
            rowObserverRef.current?.disconnect();
            viewportObserverRef.current?.disconnect();
        };
    }, [handleScroll, measureRows, /* handleWheel */]);

    React.useLayoutEffect(() => {
        const observer = rowObserverRef.current;
        const visibleList = visibleListRef.current;
        if (!observer || !visibleList) return;

        observer.disconnect();
        visibleList.querySelectorAll<HTMLElement>('[data-index]').forEach((element) => {
            observer.observe(element);
        });
    }, [itemCount, range.endIndex, range.startIndex]);

    React.useEffect(() => () => {
        if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
    }, []);

    const scrollToTop = React.useCallback(() => {
        viewportRef.current?.scrollTo({top: 0, behavior: 'smooth'});
    }, []);

    /** 使用函数式更新创建新 Set，确保并发更新不会覆盖其他行的选择状态。 */
    const toggleSelected = React.useCallback((id: number) => {
        setSelectedIds((current) => {
            const next = new Set(current);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }, []);

    // 步骤 7：切换规模时必须同时重置数据、高度树、测量缓存和两套坐标。
    const changeDataSize = React.useCallback((size: number) => {
        rowObserverRef.current?.disconnect();
        measuredIndexesRef.current.clear();
        virtualizerRef.current = new DynamicHeightVirtualizer(size, ESTIMATED_ITEM_HEIGHT);
        latestPhysicalScrollTopRef.current = 0;
        latestLogicalScrollTopRef.current = 0;
        setItemCount(size);
        setMeasuredCount(0);
        setSelectedIds(new Set());
        setPhysicalScrollTop(0);
        setLogicalScrollTop(0);
        setLayoutVersion((version) => version + 1);
        viewportRef.current?.scrollTo({top: 0});
    }, []);

    return {
        changeDataSize,
        itemCount,
        measuredCount,
        range,
        renderedItems,
        renderOffsetY,
        scrollMetrics,
        scrollToTop,
        selectedIds,
        selectedSize: itemCount,
        toggleSelected,
        viewportRef,
        visibleListRef,
    };
};
