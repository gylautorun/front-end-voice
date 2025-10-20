import {useState, useEffect, useRef, useMemo, useCallback} from 'react'
import {Button, Form, Input, Select, Slider} from 'antd';
import { getId } from '../../../utils/util-get-id';
import style from './style.module.scss';

// const sharedWorker = new SharedWorker(new URL('./worker.ts', import.meta.url));
// let currentWindow = getCurrentWindowState();
// let id = getId();
// sharedWorker.port.postMessage({
//   action: 'windowStateChanged',
//   payload: {
//     id,
//     newWindow: currentWindow,
//   },
// });
// setInterval(() => {
//   const newWindow = getCurrentWindowState();
//   if (
//     didWindowChange({
//       newWindow,
//       oldWindow: currentWindow,
//     })
//   ) {
//     sharedWorker.port.postMessage({
//       action: 'windowStateChanged',
//       payload: {
//         id,
//         newWindow: currentWindow,
//       },
//     });
//     currentWindow = newWindow;
//   }
// }, 100);
// sharedWorker.port.onmessage = (event: MessageEvent<WorkerMessage>) => {
//   const msg = event.data;
//   switch (msg.action) {
//     case "sync": {
//       const windows = msg.payload.allWindows;
//       ctx.reset();
//       drawMainCircle(ctx, center);
//       windows
//         .forEach(({ windowState: targetWindow }) => {
//           drawConnectingLine({
//             ctx,
//             hostWindow: currentWindow,
//             targetWindow,
//           });
//         });
//     }
//   }
// };
export function ShareWorker() {
  
  return (
    <div className={style.shareWorker}>
      <h1>ShareWorker</h1>
    </div>
  )
}

export default ShareWorker;
