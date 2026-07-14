import type {StreamConnection, StreamConnectionOptions} from './types';

/** 使用浏览器原生 EventSource 建立 SSE GET 连接。 */
export function openNativeEventSource(options: StreamConnectionOptions): StreamConnection {
    const source = new EventSource(options.url);
    // 主动 close 后忽略浏览器随后派发的 error，避免错误触发续传。
    let manuallyClosed = false;

    source.onopen = options.onOpen;
    source.onmessage = (event) => options.onMessage(event.data);
    source.addEventListener('heartbeat', options.onHeartbeat);
    source.onerror = () => {
        if (!manuallyClosed) options.onDisconnect();
    };

    return {
        close() {
            manuallyClosed = true;
            source.close();
        },
    };
}
