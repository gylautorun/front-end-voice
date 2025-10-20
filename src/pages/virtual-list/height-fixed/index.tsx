import {useCallback, memo, useLayoutEffect, useRef} from 'react';
import {runInAction} from 'mobx';
import {observer, Observer} from 'mobx-react';
import {store, Item} from './state';
import style from './style.module.scss';
import {debounce} from 'lodash-es';

export const VirtualList = observer(() => {
  const ref = useRef<HTMLDivElement | null>(null);
  const {visibleData, listHeight, itemHeight} = store;
  // debounce 防抖时间 20 会有白屏, 50 比较明显
  const handleScroll = useCallback(debounce(() => {
    store.scrollEvent(ref.current);
  }, 16), []);
  useLayoutEffect(() => {
    const target = ref.current;
    if (target) {
      runInAction(() => {
        store.screenHeight = target.clientHeight;
      });
    }
    return () => {
      store.dispose();
    };
  }, [ref, store]);
  return (
    <div className={style.virtualListFixed} ref={ref} onScroll={handleScroll}>
      <div className={style.content} style={{height: listHeight}}>
        {visibleData.map((({id, value, title}) => (
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
        )))}
      </div>
    </div>
  );
});

export default VirtualList;
