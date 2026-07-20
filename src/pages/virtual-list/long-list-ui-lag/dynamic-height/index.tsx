/** 引入 React，并使用 React.memo 避免未变化的可见行重复渲染。 */
import React from 'react';
/** 引入工具栏“回到顶部”按钮使用的向上箭头图标。 */
import {ArrowUpOutlined} from '@ant-design/icons';
/** 引入固定高和不定高页面共用的数据规模选择器。 */
import {DataSizeSelect} from '../shared/data-size-select';
/** 仅引入动态业务对象类型，不生成运行时代码。 */
import type {DynamicDemoItem} from '../shared/demo-data';
/** 引入当前长列表页面共用的 CSS Modules 类名映射。 */
import style from '../style.module.scss';
/** 引入封装滚动、测量、坐标和选择状态的不定高页面 Hook。 */
import {useDynamicHeightList} from './use-dynamic-height-list';

/** 正文由视图按行数生成，数据源无需为百万条记录重复保存长文本。 */
const CONTENT_UNIT = '这是一段用于验证不定高度虚拟列表的业务描述。';

interface DynamicRowProps {
    /** 项目在完整逻辑列表中的 0-based 索引，写入 data-index 供 ResizeObserver 回调识别。 */
    index: number;
    /** 当前窗口按索引即时生成的动态业务数据。 */
    item: DynamicDemoItem;
    /** 当前项目是否存在于页面级 selectedIds Set。 */
    selected: boolean;
    /** 使用稳定业务 id 切换页面级选择状态的回调。 */
    onToggle(id: number): void;
}

/** 行高测量和选择状态相互独立，未变化的可见行不会因其他行被选择而重渲染。 */
const DynamicRow = React.memo(({index, item, selected, onToggle}: DynamicRowProps) => (
    // article 是 ResizeObserver 的直接观察目标，包含正文、图片、边距和边框的完整高度。
    <article
        // 选中时追加状态类；按钮尺寸固定，状态切换不会改变测量高度。
        className={`${style.dynamicRow} ${selected ? style.dynamicSelected : ''}`}
        // 保存完整列表索引，测量回调据此把真实高度写回正确的 Fenwick 项目。
        data-index={index}
    >
        {/* 展示稳定业务 id，而不是当前虚拟窗口中的局部索引。 */}
        <span className={style.rowIndex}>#{item.id.toLocaleString()}</span>
        {/* 正文与可选图片放在同一内容列中，共同决定该行真实高度。 */}
        <div>
            {/* 标题同时展示本条数据将要生成的正文行数。 */}
            <h3>{item.title} · {item.lineCount} 行</h3>
            {/* 根据 lineCount 即时创建演示文本，不在百万条逻辑数据中保存重复长字符串。 */}
            <p>
                {Array.from({length: item.lineCount}, (_, lineIndex) => (
                    // 行号在当前项目内部稳定，可作为这组静态演示行的 key。
                    <span key={lineIndex}>
                        第 {lineIndex + 1} 行：{CONTENT_UNIT}
                    </span>
                ))}
            </p>
            {/* 没有图片字段时不创建 img；有图片时在加载前通过尺寸策略预留空间。 */}
            {item.image && (
                <img
                    // 公共类负责展示宽度、响应式上限、间距、占位背景和 object-fit。
                    className={style.dynamicImage}
                    // 固定 seed URL 保证项目滚出并重新进入窗口后仍显示同一张图片。
                    src={item.image.src}
                    // 替代文本用于图片失败场景和屏幕阅读器。
                    alt={item.image.alt}
                    // dimensions 策略传 HTML 固有宽度；aspect-ratio 策略刻意省略该属性。
                    width={item.image.layout === 'dimensions' ? item.image.width : undefined}
                    // dimensions 策略传 HTML 固有高度；aspect-ratio 策略刻意省略该属性。
                    height={item.image.layout === 'dimensions' ? item.image.height : undefined}
                    // aspect-ratio 策略仅通过 CSS 比例预留高度，避免两套尺寸配置并存。
                    style={item.image.layout === 'aspect-ratio' ? {
                        aspectRatio: item.image.aspectRatio,
                    } : undefined}
                    // 只在图片接近视口时请求资源，减少虚拟窗口外的网络工作。
                    loading="lazy"
                    // 允许浏览器异步解码，降低图片解码阻塞主线程的概率。
                    decoding="async"
                />
            )}
        </div>
        {/* 选择按钮是行的一部分，但选择状态保存在 Hook，不依赖当前 DOM 是否挂载。 */}
        <button
            // 明确使用普通按钮，避免位于 form 中时默认触发表单提交。
            type="button"
            // 固定尺寸类保证“选择/已选择”切换时不改变动态行高。
            className={style.dynamicSelect}
            // 向辅助技术暴露当前二态选择结果。
            aria-pressed={selected}
            // 只向外传稳定业务 id，由 Hook 使用函数式 Set 更新状态。
            onClick={() => onToggle(item.id)}
        >
            {selected ? '已选择' : '选择'}
        </button>
    </article>
));

