import {WindowState} from '.';
const worker: Worker = self as any;

const windows: {windowState: WindowState; id: number; port: MessagePort}[] = [];
 
worker.addEventListener('connect', (event: MessageEvent) => {
    const port = event.ports[0];
    port.onmessage = (event: MessageEvent<WorkerMessage>) => {
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