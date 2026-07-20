/** 引入 React Hook API。 */
import React from 'react';
/** 引入框架无关的不定高模型、高度预估和超长列表坐标换算能力。 */
import {
    DynamicHeightVirtualizer,
    estimateItemHeight,
    getCompressedScrollMetrics,
    getPhysicalRenderOffset,
    toLogicalScrollTop,
    type CompressedScrollMetrics,
    type VirtualRange,
} from '../core';
/** 引入按索引生成动态窗口数据所需的工厂、布局常量和类型。 */
import {
    createDataRange,
    createDynamicItem,
    DEFAULT_DATA_SIZE,
    DYNAMIC_CONTENT_MAX_LINES,
    DYNAMIC_CONTENT_MIN_LINES,
    DYNAMIC_IMAGE_HEIGHT,
    DYNAMIC_IMAGE_INTERVAL,
    type DynamicDemoItem,
} from '../shared/demo-data';

/** 根据当前行样式和 3～10 行内容分布计算未测量项目的代表性高度。 */
const ESTIMATED_ITEM_HEIGHT = estimateItemHeight({
    // .dynamicRow 上下 padding 均为 16px。
    verticalPadding: 16 * 2,
    // h3 显式使用 17px 行高。
    titleLineHeight: 17,
    // h3 与正文之间的 margin-bottom。
    titleMarginBottom: 7,
    // 演示数据均匀分布在 3～10 行，使用平均行数作为总高度基线。
    expectedContentLines: (
        DYNAMIC_CONTENT_MIN_LINES + DYNAMIC_CONTENT_MAX_LINES
    ) / 2,
    // 正文 CSS line-height。
    contentLineHeight: 22,
    // 每个项目只有 1px 下边框。
    borderHeight: 1,
    // 每 4 条有 1 张 180px 图片，图片与正文间距为 12px：25% × 192px = 48px。
    expectedMediaBlockHeight: (
        DYNAMIC_IMAGE_HEIGHT + 12
    ) / DYNAMIC_IMAGE_INTERVAL,
    // 吸收字体取整、浏览器缩放和轻微布局差异。
    safetyBuffer: 5,
});
/** 不定高度列表按像素预渲染，避免高低差异让条数缓冲失真。 */
const OVERSCAN_PX = 600;
/** 低于浏览器单元素高度上限的安全物理滚动高度。 */
const MAX_PHYSICAL_SCROLL_HEIGHT = 8_000_000;

export interface RenderedDynamicItem {
    /** 根据完整列表索引即时生成的当前窗口业务对象。 */
    item: DynamicDemoItem;
    /** 项目在完整数据源中的真实索引。 */
    index: number;
}

