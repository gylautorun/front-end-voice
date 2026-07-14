/** 两种 SSE 实现向业务 Hook 暴露的统一生命周期回调。 */
export interface StreamConnectionCallbacks {
    // HTTP/SSE 连接已经建立并通过响应校验。
    onOpen: () => void;
    // 收到带 data 的业务消息；协议解析由上层统一完成。
    onMessage: (data: string) => void;
    // 收到心跳，重置上层的空闲超时。
    onHeartbeat: () => void;
    // 非主动关闭或正常结束，需要上层按 lastSeq 恢复。
    onDisconnect: () => void;
}

/** 创建连接时需要的 URL、断点和生命周期回调。 */
export interface StreamConnectionOptions extends StreamConnectionCallbacks {
    // 已包含 messageId、lastSeq 和模拟参数的请求地址。
    url: string;
    // 最近确认的业务序号，fetch 插件会同时写入 Last-Event-ID header。
    lastSeq: number;
}

/** 上层只依赖 close，不感知底层是 EventSource 还是 AbortController。 */
export interface StreamConnection {
    close: () => void;
}
