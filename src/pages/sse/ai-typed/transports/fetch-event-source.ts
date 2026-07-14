import {EventStreamContentType, fetchEventSource} from '@microsoft/fetch-event-source';
import type {StreamConnection, StreamConnectionOptions} from './types';

/** 使用 fetch-event-source 建立可携带自定义 header 的 SSE 连接。 */
export function openFetchEventSource(options: StreamConnectionOptions): StreamConnection {
    const controller = new AbortController();
    // 区分页面主动取消与真实网络中断，主动取消不能触发自动恢复。
    let manuallyClosed = false;

    void fetchEventSource(options.url, {
        signal: controller.signal,
        // 查询参数仍是统一协议兜底，header 用于展示 fetch 插件的扩展能力。
        headers: {'Last-Event-ID': String(options.lastSeq)},
        // 页面自己处理后台缓冲和恢复，不使用插件默认的隐藏页关闭策略。
        openWhenHidden: true,
        async onopen(response) {
            const contentType = response.headers.get('content-type') || '';
            if (!response.ok || !contentType.startsWith(EventStreamContentType)) {
                throw new Error(`SSE 响应异常：${response.status} ${contentType}`);
            }
            if (!manuallyClosed) options.onOpen();
        },
        onmessage(message) {
            if (manuallyClosed) return;
            if (message.event === 'heartbeat') {
                options.onHeartbeat();
                return;
            }
            // better-sse 的 retry 协议帧可能被插件回调为空消息，它不属于业务 data。
            if (!message.data.trim()) return;
            options.onMessage(message.data);
        },
        onclose() {
            if (!manuallyClosed) options.onDisconnect();
        },
        onerror(error) {
            // 停止插件内部重试，由业务 Hook 统一执行有限次数指数退避。
            throw error;
        },
    }).catch(() => {
        if (!manuallyClosed && !controller.signal.aborted) options.onDisconnect();
    });

    return {
        close() {
            manuallyClosed = true;
            controller.abort();
        },
    };
}
