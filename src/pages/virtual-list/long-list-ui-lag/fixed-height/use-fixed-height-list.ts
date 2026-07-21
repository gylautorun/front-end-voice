/** 引入 React Hook API 和 React UIEvent 类型。 */
import React, {useState, useRef, useMemo, useCallback, useLayoutEffect, useEffect} from 'react';
/** 引入框架无关的固定高区间模型与超长列表坐标换算函数。 */
import {
    FixedHeightVirtualizer,
    getCompressedScrollMetrics,
    getPhysicalRenderOffset,
    toLogicalScrollTop,
} from '../core';
/** 引入按索引生成窗口数据的函数和默认逻辑数据规模。 */
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
/** 固定行高在模块加载时即可确定，因此所有 Hook 实例可以共享无状态计算器。 */
const virtualizer = new FixedHeightVirtualizer(FIXED_ITEM_HEIGHT);

/** 固定高度页面的 React 状态适配层；区间计算仍由纯 TypeScript 核心完成。 */
export const useFixedHeightList = () => {
    // 步骤 1：只保存逻辑总数，可见项目稍后按索引即时生成。
    const [itemCount, setItemCount] = useState(DEFAULT_DATA_SIZE);

    // 步骤 2：分别维护浏览器物理位置和完整列表逻辑位置。
    // 保存滚动容器的可见高度，用于计算当前能容纳多少条固定高记录。
    const [viewportHeight, setViewportHeight] = useState(0);
    // 保存浏览器实际 scrollTop，用于把可见块放在安全的物理坐标附近。
    const [physicalScrollTop, setPhysicalScrollTop] = useState(0);
    // 保存映射后的完整列表 scrollTop，区间模型始终使用这套逻辑坐标。
    const [logicalScrollTop, setLogicalScrollTop] = useState(0);
    // 保存当前前后缓冲条数，滚动越快该值越接近 MAX_OVERSCAN。
    const [overscan, setOverscan] = useState(MIN_OVERSCAN);
    // 使用稳定业务 id 记录选择状态，使虚拟行卸载后仍能恢复选中结果。
    const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
    // 指向真正产生滚动条的 section，供尺寸观察和命令式滚动使用。
    const viewportRef = useRef<HTMLElement>(null);

    // 步骤 3：高频 scroll 事件先写 ref，同一绘制帧最多提交一次 React 更新。
    // 保存当前待执行的 requestAnimationFrame id，0 表示本帧尚未预约提交。
    const frameIdRef = useRef(0);
    // 保存最新物理位置，后续滚动事件可以覆盖旧值而不触发渲染。
    const latestPhysicalScrollTopRef = useRef(0);
    // 保存最新逻辑位置，rAF 回调只提交一帧内最后一次结果。
    const latestLogicalScrollTopRef = useRef(0);
    // 保存上一帧逻辑位置，用于计算本帧滚动距离和动态缓冲数量。
    const previousLogicalScrollTopRef = useRef(0);

    // 只在影响窗口的状态变化时重新运行 O(1) 固定高区间计算。
    const range = useMemo(() => virtualizer.getRange({
        // 使用完整列表逻辑坐标定位第一条可见记录。
        scrollTop: logicalScrollTop,
        // 视口高度决定固定行高下的可见记录数量。
        viewportHeight,
        // 逻辑总数只参与边界和总高度计算，不创建同等长度数组。
        itemCount,
        // 在可见区前后额外保留动态数量的记录。
        overscan,
    }), [itemCount, logicalScrollTop, overscan, viewportHeight]);

    // 根据逻辑总高度计算浏览器安全的 spacer 高度和物理/逻辑压缩比例。
    const scrollMetrics = useMemo(() => getCompressedScrollMetrics({
        // 固定高模型返回的完整逻辑列表高度。
        logicalTotalHeight: range.totalHeight,
        // 扣除视口后才能得到两套坐标各自的可滚动距离。
        viewportHeight,
        // 浏览器 DOM 中不允许 spacer 超过该安全高度。
        maxPhysicalHeight: MAX_PHYSICAL_SCROLL_HEIGHT,
    }), [range.totalHeight, viewportHeight]);

    // 把逻辑窗口偏移换算到当前物理 scrollTop 附近，避免超大 transform。
    const renderOffsetY = getPhysicalRenderOffset({
        // 浏览器当前真实滚动位置。
        physicalScrollTop,
        // 当前真实位置映射到完整列表后的逻辑滚动位置。
        logicalScrollTop,
        // 本次渲染窗口在完整逻辑列表中的顶部偏移。
        logicalRangeOffset: range.offsetY,
    });

    // 只为当前虚拟窗口创建少量业务对象，逻辑总量变化不会创建完整数组。
    const renderedItems = useMemo(
        // endIndex 是开区间上界，可以直接传给公共范围生成器。
        () => createDataRange(range.startIndex, range.endIndex, createFixedItem),
        // 窗口边界不变时复用对象数组，帮助 React.memo 跳过无关行更新。
        [range.endIndex, range.startIndex],
    );

    // 以下三个 ref 让稳定的滚动回调读取最新状态，而不必随每次渲染重新创建。
    // 保存最新视口高度，供滚动事件计算最大逻辑位置。
    const viewportHeightRef = useRef(viewportHeight);
    // 保存最新虚拟区间，供滚动事件读取完整逻辑总高度。
    const rangeRef = useRef(range);
    // 保存最新坐标压缩比例，供物理位置映射逻辑位置。
    const scrollMetricsRef = useRef(scrollMetrics);
    // 每次渲染同步 ref；赋值本身不会触发额外 React 更新。
    viewportHeightRef.current = viewportHeight;
    // 同步当前区间，避免 handleScroll 捕获旧 totalHeight。
    rangeRef.current = range;
    // 同步当前压缩指标，避免 handleScroll 使用过期比例。
    scrollMetricsRef.current = scrollMetrics;

    // 在浏览器下一次绘制前，把一帧内最后一次滚动位置统一提交给 React。
    const commitScroll = useCallback(() => {
        // 清空预约标记，使下一帧的新滚动可以再次申请 rAF。
        frameIdRef.current = 0;
        // 读取 ref 中一帧内最后一次逻辑位置，而不是处理已经过时的中间事件。
        const nextLogicalScrollTop = latestLogicalScrollTopRef.current;
        // 计算两帧之间的逻辑滚动距离，压缩列表下仍反映真实数据跨度。
        const distance = Math.abs(
            nextLogicalScrollTop - previousLogicalScrollTopRef.current,
        );
        // 保存本帧位置，作为下一帧计算滚动速度的基准。
        previousLogicalScrollTopRef.current = nextLogicalScrollTop;
        // 位移越大缓冲越多，但始终限制在 MIN_OVERSCAN 与 MAX_OVERSCAN 之间。
        setOverscan(Math.min(
            MAX_OVERSCAN,
            MIN_OVERSCAN + Math.ceil(distance / FIXED_ITEM_HEIGHT),
        ));
        // 提交浏览器物理位置，用于计算安全的 DOM 渲染偏移。
        setPhysicalScrollTop(latestPhysicalScrollTopRef.current);
        // 提交完整列表逻辑位置，触发下一虚拟窗口计算。
        setLogicalScrollTop(nextLogicalScrollTop);
    }, []);

    // React onScroll 只记录最新坐标并预约 rAF，不在高频事件中直接生成数据。
    const handleScroll = useCallback((event: React.UIEvent<HTMLElement>) => {
        // currentTarget 始终是绑定 onScroll 的滚动容器。
        const viewport = event.currentTarget;
        // 读取浏览器实际物理滚动位置。
        const nextPhysicalScrollTop = viewport.scrollTop;
        // 先写 ref，使同一帧后续事件可以覆盖旧物理位置。
        latestPhysicalScrollTopRef.current = nextPhysicalScrollTop;
        // 将物理位置映射到完整列表逻辑坐标并写入 ref。
        latestLogicalScrollTopRef.current = toLogicalScrollTop({
            // 本次事件产生的浏览器实际位置。
            physicalScrollTop: nextPhysicalScrollTop,
            // DOM 的最大物理滚动距离用于精确识别底部边界。
            maxPhysicalScrollTop: Math.max(0, viewport.scrollHeight - viewport.clientHeight),
            // 完整逻辑总高度减视口高度得到最大逻辑滚动距离。
            maxLogicalScrollTop: Math.max(
                0,
                rangeRef.current.totalHeight - viewportHeightRef.current,
            ),
            // 每 1px 物理滚动距离对应的逻辑数据距离。
            scrollScale: scrollMetricsRef.current.scrollScale,
        });
        // 同一帧只申请一个回调；后续事件只更新上面的 latest ref。
        if (!frameIdRef.current) {
            // 浏览器准备绘制前再统一提交 React 状态。
            frameIdRef.current = requestAnimationFrame(commitScroll);
        }
    }, [commitScroll]);

    // 步骤 4：只观察滚动容器尺寸，窗口和侧栏变化后自动重算可见行数。
    useLayoutEffect(() => {
        // 布局阶段读取已经挂载的滚动容器 DOM。
        const viewport = viewportRef.current;
        // ref 尚未绑定时不创建观察器，也不需要清理函数。
        if (!viewport) {
            return undefined;
        }

        // ResizeObserver 能覆盖窗口、侧栏和父容器布局造成的尺寸变化。
        const observer = new ResizeObserver(([entry]) => {
            // 立即同步 ref，保证下一次滚动事件读取最新高度。
            viewportHeightRef.current = entry.contentRect.height;
            // 更新 React 状态，触发可见条数和坐标比例重新计算。
            setViewportHeight(entry.contentRect.height);
        });
        // 开始观察实际滚动容器。
        observer.observe(viewport);
        // 组件卸载时断开观察，避免回调持有旧 DOM 和 Hook 闭包。
        return () => observer.disconnect();
    }, []);

    // 组件卸载时取消尚未执行的滚动帧，避免卸载后继续 setState。
    useEffect(() => () => {
        // 只有存在待执行帧时才调用取消 API。
        if (frameIdRef.current) {
            cancelAnimationFrame(frameIdRef.current);
        }
    }, []);

    // 使用稳定 id 切换选择状态，状态生命周期不依赖虚拟行 DOM。
    const toggleSelected = useCallback((id: number) => {
        // 函数式更新保证连续点击不会读取到过期 Set。
        setSelectedIds((current) => {
            // Set 是可变对象，复制后再修改才能让 React 识别引用变化。
            const next = new Set(current);
            // 已选择则删除，未选择则加入，实现单行切换。
            next.has(id) ? next.delete(id) : next.add(id);
            // 返回新 Set 触发视图更新。
            return next;
        });
    }, []);

    // 暴露稳定的命令函数，让工具栏可以平滑回到物理滚动顶部。
    const scrollToTop = useCallback(() => {
        // ref 未绑定时可选链会安全跳过；top 0 同时对应逻辑列表顶部。
        viewportRef.current?.scrollTo({top: 0, behavior: 'smooth'});
    }, []);

    // 步骤 5：切换规模只更新数字，不创建与总量等长的数据数组。
    const changeDataSize = useCallback((size: number) => {
        // 更新逻辑数量，区间模型会在下一次渲染时使用新边界。
        setItemCount(size);
        // 新数据规模视为新列表，清空旧业务选择状态。
        setSelectedIds(new Set());
        // 重置 React 中的物理位置。
        setPhysicalScrollTop(0);
        // 重置 React 中的逻辑位置。
        setLogicalScrollTop(0);
        // 恢复慢速滚动使用的最小缓冲数量。
        setOverscan(MIN_OVERSCAN);
        // 同步清空事件热路径中的最新物理位置。
        latestPhysicalScrollTopRef.current = 0;
        // 同步清空事件热路径中的最新逻辑位置。
        latestLogicalScrollTopRef.current = 0;
        // 清空速度计算基准，防止切换后第一次滚动误判为高速。
        previousLogicalScrollTopRef.current = 0;
        // 命令式复位浏览器真实滚动条，使 DOM 与两套 React 坐标一致。
        viewportRef.current?.scrollTo({top: 0});
    }, []);

    // 将视图需要的状态、命令和 DOM ref 作为固定高页面接口返回。
    return {
        // 切换逻辑数据规模并复位页面状态。
        changeDataSize,
        // 绑定到滚动容器的 React 滚动处理函数。
        handleScroll,
        // 当前完整列表的逻辑记录数量。
        itemCount,
        // 当前根据滚动距离计算出的前后缓冲条数。
        overscan,
        // 固定高模型计算出的当前虚拟窗口。
        range,
        // 仅包含当前窗口的业务对象数组。
        renderedItems,
        // 可见块在安全物理坐标系中的 transform 偏移。
        renderOffsetY,
        // spacer 物理高度和物理/逻辑滚动比例。
        scrollMetrics,
        // 独立于虚拟 DOM 生命周期的选择 id 集合。
        selectedIds,
        // 数据规模控件使用的当前选项值，与 itemCount 相同。
        selectedSize: itemCount,
        // 工具栏使用的回到顶部命令。
        scrollToTop,
        // 单行选择状态切换函数。
        toggleSelected,
        // 滚动容器 DOM ref。
        viewportRef,
    };
};
