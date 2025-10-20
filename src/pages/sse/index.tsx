import {useState, useEffect} from 'react';
import style from './style.module.scss';

export function Sse() {
  const [data, setData] = useState<Array<{id: string; value: string; close?: boolean}>>([]);
  useEffect(() => {
    const source = new EventSource('http://localhost:8081/api/sse');
    source.onopen = function(e) {
      // 当连接正式建立时触发
      console.log(e, 'onopen');
    };
    /**
     * data 服务器端传回的数据
     * origin 服务器端URL的域名部分,有protocol,hostname,port
     * lastEventId 用来指定当前数据的序号.主要用来断线重连时数据的有效性
     */
    source.onmessage = function(e) {
      const data = JSON.parse(e.data);
      console.log(e, data, 'onmessage');
      if (!data || data.close) {
        // 数据传输完毕，无数据时关闭连接
        source.close();
      }
      else {
        setData(prev => {
          return [...prev, data];
        });
      }
    };
    source.onerror = function(e) {
      // 当连接发生error时触发
      console.log(e, 'onerror');
    };

    return () => {
      source.close();
    };

  }, []);

  return (
    <div className={style.sse}>
      <h1>SSE 通讯</h1>
      <div>
        {data.map(item => {
          return (
            <div key={item.id}>{item.value}</div>
          );
        })}
      </div>
    </div>
  )
}

export default Sse;
