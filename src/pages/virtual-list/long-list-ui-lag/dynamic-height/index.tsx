import React from 'react';
import {ArrowUpOutlined} from '@ant-design/icons';
import {DataSizeSelect} from '../shared/data-size-select';
import type {DynamicDemoItem} from '../shared/demo-data';
import style from '../style.module.scss';
import {useDynamicHeightList} from './use-dynamic-height-list';

/** 正文由视图按行数生成，数据源无需为百万条记录重复保存长文本。 */
const CONTENT_UNIT = '这是一段用于验证不定高度虚拟列表的业务描述。';

interface DynamicRowProps {
    index: number;
    item: DynamicDemoItem;
    selected: boolean;
    onToggle(id: number): void;
}

/** 行高测量和选择状态相互独立，未变化的可见行不会因其他行被选择而重渲染。 */
const DynamicRow = React.memo(({index, item, selected, onToggle}: DynamicRowProps) => (
    <article
        className={`${style.dynamicRow} ${selected ? style.dynamicSelected : ''}`}
        data-index={index}
    >
        <span className={style.rowIndex}>#{item.id.toLocaleString()}</span>
        <div>
            <h3>{item.title} · {item.lineCount} 行</h3>
            <p>
                {Array.from({length: item.lineCount}, (_, lineIndex) => (
                    <span key={lineIndex}>
                        第 {lineIndex + 1} 行：{CONTENT_UNIT}
                    </span>
                ))}
            </p>
            {item.image && (
                <img
                    className={style.dynamicImage}
                    src={item.image.src}
                    alt={item.image.alt}
                    width={item.image.layout === 'dimensions' ? item.image.width : undefined}
                    height={item.image.layout === 'dimensions' ? item.image.height : undefined}
                    style={item.image.layout === 'aspect-ratio' ? {
                        aspectRatio: item.image.aspectRatio,
                    } : undefined}
                    loading="lazy"
                    decoding="async"
                />
            )}
        </div>
        <button
            type="button"
            className={style.dynamicSelect}
            aria-pressed={selected}
            onClick={() => onToggle(item.id)}
        >
            {selected ? '已选择' : '选择'}
        </button>
    </article>
));

DynamicRow.displayName = 'DynamicRow';

export const DynamicHeightLongList = () => {
    const list = useDynamicHeightList();

    return (
        <main className={style.page}>
            <header className={style.pageHeader}>
                <div>
                    <h2>不定高度虚拟列表</h2>
                    <p>预估高度 · ResizeObserver 实测 · Fenwick Tree 动态修正</p>
                </div>
                <div className={style.metrics} aria-label="列表状态">
                    <span><strong>{list.itemCount.toLocaleString()}</strong> 条数据</span>
                    <span><strong>{list.renderedItems.length}</strong> 个 DOM 节点</span>
                    <span><strong>{list.measuredCount}</strong> 条已测量</span>
                    {list.scrollMetrics.scrollScale > 1 && (
                        <span>
                            <strong>{list.scrollMetrics.scrollScale.toFixed(1)}x</strong> 滚动压缩
                        </span>
                    )}
                </div>
            </header>

            <section className={style.toolbar} aria-label="列表工具栏">
                <DataSizeSelect
                    inputId="react-dynamic-data-size"
                    value={list.selectedSize}
                    onChange={list.changeDataSize}
                />
                <span className={style.toolbarHint}>
                    每条记录包含 3 到 10 行内容，图片使用固有宽高或 aspect-ratio 预留空间
                </span>
                <button type="button" title="回到列表顶部" onClick={list.scrollToTop}>
                    <ArrowUpOutlined aria-hidden />
                    <span>回到顶部</span>
                </button>
                <span className={style.selectionCount}>已选择 {list.selectedIds.size} 条</span>
            </section>

            <section
                ref={list.viewportRef}
                className={style.viewport}
                aria-label="不定高度虚拟长列表"
            >
                <div
                    className={style.spacer}
                    style={{height: list.scrollMetrics.physicalTotalHeight}}
                >
                    <div
                        ref={list.visibleListRef}
                        className={style.visibleList}
                        style={{transform: `translate3d(0, ${list.renderOffsetY}px, 0)`}}
                    >
                        {list.renderedItems.map(({item, index}) => (
                            <DynamicRow
                                key={item.id}
                                index={index}
                                item={item}
                                selected={list.selectedIds.has(item.id)}
                                onToggle={list.toggleSelected}
                            />
                        ))}
                    </div>
                </div>
            </section>
        </main>
    );
};

export default DynamicHeightLongList;
