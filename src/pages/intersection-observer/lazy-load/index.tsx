import {useState, useEffect, useContext, useRef} from 'react';
import style from './style.module.scss';
import {BasicLayoutContext} from '../../../layouts/basic/context';

const list = [
  {
    url: '//game.gtimg.cn/images/lol/act/img/skinloading/412017.jpg',
    title: '灵魂莲华 锤石',
  },
  {
    url: '//game.gtimg.cn/images/lol/act/img/skinloading/4013.jpg',
    title: '奥德赛 崔斯特',
  },
  {
    url: '//game.gtimg.cn/images/lol/act/img/skinloading/64031.jpg',
    title: '神龙尊者 圣龙李青',
  },
  {
    url: '//game.gtimg.cn/images/lol/act/img/skinloading/28015.jpg',
    title: 'K/DA ALL OUT 伊芙琳',
  },
  {
    url: '//game.gtimg.cn/images/lol/act/img/skinloading/246002.jpg',
    title: '真实伤害 奇亚娜',
  },
  {
    url: '//game.gtimg.cn/images/lol/act/img/skinloading/421009.jpg',
    title: '黯晶巨兽 雷克塞',
  },
].map((item, index) => ({...item, id: index}));
export function LazyLoad() {
  const ref = useRef<Array<HTMLImageElement | null>>([]);
  const {scrollRef} = useContext(BasicLayoutContext);
  useEffect(() => {
    const imgList = ref.current || [];
    const callback = (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => {
      entries.forEach((item) => {
        // isIntersecting是一个Boolean值，判断目标元素当前是否可见
        if (item.isIntersecting) {
          const target = item.target as HTMLImageElement & {
            src: string;
            dataset: {
              src: string;
            }
          };
          const dataset = target.dataset;
          target.src = dataset.src;
          // 图片加载后即停止监听该元素
          observer.unobserve(item.target)
        }
      })
    };
    const observer = new IntersectionObserver(
      callback,
      {root: scrollRef.current}
    );
    // observe遍历监听所有img节点
    imgList.forEach(img => {
      img && observer.observe(img);
    })
  }, [scrollRef, ref]);
  return (
    <div className={style.lazyLoad}>
      <h1>懒加载</h1>
      <div className={style.content}>
        {list.map((item) => {
          return (
            <div key={item.id} className={style.skinImg}>
              <img
                className={style.img}
                ref={r => ref.current.push(r)}
                data-src={item.url} 
                alt={item.title} 
              />
            </div>
          );
        })}
      </div>
    </div>
  )
}

export default LazyLoad;
