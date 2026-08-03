import type {WindowState} from './draw';

/** 页面发送给 SharedWorker 的窗口状态消息。 */
interface WindowStateChangedMessage {
    action: 'windowStateChanged';
    payload: {
        id: number;
        newWindow: WindowState;
    };
}

/** SharedWorker connect 事件只需要读取新连接携带的 MessagePort。 */
interface SharedWorkerConnectEvent extends Event {
    readonly ports: readonly MessagePort[];
}

/** 当前文件实际使用的最小 SharedWorker 全局作用域。 */
interface SharedWorkerScope {
    addEventListener(
        type: 'connect',
        listener: (event: SharedWorkerConnectEvent) => void,
    ): void;
}

// DOM tsconfig 默认把 self 视为 Window，这里收窄为 SharedWorker 作用域。
const worker = self as unknown as SharedWorkerScope;

const windows: {windowState: WindowState; id: number; port: MessagePort}[] = [];
 
worker.addEventListener('connect', (event) => {
    const port = event.ports[0];
    port.onmessage = (event: MessageEvent<WindowStateChangedMessage>) => {
        const msg = event.data;
        switch (msg.action) {
            case 'windowStateChanged': {
                const { id, newWindow } = msg.payload;
                const oldWindowIndex = windows.findIndex((w) => w.id === id);
                if (oldWindowIndex !== -1) {
                    // old one changed
                    windows[oldWindowIndex].windowState = newWindow;
                }
                else {
                    // new window 
                    windows.push({ id, windowState: newWindow, port });
                }
                windows.forEach((w) => {
                    // send sync here 
                });
                break;
            }
        }
      };
});