/** 动态高度页面的 React 适配层，累计高度模型和坐标换算均来自框架无关核心。 */
export const useDynamicHeightList = () => {
    // 步骤 1：只保存逻辑总数，避免千万到十亿级数据对象占用内存。
    const [itemCount, setItemCount] = React.useState(DEFAULT_DATA_SIZE);
    // useRef 的普通参数会在每次渲染时求值，因此显式惰性创建模型实例。
    // ref 保存可变模型，树节点更新不会直接触发 React 渲染。
    const virtualizerRef = React.useRef<DynamicHeightVirtualizer | null>(null);
    // 仅在首次渲染或切换数据规模后没有模型时创建实例。
    if (!virtualizerRef.current) {
        // 初始模型只保存逻辑数量和统一预估高度，不创建同等长度数组。
        virtualizerRef.current = new DynamicHeightVirtualizer(
            DEFAULT_DATA_SIZE,
            ESTIMATED_ITEM_HEIGHT,
        );
    }
    // 记录曾获得有效实测高度的业务索引，用于页面展示已测量数量。
    const measuredIndexesRef = React.useRef(new Set<number>());

    // 步骤 2：分别保存浏览器物理位置和完整列表逻辑位置。
    // 保存滚动容器可见高度，用于区间计算与可滚动距离计算。
    const [viewportHeight, setViewportHeight] = React.useState(0);
    // 保存浏览器实际 scrollTop，供物理 DOM 偏移计算。
    const [physicalScrollTop, setPhysicalScrollTop] = React.useState(0);
    // 保存完整数据空间中的 scrollTop，供不定高模型定位项目。
    const [logicalScrollTop, setLogicalScrollTop] = React.useState(0);
    // 高度模型不是 React 状态，用版本号通知 useMemo 树结构已经发生变化。
    const [layoutVersion, setLayoutVersion] = React.useState(0);
    // 保存已测量项目数量，避免把可变 Set 直接作为渲染依赖。
    const [measuredCount, setMeasuredCount] = React.useState(0);
    // 选择状态以稳定业务 id 保存，不依赖当前虚拟窗口中的 DOM 是否存在。
    const [selectedIds, setSelectedIds] = React.useState<Set<number>>(() => new Set());
    // 指向真正产生滚动条的 section，供事件监听、测量和命令式滚动使用。
    const viewportRef = React.useRef<HTMLElement>(null);
    // 指向只包含当前窗口节点的可见层，供行高观察器批量绑定子节点。
    const visibleListRef = React.useRef<HTMLDivElement>(null);

    // 根据最新逻辑坐标、视口和高度树计算当前需要渲染的窗口。
    const range = React.useMemo<VirtualRange>(() => {
        // virtualizer 是非响应式实例，显式读取版本号以表达高度树变化后的刷新依赖。
        void layoutVersion;
        // 模型结合预估高度与实测差值，通过 binary lifting 定位首尾索引。
        return virtualizerRef.current!.getRange({
            // 完整数据空间中的当前滚动位置。
            scrollTop: logicalScrollTop,
            // DOM 滚动容器当前可见高度。
            viewportHeight,
            // 不定高使用像素缓冲，避免相同条数对应的实际高度差异过大。
            overscanPx: OVERSCAN_PX,
        });
    }, [layoutVersion, logicalScrollTop, viewportHeight]);

    // 把可能达到数千亿像素的逻辑总高度压缩成浏览器安全物理高度。
    const scrollMetrics = React.useMemo<CompressedScrollMetrics>(
        () => getCompressedScrollMetrics({
            // 高度模型返回的预估/实测混合逻辑总高度。
            logicalTotalHeight: range.totalHeight,
            // 视口高度用于分别计算物理和逻辑可滚动距离。
            viewportHeight,
            // DOM spacer 不允许超过该安全物理高度。
            maxPhysicalHeight: MAX_PHYSICAL_SCROLL_HEIGHT,
        }),
        [range.totalHeight, viewportHeight],
    );

    // 将逻辑窗口偏移换算到当前物理视口附近，避免写入超大 transform。
    const renderOffsetY = getPhysicalRenderOffset({
        // 浏览器当前真实 scrollTop。
        physicalScrollTop,
        // 物理位置映射到完整数据空间后的逻辑 scrollTop。
        logicalScrollTop,
        // 当前虚拟窗口顶部在完整逻辑列表中的偏移。
        logicalRangeOffset: range.offsetY,
    });

    // 只创建当前虚拟窗口对应的数据对象，而不是创建 itemCount 长度数组。
    const renderedItems = React.useMemo<RenderedDynamicItem[]>(
        () => createDataRange(
            // 当前窗口第一条记录索引。
            range.startIndex,
            // 当前窗口开区间结束索引。
            range.endIndex,
            // 同时保留业务对象和完整列表索引，后者写入 DOM data-index 供测量回调使用。
            (index) => ({item: createDynamicItem(index), index}),
        ),
        // 窗口边界不变时复用数组和业务对象，帮助 React.memo 跳过无关行更新。
        [range.endIndex, range.startIndex],
    );

    // 步骤 3：观察器与 rAF 回调通过 ref 读取最新值，避免频繁销毁和重建。
    // 保存最新视口高度，供稳定的滚动和测量回调使用。
    const viewportHeightRef = React.useRef(viewportHeight);
    // 保存最新虚拟区间，供滚动回调读取完整逻辑高度。
    const rangeRef = React.useRef(range);
    // 保存最新物理/逻辑压缩比例，供滚动事件映射坐标。
    const scrollMetricsRef = React.useRef(scrollMetrics);
    // 保存一帧内最后一次浏览器物理滚动位置。
    const latestPhysicalScrollTopRef = React.useRef(0);
    // 保存一帧内最后一次完整列表逻辑滚动位置。
    const latestLogicalScrollTopRef = React.useRef(0);
    // 保存待执行 requestAnimationFrame id，0 表示本帧尚未预约。
    const frameIdRef = React.useRef(0);
    // 保存负责观察滚动容器尺寸的 ResizeObserver 实例。
    const viewportObserverRef = React.useRef<ResizeObserver>();
    // 保存负责观察当前窗口所有行高的 ResizeObserver 实例。
    const rowObserverRef = React.useRef<ResizeObserver>();
    // 每次渲染同步最新值到 ref；这些赋值不会触发 React 更新。
    viewportHeightRef.current = viewportHeight;
    // 同步当前区间，避免 handleScroll 捕获旧 totalHeight。
    rangeRef.current = range;
    // 同步当前压缩指标，避免 handleScroll 使用过期比例。
    scrollMetricsRef.current = scrollMetrics;

    // 在下一绘制帧统一提交一帧内最后一次物理和逻辑滚动位置。
    const commitScroll = React.useCallback(() => {
        // 清除预约标记，使后续帧可以再次申请 rAF。
        frameIdRef.current = 0;
        // 提交最新物理位置，用于计算安全 DOM 偏移。
        setPhysicalScrollTop(latestPhysicalScrollTopRef.current);
        // 提交最新逻辑位置，触发不定高模型重新定位窗口。
        setLogicalScrollTop(latestLogicalScrollTopRef.current);
    }, []);

    // 步骤 4：原生滚动位置在下一帧统一映射并提交到 React。
    const handleScroll = React.useCallback((event: Event) => {
        // currentTarget 是注册原生 scroll 监听的滚动容器。
        const viewport = event.currentTarget as HTMLElement;
        // 读取浏览器真实的物理滚动位置。
        const nextPhysicalScrollTop = viewport.scrollTop;
        // 物理可滚动距离用于精确识别压缩滚动条底部。
        const maxPhysicalScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        // 完整逻辑总高度减视口高度得到最大逻辑 scrollTop。
        const maxLogicalScrollTop = Math.max(
            0,
            rangeRef.current.totalHeight - viewportHeightRef.current,
        );

        // 先写 ref，使同一帧的后续滚动事件覆盖旧位置而不触发渲染。
        latestPhysicalScrollTopRef.current = nextPhysicalScrollTop;
        // 按压缩比例把浏览器物理位置映射到完整列表逻辑坐标。
        latestLogicalScrollTopRef.current = toLogicalScrollTop({
            // 本次事件读取的浏览器 scrollTop。
            physicalScrollTop: nextPhysicalScrollTop,
            // 浏览器 DOM 能够滚动到的最大位置。
            maxPhysicalScrollTop,
            // 完整逻辑数据空间能够滚动到的最大位置。
            maxLogicalScrollTop,
            // 每 1px 物理距离对应的逻辑距离。
            scrollScale: scrollMetricsRef.current.scrollScale,
        });
        // 同一帧只预约一个回调，避免 scroll 高频触发 React 状态提交。
        if (!frameIdRef.current) {
            // 浏览器下一次绘制前提交一帧内的最终位置。
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
        // 读取滚动容器，用于判断贴底状态并命令式修正物理位置。
        const viewport = viewportRef.current;
        // 高度模型在 Hook 生命周期内始终存在，使用非空断言读取。
        const virtualizer = virtualizerRef.current!;
        // 测量前记录用户是否贴近底部，后续总高度变化时优先保持贴底。
        const wasPinnedToBottom = viewport
            // 距离底部不超过 2px 视为贴底，吸收浏览器小数像素误差。
            ? viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 2
            // 容器尚未挂载时不处于贴底状态。
            : false;
        // 累计视口上方所有有效高度差，稍后一次性补偿 scrollTop。
        let scrollCompensation = 0;
        // 标记本批次是否存在至少一个需要更新布局的有效差值。
        let changed = false;

        // 一个 ResizeObserver 回调可能同时包含当前窗口中的多条记录。
        entries.forEach((entry) => {
            // 从 DynamicRow 写入的 data-index 还原完整列表 0-based 索引。
            const index = Number((entry.target as HTMLElement).dataset.index);
            // 更新前记录该项目底部偏移，用来判断整项是否位于当前视口上方。
            const bottomBeforeUpdate = virtualizer.getOffset(index + 1);
            // 优先使用包含边框的 blockSize，旧浏览器回退到 contentRect.height。
            const measuredHeight = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height;
            // 写入模型并取得相对旧高度的差值；无效或噪声变化返回 0。
            const delta = virtualizer.updateItemHeight(index, measuredHeight);
            // 没有有效高度差时跳过本条记录后续处理。
            if (!delta) {
                return;
            }

            // 标记本批次需要刷新布局。
            changed = true;
            // 记录该业务索引曾完成有效实测，用于页面指标展示。
            measuredIndexesRef.current.add(index);
            // 只有完整位于当前逻辑视口上方的项目才需要补偿阅读锚点。
            if (bottomBeforeUpdate <= latestLogicalScrollTopRef.current) {
                // 把上方项目高度变化累加到当前逻辑滚动位置。
                scrollCompensation += delta;
            }
        });

        // 本批次全是测量噪声时不触发 React 状态和坐标更新。
        if (!changed) {
            return;
        }

        // 使用 ref 中最新视口高度，避免回调闭包捕获旧值。
        const currentViewportHeight = viewportHeightRef.current;
        // 树更新改变逻辑总高度后，需要重新计算物理高度和压缩比例。
        const nextMetrics = getCompressedScrollMetrics({
            // 使用已经写入本批高度差的最新总高度。
            logicalTotalHeight: virtualizer.totalHeight,
            // 当前滚动容器可见高度。
            viewportHeight: currentViewportHeight,
            // spacer 仍限制在浏览器安全物理高度内。
            maxPhysicalHeight: MAX_PHYSICAL_SCROLL_HEIGHT,
        });
        // 当前逻辑位置加视口上方累计高度差，使阅读内容保持在原视觉位置。
        let nextLogicalScrollTop = latestLogicalScrollTopRef.current + scrollCompensation;
        // 使用新压缩比例把补偿后的逻辑位置映射回浏览器物理位置。
        let nextPhysicalScrollTop = nextLogicalScrollTop / nextMetrics.scrollScale;

        // 如果测量前用户贴底，总高度变化后应继续定位到新的列表底部。
        if (wasPinnedToBottom) {
            // 新最大逻辑 scrollTop 等于最新总高度减视口高度。
            nextLogicalScrollTop = Math.max(0, virtualizer.totalHeight - currentViewportHeight);
            // 新最大物理 scrollTop 等于安全 spacer 高度减视口高度。
            nextPhysicalScrollTop = Math.max(
                0,
                nextMetrics.physicalTotalHeight - currentViewportHeight,
            );
        }

        // 同步事件热路径使用的最新逻辑位置。
        latestLogicalScrollTopRef.current = nextLogicalScrollTop;
        // 同步事件热路径使用的最新物理位置。
        latestPhysicalScrollTopRef.current = nextPhysicalScrollTop;
        // 把稀疏 Set 数量转换为 React 状态供页面展示。
        setMeasuredCount(measuredIndexesRef.current.size);
        // 通知 range useMemo 高度树已经发生变化。
        setLayoutVersion((version) => version + 1);
        // 提交补偿后的逻辑位置。
        setLogicalScrollTop(nextLogicalScrollTop);
        // 提交补偿后的物理位置。
        setPhysicalScrollTop(nextPhysicalScrollTop);

        // React 状态不会自动移动浏览器滚动条，需要命令式同步真实 DOM 位置。
        if (viewport && Math.abs(viewport.scrollTop - nextPhysicalScrollTop) > 0.5) {
            // 只有差异超过亚像素阈值时赋值，避免 scroll 与测量回调互相抖动。
            viewport.scrollTop = nextPhysicalScrollTop;
        }
    }, []);

    // 步骤 6：一个观察器负责视口，一个观察器只测量当前几十个可见节点。
    React.useLayoutEffect(() => {
        // 在浏览器绘制前读取已经挂载的滚动容器。
        const viewport = viewportRef.current;
        // ref 尚未绑定时不注册监听和观察器，也不需要清理函数。
        if (!viewport) {
            return undefined;
        }

        // 滚动只读取位置，使用 passive 原生监听避免事件委托差异并保持滚动性能。
        viewport.addEventListener('scroll', handleScroll, {passive: true});
        // // wheel 需要阻止边界回弹，因此必须直接注册非 passive 原生监听。
        // viewport.addEventListener('wheel', handleWheel, {passive: false});
        // 复用一个行观察器批量接收当前窗口内所有 DynamicRow 的高度变化。
        rowObserverRef.current = new ResizeObserver(measureRows);
        // 单独创建视口观察器，窗口和父布局变化时重新计算可见高度。
        viewportObserverRef.current = new ResizeObserver(([entry]) => {
            // 立即同步 ref，使下一次滚动或测量回调读取最新视口高度。
            viewportHeightRef.current = entry.contentRect.height;
            // 更新 React 状态，触发区间和坐标压缩比例重新计算。
            setViewportHeight(entry.contentRect.height);
        });
        // 开始观察真正产生滚动条的容器。
        viewportObserverRef.current.observe(viewport);

        // 组件卸载或稳定依赖变化时移除所有浏览器副作用。
        return () => {
            // 使用相同事件名和回调引用移除原生 scroll 监听。
            viewport.removeEventListener('scroll', handleScroll);
            // viewport.removeEventListener('wheel', handleWheel);
            // 断开全部行节点，避免观察器继续持有已经卸载的 DOM。
            rowObserverRef.current?.disconnect();
            // 断开视口节点，停止尺寸回调。
            viewportObserverRef.current?.disconnect();
        };
    }, [handleScroll, measureRows, /* handleWheel */]);

    // 虚拟窗口变化后，把行观察器从旧 DOM 切换到新窗口节点。
    React.useLayoutEffect(() => {
        // 读取步骤 6 创建的共享行观察器。
        const observer = rowObserverRef.current;
        // 读取只包含当前窗口行节点的可见层。
        const visibleList = visibleListRef.current;
        // 任一对象尚未准备好时不执行观察绑定。
        if (!observer || !visibleList) {
            return;
        }

        // 先断开旧窗口节点，防止已经卸载的行继续占用观察器。
        observer.disconnect();
        // data-index 同时是行节点选择器和完整列表索引载体。
        visibleList.querySelectorAll<HTMLElement>('[data-index]').forEach((element) => {
            // 逐个绑定当前窗口的少量行节点，变化后由 measureRows 批量处理。
            observer.observe(element);
        });
    }, [itemCount, range.endIndex, range.startIndex]);

    // 组件卸载时取消尚未执行的滚动帧，避免卸载后继续 setState。
    React.useEffect(() => () => {
        // 只有存在待执行帧时才调用取消 API。
        if (frameIdRef.current) {
            cancelAnimationFrame(frameIdRef.current);
        }
    }, []);

    // 暴露稳定命令函数，让工具栏可以平滑回到物理滚动顶部。
    const scrollToTop = React.useCallback(() => {
        // ref 未绑定时可选链安全跳过；物理顶部同时对应逻辑列表顶部。
        viewportRef.current?.scrollTo({top: 0, behavior: 'smooth'});
    }, []);

    /** 使用函数式更新创建新 Set，确保并发更新不会覆盖其他行的选择状态。 */
    const toggleSelected = React.useCallback((id: number) => {
        // 函数式更新保证连续点击不会读取到旧 Set。
        setSelectedIds((current) => {
            // 复制可变 Set，确保 React 能通过新引用识别状态变化。
            const next = new Set(current);
            // 已选择则删除，未选择则加入，实现单行状态切换。
            next.has(id) ? next.delete(id) : next.add(id);
            // 返回新 Set 触发当前窗口视图更新。
            return next;
        });
    }, []);

    // 步骤 7：切换规模时必须同时重置数据、高度树、测量缓存和两套坐标。
    const changeDataSize = React.useCallback((size: number) => {
        // 切换过程中先断开旧行节点，避免旧 ResizeObserver 回调写入新模型。
        rowObserverRef.current?.disconnect();
        // 清空旧列表已测量索引，页面指标从 0 重新开始。
        measuredIndexesRef.current.clear();
        // 使用新逻辑数量和同一预估高度创建全新的稀疏高度模型。
        virtualizerRef.current = new DynamicHeightVirtualizer(size, ESTIMATED_ITEM_HEIGHT);
        // 重置事件热路径中的物理坐标。
        latestPhysicalScrollTopRef.current = 0;
        // 重置事件热路径中的逻辑坐标。
        latestLogicalScrollTopRef.current = 0;
        // 更新完整列表逻辑数量，触发窗口数据重新生成。
        setItemCount(size);
        // 重置页面展示的已测量数量。
        setMeasuredCount(0);
        // 新数据规模视为新列表，清空旧业务选择状态。
        setSelectedIds(new Set());
        // 重置 React 中的物理位置。
        setPhysicalScrollTop(0);
        // 重置 React 中的逻辑位置。
        setLogicalScrollTop(0);
        // 通知 range useMemo 使用新创建的高度模型重新计算。
        setLayoutVersion((version) => version + 1);
        // 命令式复位浏览器真实滚动条，使 DOM 与两套状态保持一致。
        viewportRef.current?.scrollTo({top: 0});
    }, []);

    // 将不定高视图需要的状态、命令和 DOM ref 作为页面接口返回。
    return {
        // 切换逻辑数据规模并重置高度模型。
        changeDataSize,
        // 完整列表当前逻辑项目数量。
        itemCount,
        // 当前会话曾获得有效真实高度的项目数量。
        measuredCount,
        // 不定高模型计算出的当前虚拟窗口。
        range,
        // 仅包含当前窗口对象及完整列表索引的数据数组。
        renderedItems,
        // 可见层在安全物理坐标系中的 transform 偏移。
        renderOffsetY,
        // spacer 物理高度和物理/逻辑滚动比例。
        scrollMetrics,
        // 工具栏使用的平滑回到顶部命令。
        scrollToTop,
        // 独立于虚拟 DOM 生命周期的选择 id 集合。
        selectedIds,
        // 数据规模控件使用的当前选项值，与 itemCount 相同。
        selectedSize: itemCount,
        // 单行选择状态切换函数。
        toggleSelected,
        // 真正滚动容器的 DOM ref。
        viewportRef,
        // 当前虚拟窗口可见层的 DOM ref，用于批量绑定行观察器。
        visibleListRef,
    };
};
