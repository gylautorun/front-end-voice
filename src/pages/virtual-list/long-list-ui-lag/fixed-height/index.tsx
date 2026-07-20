/** 引入 React，并使用 React.memo 避免未变化的可见行重复渲染。 */
import React from 'react';
/** 引入工具栏“回到顶部”按钮使用的向上箭头图标。 */
import {ArrowUpOutlined} from '@ant-design/icons';
/** 引入固定高和不定高页面共用的数据规模选择器。 */
import {DataSizeSelect} from '../shared/data-size-select';
/** 仅引入固定高度业务对象类型，不生成运行时代码。 */
import type {FixedDemoItem} from '../shared/demo-data';
/** 引入当前长列表页面共用的 CSS Modules 类名映射。 */
import style from '../style.module.scss';
/** 引入固定行高常量和封装页面状态、滚动调度的 Hook。 */
import {FIXED_ITEM_HEIGHT, useFixedHeightList} from './use-fixed-height-list';

interface FixedRowProps {
    /** 当前虚拟窗口按完整列表索引即时生成的固定高业务对象。 */
    item: FixedDemoItem;
    /** 当前项目是否存在于页面级 selectedIds Set。 */
    selected: boolean;
    /** 使用稳定业务 id 切换页面级选择状态的回调。 */
    onToggle(id: number): void;
}

/** 单行只在自身数据或选中状态变化时重渲染。 */
const FixedRow = React.memo(({item, selected, onToggle}: FixedRowProps) => (
    // 整行使用 button，使点击区域完整且天然支持键盘聚焦和 Enter/Space 操作。
    <button
        // 明确使用普通按钮，避免位于 form 中时默认触发表单提交。
        type="button"
        // 选中时追加状态类，但固定高度始终保持 FIXED_ITEM_HEIGHT。
        className={`${style.fixedRow} ${selected ? style.selected : ''}`}
        // 向辅助技术暴露当前二态选择结果。
        aria-pressed={selected}
        // 只向外传稳定业务 id，由 Hook 使用函数式 Set 更新状态。
        onClick={() => onToggle(item.id)}
    >
        {/* 展示完整逻辑列表中的稳定业务 id。 */}
        <span className={style.rowIndex}>#{item.id.toLocaleString()}</span>
        {/* 标题与摘要放在内容列中，样式保证它们不突破固定行高。 */}
        <span className={style.rowContent}>
            {/* 固定高度记录的主标题。 */}
            <strong>{item.title}</strong>
            {/* 根据索引即时生成的辅助摘要。 */}
            <small>{item.summary}</small>
        </span>
        {/* 固定宽度状态区域避免文案切换导致行内布局抖动。 */}
        <span className={style.rowStatus}>{selected ? '已选择' : '选择'}</span>
    </button>
));

/** 为 React DevTools 提供稳定、可读的 memo 组件名称。 */
FixedRow.displayName = 'FixedRow';

/** 固定高度虚拟列表页面，只负责组装视图，滚动和坐标逻辑委托给 Hook。 */
export const FixedHeightLongList = () => {
    // 一次取得页面渲染所需的状态、派生数据、命令和 DOM ref。
    const list = useFixedHeightList();

    // 页面由头部指标、工具栏和三层虚拟滚动 DOM 组成。
    return (
        // main 是页面视觉容器，不承担滚动职责。
        <main className={style.page}>
            {/* 页面头部展示方案名称和实时运行指标。 */}
            <header className={style.pageHeader}>
                {/* 左侧标题概括固定高、动态缓冲和 rAF 合帧策略。 */}
                <div>
                    <h2>高性能长列表</h2>
                    <p>固定高度虚拟化 · 动态缓冲 · 每帧最多更新一次</p>
                </div>
                {/* 右侧指标帮助观察逻辑条数与真实 DOM 数量是否解耦。 */}
                <div className={style.metrics} aria-label="列表状态">
                    {/* 完整逻辑数据量，只是数字，不代表创建了同等数量对象。 */}
                    <span><strong>{list.itemCount.toLocaleString()}</strong> 条数据</span>
                    {/* 当前窗口真正创建的 React 行节点数量。 */}
                    <span><strong>{list.renderedItems.length}</strong> 个 DOM 节点</span>
                    {/* 当前按帧间滚动距离计算出的前后缓冲条数。 */}
                    <span><strong>{list.overscan}</strong> 条缓冲</span>
                    {/* 只有逻辑高度超过物理安全高度时才展示压缩比例。 */}
                    {list.scrollMetrics.scrollScale > 1 && (
                        <span>
                            <strong>{list.scrollMetrics.scrollScale.toFixed(1)}x</strong> 滚动压缩
                        </span>
                    )}
                </div>
            </header>

            {/* 工具栏负责数据规模、回到顶部和选择计数，不参与虚拟窗口布局。 */}
            <section className={style.toolbar} aria-label="列表工具栏">
                <DataSizeSelect
                    // 唯一 id 用于关联选择控件标签。
                    inputId="react-fixed-data-size"
                    // 当前值直接使用 Hook 中的逻辑 itemCount。
                    value={list.selectedSize}
                    // 切换时复位滚动、缓冲和选择状态。
                    onChange={list.changeDataSize}
                />
                {/* 命令按钮调用 Hook 暴露的平滑滚动函数。 */}
                <button type="button" title="回到列表顶部" onClick={list.scrollToTop}>
                    {/* 图标对视觉用户表达方向，aria-hidden 避免屏幕阅读器重复朗读。 */}
                    <ArrowUpOutlined aria-hidden />
                    <span>回到顶部</span>
                </button>
                {/* Set.size 统计完整列表选择结果，不受当前虚拟窗口影响。 */}
                <span className={style.selectionCount}>已选择 {list.selectedIds.size} 条</span>
            </section>

            {/* 第一层 viewport：真正产生浏览器物理 scrollTop 的滚动容器。 */}
            <section
                // Hook 使用该 ref 观察视口高度并执行命令式回顶。
                ref={list.viewportRef}
                className={style.viewport}
                aria-label="固定高度虚拟长列表"
                // 高频事件只写 ref 并预约 rAF，不直接逐事件提交 React 状态。
                onScroll={list.handleScroll}
            >
                {/* 第二层 spacer：只用安全物理高度撑开滚动条，不渲染业务内容。 */}
                <div
                    className={style.spacer}
                    style={{height: list.scrollMetrics.physicalTotalHeight}}
                >
                    {/* 第三层 visibleList：移动到当前窗口位置，只包含视口附近行。 */}
                    <div
                        className={style.visibleList}
                        style={{transform: `translate3d(0, ${list.renderOffsetY}px, 0)`}}
                    >
                        {/* 使用稳定业务 id 作为 key，避免滚动后错误复用行内部状态。 */}
                        {list.renderedItems.map((item) => (
                            <FixedRow
                                // item.id 在完整逻辑列表中稳定且唯一。
                                key={item.id}
                                // 当前窗口即时生成的固定高业务对象。
                                item={item}
                                // 从页面级 Set 派生当前项目的选择状态。
                                selected={list.selectedIds.has(item.id)}
                                // 稳定回调引用配合 React.memo 避免无关重渲染。
                                onToggle={list.toggleSelected}
                            />
                        ))}
                    </div>
                </div>
            </section>
            {/* 屏幕阅读器可读取固定行高信息，视觉上由 srOnly 类隐藏。 */}
            <span className={style.srOnly}>固定列表项高度 {FIXED_ITEM_HEIGHT} 像素</span>
        </main>
    );
};

/** 路由懒加载默认导出固定高度页面组件。 */
export default FixedHeightLongList;
