import {useState, useEffect, useContext, useRef} from 'react';
import {Observer} from 'mobx-react';

import {store} from './state';
import style from './style.module.scss';
import {BasicLayoutContext} from '../../../layouts/basic/context';
import { runInAction } from 'mobx';

export function VirtualList() {
  const ref = useRef<Array<HTMLDivElement | null>>([]);
  const constRef = useRef<{isInitial: boolean}>({isInitial: true});
  const {data} = store;
  const {scrollRef} = useContext(BasicLayoutContext);
  useEffect(() => {
    const elements = ref.current || [];
    const callback = (entries: IntersectionObserverEntry[]) => {
      let _entries = entries;
      if (_entries.length === store.data.length) {
        _entries = _entries.reduce((pre, cur, index) => {
          if (cur.isIntersecting) {
            pre.push(cur)
          }
          else {
              _entries.splice(index)
          }
          return pre;
        }, [] as IntersectionObserverEntry[])
      }
      _entries.forEach((row) => {
        const target = row.target as HTMLDivElement & {
          dataset: {
            index: string;
          };
        };
        const index = +target.dataset.index;
        runInAction(() => {
          // 判断是否在可视区域
          if (!row.isIntersecting) {
            // 离开可视区时设置实际高度进行占位 并使数据无法渲染
            if (!constRef.current.isInitial) {
              target.style.height = `${target.clientHeight}px`;
              store.data[index].visible = false;
            }
          }
          else {
              // 元素进入可视区，使数据可以渲染
              target.style.height = '';
              store.data[index].visible = true;
          }
        });
      });
    };
    const observer = new IntersectionObserver(
      callback,
      {root: scrollRef.current, rootMargin: '600px 0px',}
    );

    // observe遍历监听所有img节点
    elements.forEach(ele => {
      if (ele) {
        ele.setAttribute('data-info', 'opaque');
        observer.observe(ele);
      }
    });
    constRef.current.isInitial = false;
    return () => {
      observer.disconnect();
    };
  }, [scrollRef, ref, constRef, store]);

  return (
    <div className={style.virtualList}>
      <h1>虚拟列表</h1>
      {data.map((item, index) => {
        return (
          <div
            className={style.contentItem}
            ref={r => {
              r?.setAttribute('data-index', index.toString());
              ref.current.push(r);
            }}
            key={item.id || index}
          >
            <Observer key={item.id || index}>
              {() => {
                if (!item.visible) {
                  return null;
                }
                return (
                  <div>{item.value}</div>
                );
              }}
            </Observer>
          </div>
        );
      })}
    </div>
  )
}

export default VirtualList;
