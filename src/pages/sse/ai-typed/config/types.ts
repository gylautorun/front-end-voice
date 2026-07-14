// 页面连接状态机：状态只描述连接和展示阶段，不保存正文内容。
export type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'reconnecting' | 'stalled' | 'done' | 'failed';

// 前端支持的两种 SSE 传输方式。
export type StreamTransport = 'native' | 'plugin';

// 服务端支持的模拟回答场景。
export type StreamScenario = 'comprehensive' | 'formats' | 'long' | 'unicode' | 'security';

/** 服务端每次通过 SSE data 字段发送的业务分片。 */
export interface StreamChunk {
    // 事件类型：普通增量或流结束事件。
    type?: 'delta' | 'done';
    // 一次回答的唯一标识，用于避免不同回答之间串流。
    messageId: string;
    // 本次回答使用的服务端模拟场景。
    scenario?: StreamScenario;
    // 从 1 开始连续递增的分片序号，用于去重、断层检测和续传。
    seq: number;
    // 本次新增的 Markdown 文本，只能追加，不能覆盖已有内容。
    delta: string;
    // 表示服务端已经发送完这次回答；正文缓冲区可能仍未消费完。
    done?: boolean;
    // 服务端实际写出该分片的 ISO 时间。
    sentAt?: string;
    // 首包和结束包携带的流级验证元数据。
    meta?: StreamMeta;
    // done 事件的结束原因。
    finishReason?: 'stop';
}

/** 用于验证续传一致性和展示连接信息的流级元数据。 */
export interface StreamMeta {
    // 服务端实际采用的场景 ID。
    scenario: StreamScenario;
    // 场景的中文展示名称。
    scenarioLabel: string;
    // 完整回答的 SHA-256，用于确认重连前后内容没有重新生成。
    contentHash: string;
    // 完整回答包含的 Unicode 字符数。
    totalCharacters: number;
    // 包含 done 在内的总分片数。
    totalChunks: number;
    // 该 messageId 会话的创建时间。
    createdAt: string;
    // 当前是该会话的第几次连接。
    connection: number;
    // 当前连接从哪个 lastSeq 之后恢复。
    resumedFrom: number;
    // 服务端实际使用的传输实现。
    transport?: 'native' | 'better-sse';
}

/** 页面顶部展示的接收、渲染和序号指标。 */
export interface StreamMetrics {
    // 已通过协议校验并写入 received 的字符数。
    received: number;
    // 已经由打字机追加到页面的字符数。
    displayed: number;
    // 客户端最后确认的连续业务序号。
    lastSeq: number;
}
