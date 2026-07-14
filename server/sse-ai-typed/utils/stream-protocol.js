/**
 * 将完整回答切成带连续序号的可重放业务分片。
 * @param {{messageId: string, scenario: string, content: string}} source 分片来源。
 * @returns {Array<{type: string, messageId: string, scenario: string, seq: number, delta: string, done: boolean}>}
 */
function createChunks({messageId, scenario, content}) {
    // 按 Unicode code point 拆分，避免把普通 emoji 的 UTF-16 代理项切成两半。
    const characters = Array.from(content);
    // chunks 保存完整、可按 seq 重放的分片列表。
    const chunks = [];
    // cursor 指向下一次尚未切分的字符位置。
    let cursor = 0;
    // seq 从 1 开始，0 专门表示客户端尚未接收任何分片。
    let seq = 1;

    while (cursor < characters.length) {
        // 8～32 个 code point，模拟模型 token 在服务端合批后的不规则增量。
        const size = 8 + ((seq * 11) % 25);
        chunks.push({
            // type 让客户端区分正文增量和结束事件。
            type: 'delta',
            // messageId 将分片绑定到一次回答，防止多个回答串流。
            messageId,
            // scenario 记录该回答来自哪种模拟数据。
            scenario,
            // seq 用于去重、断层检测和断点续传。
            seq,
            // delta 只包含本次新增文本，不重复之前的内容。
            delta: characters.slice(cursor, cursor + size).join(''),
            // 普通正文分片尚未结束整个回答。
            done: false,
        });
        cursor += size;
        seq += 1;
    }

    chunks.push({
        // 最后一条独立事件只负责宣告流结束。
        type: 'done',
        messageId,
        scenario,
        seq,
        // 结束事件不携带重复正文。
        delta: '',
        done: true,
    });
    return chunks;
}

/**
 * 解析两种路由共用的查询参数，并取得同一个可重放会话。
 * @param {import('express').Request} req Express 请求。
 * @param {{getSession: Function, minIntervalMs: number, defaultScenario: string, transport: 'native'|'better-sse'}} options
 */
function prepareStreamRequest(req, {
    getSession,
    minIntervalMs,
    defaultScenario,
    transport,
}) {
    // messageId 是回答幂等键；重连必须保持不变。
    const messageId = String(req.query.messageId || 'demo');
    // scenario 只在首次创建该 messageId 时生效。
    const requestedScenario = String(req.query.scenario || defaultScenario);
    // 显式 lastSeq 优先，同时兼容 EventSource 自动发送的 Last-Event-ID。
    const requestedSeq = Number(req.query.lastSeq || req.get('Last-Event-ID') || 0);
    // 非安全整数或负数回退为 0，从第一条事件开始。
    const lastSeq = Number.isSafeInteger(requestedSeq) && requestedSeq >= 0 ? requestedSeq : 0;
    // intervalMs 是演示发送速度，限制在 minIntervalMs 到 1000ms。
    const intervalMs = Math.min(1000, Math.max(minIntervalMs, Number(req.query.intervalMs) || 90));
    // disconnectAt 仅用于首次连接主动断流，0 表示不模拟断流。
    const disconnectAt = Math.max(0, Number(req.query.disconnectAt) || 0);
    // 相同 messageId 始终取得首次生成的缓存回答。
    const session = getSession(messageId, requestedScenario);
    // connections 记录该回答经历的 HTTP 连接次数。
    session.connections += 1;

    // startIndex 指向严格大于 lastSeq 的第一条分片。
    let startIndex = session.chunks.findIndex((chunk) => chunk.seq > lastSeq);
    if (startIndex < 0) startIndex = session.chunks.length;

    return {
        // messageId 用于心跳和客户端回答归属校验。
        messageId,
        // lastSeq 表示当前连接从哪个已确认序号后恢复。
        lastSeq,
        // intervalMs 控制当前连接写出相邻分片的时间间隔。
        intervalMs,
        // disconnectAt 控制首次连接在第几个业务事件后模拟断开。
        disconnectAt,
        // session 保存完整分片、内容哈希和连接计数。
        session,
        // startIndex 是路由开始遍历 session.chunks 的数组位置。
        startIndex,
        // meta 在首包和 done 中返回，用于客户端验证续传一致性。
        meta: {
            scenario: session.scenario,
            scenarioLabel: session.scenarioLabel,
            contentHash: session.contentHash,
            totalCharacters: Array.from(session.content).length,
            totalChunks: session.chunks.length,
            createdAt: session.createdAt,
            connection: session.connections,
            resumedFrom: lastSeq,
            transport,
        },
    };
}

/** 为当前分片补充发送时间、首尾元数据和结束原因。 */
function createStreamPayload(chunk, meta, sentOnConnection) {
    return {
        // 继承 type、messageId、scenario、seq、delta 和 done。
        ...chunk,
        // sentAt 记录实际写出时间，用于分析端到端延迟。
        sentAt: new Date().toISOString(),
        // 每次连接的首包和最终 done 携带完整元数据，其余分片保持轻量。
        ...((sentOnConnection === 0 || chunk.done) ? {meta} : {}),
        // finishReason 只在 done 事件中出现。
        ...(chunk.done ? {finishReason: 'stop'} : {}),
    };
}

/** 仅首次 HTTP 连接在指定分片数后模拟非正常断流。 */
function shouldSimulateDisconnect(context, sentOnConnection) {
    return Boolean(
        context.disconnectAt
        && context.session.connections === 1
        && sentOnConnection === context.disconnectAt
    );
}

module.exports = {
    createChunks,
    createStreamPayload,
    prepareStreamRequest,
    shouldSimulateDisconnect,
};
