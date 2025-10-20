import {useState, useEffect, useContext, useCallback, useRef} from 'react';
import cx from 'classnames';
import style from './style.module.scss';
// import {BasicLayoutContext} from '../../../layouts/basic/context';

function getArray(num: number = 10) {
  return new Array(num).fill('列表单元');
}
export function InfiniteScroll() {
  // const {scrollRef} = useContext(BasicLayoutContext);
  const [list, setList] = useState<string[]>(getArray());
  const [loading, setLoading] = useState(false);
  const lastRef = useRef(null);
  const loadMore = useCallback(async () => {
    setLoading(true);
    const data: string[] = await new Promise((resolve) => {
      setTimeout(() => {
        resolve(getArray());
      }, 1500);
    });
    setList(prev => [...prev, ...data]);
    setLoading(false);
  }, [loading]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !loading) {
        loadMore();
      }
    });
    lastRef.current && observer.observe(lastRef.current);
    return () => {
      observer.disconnect();
    };
  }, [lastRef])
  return (
    <div className={style.infiniteScroll}>
      <h1>无限滚动</h1>
      {list.map((item, index) => {
        return (
          <div key={index} className={style.contentItem}>{item}-{index}</div>
        );
      })}
      {loading && <div className={style.loading}>loading...</div>}
      <div ref={lastRef}></div>
    </div>
  );
}

export default InfiniteScroll;
