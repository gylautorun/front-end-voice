import React, {useCallback, useLayoutEffect, memo, useRef, type ChangeEvent} from 'react';
import {runInAction} from 'mobx';
import {observer} from 'mobx-react';
import {store} from './state';
import style from './style.module.scss';
import {debounce} from 'lodash-es';
import {VIRTUAL_LIST_DATA_SIZE_OPTIONS} from '../method';


interface IListItemProps {
  id: number;
  title: string;
  value: string;
  itemHeight: number;
  top: number;
  bottom?: number;
  height?: number;
}

// 列表项组件，使用 memo 避免不必要的重新渲染
const ListItem = memo(({ id, title, value, top, height }: IListItemProps) => {
  const handleItemRef = useCallback((r: HTMLDivElement | null) => {
    if (r) {
      runInAction(() => {
        store.addRef(r);
      });
    }
  }, []);
  
  return (
    <div
      className={style.contentItem}
      key={id}
      ref={handleItemRef}
      data-id={id}
    >
      <div className={style.contentInner}>
        <div className={style.title}>{title}</div>
        <div className={style.value}>{value}</div>
      </div>
    </div>
  );
});

export const VirtualList = observer(() => {
  const ref = useRef<HTMLDivElement | null>(null);
  const {visibleData, listHeight, currentOffset, positions, loading, dataSize} = store;
  
  const handleScroll = useCallback(
    debounce(() => {
      store.scrollEvent(ref.current);
    }, 20),
    []
  );

  // 提取获取 screenHeight 的逻辑到单独的函数
  const updateScreenHeight = useCallback(() => {
    const target = ref.current;
    if (target) {
      runInAction(() => {
        store.screenHeight = target.clientHeight;
      });
    }
  }, []);
    
  useLayoutEffect(() => {
    // 初始化时更新 screenHeight
    updateScreenHeight();
    
    // 添加窗口大小变化监听，确保 screenHeight 能够动态更新
    window.addEventListener('resize', updateScreenHeight);
    
    return () => {
      window.removeEventListener('resize', updateScreenHeight);
      store.dispose();
    };
  }, [updateScreenHeight]);

  // 数据加载完成后再次更新 screenHeight，确保容器已经渲染
  useLayoutEffect(() => {
    if (!loading) {
      updateScreenHeight();
    }
  }, [loading, updateScreenHeight]);

  /** 切换规模后回到顶部，并交给 store 复用原有 Worker 生成流程。 */
  const handleDataSizeChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    ref.current?.scrollTo({top: 0});
    store.changeDataSize(Number(event.currentTarget.value));
  }, []);

  return (
    <div className={style.page}>
      <div className={style.toolbar}>
        <label htmlFor="height-auto-data-size">数据量</label>
        <select
          id="height-auto-data-size"
          value={dataSize}
          onChange={handleDataSizeChange}
        >
          {VIRTUAL_LIST_DATA_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>{size.toLocaleString()}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <div className={style.virtualListAuto}>
          <div className={style.loading}>加载中...</div>
        </div>
      ) : (
        <div className={style.virtualListAuto} ref={ref} onScroll={handleScroll}>
          <div className={style.phantom} style={{height: listHeight}}></div>
          <div
            className={style.content}
            style={{transform: `translate3d(0, ${currentOffset}px, 0)`}}
          >
            {visibleData.map(({id, value, title, index}) => {
              const position = positions[index];
              const top = position.top - currentOffset;
              return (
                <ListItem
                  key={id}
                  id={id}
                  title={title}
                  value={value}
                  itemHeight={position.height}
                  top={top}
                  height={position.height}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

export default VirtualList;
