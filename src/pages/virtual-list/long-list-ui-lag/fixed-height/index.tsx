import React from 'react';
import {ArrowUpOutlined} from '@ant-design/icons';
import {DataSizeSelect} from '../shared/data-size-select';
import type {FixedDemoItem} from '../shared/demo-data';
import style from '../style.module.scss';
import {FIXED_ITEM_HEIGHT, useFixedHeightList} from './use-fixed-height-list';

interface FixedRowProps {
    item: FixedDemoItem;
    selected: boolean;
    onToggle(id: number): void;
}

/** 单行只在自身数据或选中状态变化时重渲染。 */
const FixedRow = React.memo(({item, selected, onToggle}: FixedRowProps) => (
    <button
        type="button"
        className={`${style.fixedRow} ${selected ? style.selected : ''}`}
        aria-pressed={selected}
        onClick={() => onToggle(item.id)}
    >
        <span className={style.rowIndex}>#{item.id.toLocaleString()}</span>
        <span className={style.rowContent}>
            <strong>{item.title}</strong>
            <small>{item.summary}</small>
        </span>
        <span className={style.rowStatus}>{selected ? '已选择' : '选择'}</span>
    </button>
));

FixedRow.displayName = 'FixedRow';

export const FixedHeightLongList = () => {
    const list = useFixedHeightList();

    return (
        <main className={style.page}>
            <header className={style.pageHeader}>
                <div>
                    <h2>高性能长列表</h2>
                    <p>固定高度虚拟化 · 动态缓冲 · 每帧最多更新一次</p>
                </div>
                <div className={style.metrics} aria-label="列表状态">
                    <span><strong>{list.itemCount.toLocaleString()}</strong> 条数据</span>
                    <span><strong>{list.renderedItems.length}</strong> 个 DOM 节点</span>
                    <span><strong>{list.overscan}</strong> 条缓冲</span>
                    {list.scrollMetrics.scrollScale > 1 && (
                        <span>
                            <strong>{list.scrollMetrics.scrollScale.toFixed(1)}x</strong> 滚动压缩
                        </span>
                    )}
                </div>
            </header>

            <section className={style.toolbar} aria-label="列表工具栏">
                <DataSizeSelect
                    inputId="react-fixed-data-size"
                    value={list.selectedSize}
                    onChange={list.changeDataSize}
                />
                <button type="button" title="回到列表顶部" onClick={list.scrollToTop}>
                    <ArrowUpOutlined aria-hidden />
                    <span>回到顶部</span>
                </button>
                <span className={style.selectionCount}>已选择 {list.selectedIds.size} 条</span>
            </section>

            <section
                ref={list.viewportRef}
                className={style.viewport}
                aria-label="固定高度虚拟长列表"
                onScroll={list.handleScroll}
            >
                <div
                    className={style.spacer}
                    style={{height: list.scrollMetrics.physicalTotalHeight}}
                >
                    <div
                        className={style.visibleList}
                        style={{transform: `translate3d(0, ${list.renderOffsetY}px, 0)`}}
                    >
                        {list.renderedItems.map((item) => (
                            <FixedRow
                                key={item.id}
                                item={item}
                                selected={list.selectedIds.has(item.id)}
                                onToggle={list.toggleSelected}
                            />
                        ))}
                    </div>
                </div>
            </section>
            <span className={style.srOnly}>固定列表项高度 {FIXED_ITEM_HEIGHT} 像素</span>
        </main>
    );
};

export default FixedHeightLongList;
