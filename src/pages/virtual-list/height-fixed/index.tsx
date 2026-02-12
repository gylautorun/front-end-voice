import {useCallback, useLayoutEffect, useRef, memo} from 'react';
import {runInAction} from 'mobx';
import {observer} from 'mobx-react';
import {store} from './state';
import style from './style.module.scss';
import {debounce} from 'lodash-es';

// 列表项组件，使用 memo 避免不必要的重新渲染
const ListItem = memo(({ id, title, value, itemHeight }: { id: number, title: string, value: string, itemHeight: number }) => {
  return (
    <div
      className={style.contentItem}
      key={id}
      style={{height: itemHeight, top: (id - 1) * itemHeight}}
      data-id={id}
    >
      <div className={style.contentInner}>
        <div className={style.title}>{title}</div>
        <div className={style.value}>{value}</div>
      </div>
    </div>
  );
});

ListItem.displayName = 'ListItem';

export const VirtualList = observer(() => {
  const ref = useRef<HTMLDivElement | null>(null);
  const {visibleData, listHeight, itemHeight, loading} = store;
  // debounce 防抖时间 20 会有白屏, 50 比较明显
  const handleScroll = useCallback(debounce(() => {
    store.scrollEvent(ref.current);
  }, 16), []);
  // 提取获取 screenHeight 的逻辑到单独的函数
  const updateScreenHeight = useCallback(() => {
    if (!loading) {
      const target = ref.current;
      if (target) {
        runInAction(() => {
          store.screenHeight = target.clientHeight;
        });
      }
    }
  }, [loading, ref]);
  
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
  if (loading) {
    return (
      <div className={style.virtualListFixed} style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div>加载中...</div>
      </div>
    );
  }
  return (
    <div className={style.virtualListFixed} ref={ref} onScroll={handleScroll}>
      <div className={style.content} style={{height: listHeight}}>
        {visibleData.map(({id, value, title}) => (
          <ListItem
            key={id}
            id={id}
            title={title}
            value={value}
            itemHeight={itemHeight}
          />
        ))}
      </div>
    </div>
  );
});

export default VirtualList;