/** 为 React DevTools 提供稳定、可读的 memo 组件名称。 */
DynamicRow.displayName = 'DynamicRow';

/** 不定高度虚拟列表页面，只负责组装视图，滚动和测量逻辑全部委托给 Hook。 */
export const DynamicHeightLongList = () => {
    // 一次取得页面渲染所需的状态、派生数据、命令和 DOM ref。
    const list = useDynamicHeightList();

    // 页面由头部指标、工具栏和三层虚拟滚动 DOM 组成。
    return (
        // main 是页面视觉容器，不承担滚动职责。
        <main className={style.page}>
            {/* 页面头部展示方案名称和实时运行指标。 */}
            <header className={style.pageHeader}>
                {/* 左侧标题说明当前页面使用预估、实测和稀疏高度修正。 */}
                <div>
                    <h2>不定高度虚拟列表</h2>
                    <p>预估高度 · ResizeObserver 实测 · Fenwick Tree 动态修正</p>
                </div>
                {/* 右侧指标帮助观察逻辑条数与真实 DOM 数量是否解耦。 */}
                <div className={style.metrics} aria-label="列表状态">
                    {/* 完整逻辑数据量，只是数字，不代表创建了同等数量对象。 */}
                    <span><strong>{list.itemCount.toLocaleString()}</strong> 条数据</span>
                    {/* 当前窗口真正创建的 React 行节点数量。 */}
                    <span><strong>{list.renderedItems.length}</strong> 个 DOM 节点</span>
                    {/* 当前会话中曾写入有效真实高度的业务项目数量。 */}
                    <span><strong>{list.measuredCount}</strong> 条已测量</span>
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
                    inputId="react-dynamic-data-size"
                    // 当前值直接使用 Hook 中的逻辑 itemCount。
                    value={list.selectedSize}
                    // 切换时重建高度模型并复位滚动和选择状态。
                    onChange={list.changeDataSize}
                />
                {/* 提示当前数据高度分布和两种图片占位方式。 */}
                <span className={style.toolbarHint}>
                    每条记录包含 3 到 10 行内容，图片使用固有宽高或 aspect-ratio 预留空间
                </span>
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
                // Hook 使用该 ref 注册 passive scroll、观察尺寸并命令式补偿位置。
                ref={list.viewportRef}
                className={style.viewport}
                aria-label="不定高度虚拟长列表"
            >
                {/* 第二层 spacer：只用安全物理高度撑开滚动条，不渲染业务内容。 */}
                <div
                    className={style.spacer}
                    style={{height: list.scrollMetrics.physicalTotalHeight}}
                >
                    {/* 第三层 visibleList：移动到当前窗口位置，只包含视口附近行。 */}
                    <div
                        // Hook 通过该 ref 查询 data-index 节点并绑定共享 ResizeObserver。
                        ref={list.visibleListRef}
                        className={style.visibleList}
                        style={{transform: `translate3d(0, ${list.renderOffsetY}px, 0)`}}
                    >
                        {/* 使用稳定业务 id 作为 key，避免滚动后错误复用行内部状态。 */}
                        {list.renderedItems.map(({item, index}) => (
                            <DynamicRow
                                // item.id 在完整逻辑列表中稳定且唯一。
                                key={item.id}
                                // 完整列表索引用于 DOM 测量结果回写高度模型。
                                index={index}
                                // 当前窗口即时生成的业务对象。
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
        </main>
    );
};

/** 路由懒加载默认导出不定高度页面组件。 */
export default DynamicHeightLongList;
