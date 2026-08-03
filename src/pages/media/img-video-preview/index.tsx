import {useState, useRef, useMemo} from 'react'
import {Button, Input} from 'antd';
import style from './style.module.scss';

const createElementGraphics = (tag: 'img' | 'video' | undefined, value: string) => {
  if (!tag) {
    return null;
  }
  if (tag === 'img') {
    const element: HTMLImageElement = document.createElement(tag);
    element.setAttribute('src', value);
    return element;
  }
  // tag === 'video'
  const element: HTMLVideoElement = document.createElement(tag);
  element.controls = true;
  element.setAttribute('src', value);
  return element;
};
const getGraphicsTag = (type: string): 'img' | 'video' | undefined => {
  if (/image/g.test(type)) {
    return 'img';
  }
  else if (/video/g.test(type)) {
    return 'video';
  }
  return undefined;
};
const clearChildren = (element: HTMLElement | null) => {
  while(element && element.firstChild) {
    element.removeChild(element.firstChild);
  }
};

export default function ImgVideoPreview() {
  const dataUrlRef = useRef<HTMLDivElement>(null);
  const binaryRef = useRef<HTMLDivElement>(null);
  const handleDataUrl = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const fileRender = new FileReader();
      fileRender.readAsDataURL(file);  // 将文件读取为Data URL

      fileRender.onload = (e: ProgressEvent<FileReader>) => {
          const result = e.target?.result as string;
          const tag = getGraphicsTag(file.type);
          const element = createElementGraphics(tag, result);
          if (element && dataUrlRef.current) {
            clearChildren(dataUrlRef.current);
            dataUrlRef.current.append(element);
          }
      }
    }
  };

  const handleBinary = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // 文件转化成二进制文件
      const blob = new Blob([file]);
      // 转化成url
      const url = URL.createObjectURL(blob);
      const tag = getGraphicsTag(file.type);
      const element = createElementGraphics(tag, url);
      const current = binaryRef.current;
      if (element && current) {
        clearChildren(current);
        current.append(element);
        element.onload = (e: Event) => {
          console.log(e, 'e')
          // 释放createObjectURL创建的对象
          URL.revokeObjectURL(element.src);
        };
      }
    }
  };
  return (
    <div className={style.imgVideoPreview}>
      <div className={style.section}>
        <h3>{'将文件读取为Data URL'}</h3>
        <input className={style.upload} type="file" onChange={handleDataUrl} />
        <div ref={dataUrlRef} className={style.preview}></div>
      </div>

      <div className={style.section}>
        <h3>{'文件转化成二进制文件'}</h3>
        <input className={style.upload} type="file" onChange={handleBinary} />
        <div ref={binaryRef} className={style.preview}></div>
      </div>
    </div>
  );
};
