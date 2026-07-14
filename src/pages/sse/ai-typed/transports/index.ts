import type {StreamTransport} from '../config/types';
import {openFetchEventSource} from './fetch-event-source';
import {openNativeEventSource} from './native-event-source';
import type {StreamConnection, StreamConnectionOptions} from './types';

// 每种传输独立维护请求路径和底层连接 API，业务 Hook 不再包含实现分支。
const transportAdapters: Record<StreamTransport, {
    endpoint: string;
    open: (options: StreamConnectionOptions) => StreamConnection;
}> = {
    native: {endpoint: 'stream', open: openNativeEventSource},
    plugin: {endpoint: 'stream-plugin', open: openFetchEventSource},
};

/** 根据传输模式生成对应路由地址并建立连接。 */
export function openStreamConnection(
    transport: StreamTransport,
    params: URLSearchParams,
    callbacks: Omit<StreamConnectionOptions, 'url'>,
): StreamConnection {
    const adapter = transportAdapters[transport];
    const url = `/api/sse-ai-typed/${adapter.endpoint}?${params}`;
    return adapter.open({...callbacks, url});
}

export type {StreamConnection} from './types';
