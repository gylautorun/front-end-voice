import {useState, useEffect, useContext, useRef} from 'react';
import cx from 'classnames';
import style from './style.module.scss';
import {BasicLayoutContext} from '../../../layouts/basic/context';

const data = new Array(20).fill(0).map((_, index) => {
  return {id: index, value: `Content-${index}`};
});
export function InfiniteScroll() {
  const ref = useRef<Array<HTMLDivElement | null>>([]);
  const {scrollRef} = useContext(BasicLayoutContext);
  useEffect(() => {
    const elements = ref.current || [];
    const callback = (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
            const element = entry.target;
            element.setAttribute('data-info', 'come-in');
            observer.unobserve(element);
        }
      });
    };
    const observer = new IntersectionObserver(
      callback,
      // {root: scrollRef.current}
    );

    // observe遍历监听所有img节点
    elements.forEach(ele => {
      if (ele) {
        ele.setAttribute('data-info', 'opaque');
        observer.observe(ele);
      }
    })
  }, [scrollRef, ref]);
  return (
    <div className={style.infiniteScroll}>
      <h1>无限滚动动画</h1>
      {data.map((item, index) => {
        return (
          <div
            className={cx(style.observerItem, {
              [style.even]: index % 2 === 0,
              [style.odd]: index % 2 !== 0,
            })}
            ref={r => ref.current.push(r)}
            key={item.id}
          >
            {item.value}
          </div>
        );
      })}
    </div>
  );
}

export default InfiniteScroll;
