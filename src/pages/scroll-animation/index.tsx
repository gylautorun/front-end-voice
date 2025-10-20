import {useState, useEffect, useContext, useRef} from 'react';
import style from './style.module.scss';
import {BasicLayoutContext} from '../../layouts/basic/context';

const data = new Array(10).fill(0).map((_, index) => {
  return {id: index, value: `Content${index}`};
});
export function ScrollAnimation() {
  const ref = useRef<Array<HTMLDivElement | null>>([]);
  const {scrollRef} = useContext(BasicLayoutContext);
  useEffect(() => {
    const scroll = scrollRef.current;
    const boxList = ref.current;
    if (!scroll) {
      return;
    }
    const animation = () => {
      const {height} = scroll.getBoundingClientRect();
      const triggerBottom = height / 5 * 4;
      // console.log(height, triggerBottom, boxList);
      boxList.forEach(box => {
        if (!box) {
          return;
        }
        const {top} = box.getBoundingClientRect();
        if(top < triggerBottom) {
          box.setAttribute('data-visible', 'show');
        }
        else {
          box.setAttribute('data-visible', 'hidden');
        }
      })
    };
    scroll?.addEventListener('scroll', animation);
    return () => {
      scroll?.removeEventListener('scroll', animation);
    };
  }, [scrollRef, ref]);
  return (
    <div className={style.scrollAnimation}>
      <h1>Scroll to see the animation</h1>
      {data.map(item => {
        return (
          <div
            className={style.box}
            key={item.id}
            ref={r => ref.current.push(r)}
          >
            <h2>{item.value}</h2>
          </div>
        );
      })}
    </div>
  )
}

export default ScrollAnimation;
