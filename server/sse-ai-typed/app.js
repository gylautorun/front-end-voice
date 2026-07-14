const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const {
    DEFAULT_SCENARIO,
    buildScenarioAnswer,
    listScenarios,
} = require('./mock-data');

const DEFAULT_PORT = 8082;

/**
 * 将完整回答切成带连续序号的可重放业务分片。
 * @param {{messageId: string, scenario: string, content: string}} source 分片来源。
 * @returns {Array<{type: string, messageId: string, scenario: string, seq: number, delta: string, done: boolean}>}
 */
function createChunks({messageId, scenario, content}) {
    // 按 Unicode code point 拆分，避免把普通 emoji 的 UTF-16 代理项切成两半。
    const characters = Array.from(content);
    // 保存完整、可按 seq 重放的分片列表。
    const chunks = [];
    // cursor 指向下一次尚未切分的字符位置。
    let cursor = 0;
    // seq 从 1 开始，0 专门表示客户端尚未接收任何分片。
    let seq = 1;

    while (cursor < characters.length) {
        // 8～32 个 Unicode code point，模拟模型 token 在服务端合批后的不规则增量。
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
 * 创建可独立启动和测试的 SSE 服务。
 * @param {{minIntervalMs?: number, heartbeatMs?: number, sessionTtlMs?: number, gcIntervalMs?: number}} options
 * @returns {{app: import('express').Express, sessions: Map, getSession: Function, close: Function}}
 */
function createStreamService(options = {}) {
    // app 只注册路由，不在工厂内绑定端口，测试可以使用随机端口。
    const app = express();
    // sessions 以 messageId 为 key，保存可重放回答；当前演示为单进程内存缓存。
    const sessions = new Map();
    // 限制最小发送间隔，避免生产演示产生过多小包；测试可覆盖为 1ms。
    const minIntervalMs = options.minIntervalMs ?? 20;
    // heartbeatMs 必须小于代理层空闲超时。
    const heartbeatMs = options.heartbeatMs ?? 5000;
    // sessionTtlMs 控制一份回答可被断点续传多长时间。
    const sessionTtlMs = options.sessionTtlMs ?? 10 * 60 * 1000;
    // gcIntervalMs 控制扫描过期会话的频率。
    const gcIntervalMs = options.gcIntervalMs ?? 60 * 1000;

    /** 同一个 messageId 始终复用首次生成的场景和分片。 */
    function getSession(messageId, requestedScenario = DEFAULT_SCENARIO) {
        let session = sessions.get(messageId);
        if (!session) {
            const scenario = buildScenarioAnswer(requestedScenario);
            const contentHash = crypto.createHash('sha256').update(scenario.content).digest('hex');
            session = {
                // 会话的幂等键。
                messageId,
                // 首次生成时采用的场景 ID；后续重连不能改变。
                scenario: scenario.id,
                // 场景中文名称，供前端指标区展示。
                scenarioLabel: scenario.label,
                // 完整回答用于测试重建结果；生产可只保存分片或快照。
                content: scenario.content,
                // SHA-256 用于验证重连前后复用的是同一份回答。
                contentHash,
                // 全部 delta 和最后一条 done，可从任意 seq 后重放。
                chunks: createChunks({messageId, scenario: scenario.id, content: scenario.content}),
                // 每建立一次 HTTP 连接递增，用于观测重连次数。
                connections: 0,
                // 会话首次创建时间，重连不会变化。
                createdAt: new Date().toISOString(),
                // 最近读取或发送时间，供 TTL 回收使用。
                touchedAt: Date.now(),
            };
            sessions.set(messageId, session);
        }
        session.touchedAt = Date.now();
        return session;
    }

    // 允许示例页面直接跨域访问；经 Vite 同源代理时也不冲突。
    app.use(cors());

    /** 返回可用模拟场景，便于前端和自动化测试发现能力。 */
    app.get('/api/sse-ai-typed/scenarios', (_req, res) => {
        res.json({
            // 未指定 scenario 时使用的场景 ID。
            defaultScenario: DEFAULT_SCENARIO,
            // 场景 ID、名称、用途和字符规模。
            scenarios: listScenarios(),
        });
    });

    app.get('/api/sse-ai-typed/stream', (req, res) => {
        // messageId 是回答幂等键；重连必须保持不变。
        const messageId = String(req.query.messageId || 'demo');
        // scenario 只在首次创建该 messageId 时生效。
        const requestedScenario = String(req.query.scenario || DEFAULT_SCENARIO);
        // 显式 lastSeq 优先，同时兼容 EventSource 自动发送的 Last-Event-ID。
        const requestedSeq = Number(req.query.lastSeq || req.get('Last-Event-ID') || 0);
        // 非安全整数或负数回退为 0，从第一条事件开始。
        const lastSeq = Number.isSafeInteger(requestedSeq) && requestedSeq >= 0 ? requestedSeq : 0;
        // intervalMs 是演示发送速度，限制在 minIntervalMs 到 1000ms。
        const intervalMs = Math.min(1000, Math.max(minIntervalMs, Number(req.query.intervalMs) || 90));
        // disconnectAt 仅用于首次连接主动断流，0 表示不模拟断流。
        const disconnectAt = Math.max(0, Number(req.query.disconnectAt) || 0);
        const session = getSession(messageId, requestedScenario);
        session.connections += 1;

        res.set({
            // 声明 UTF-8 SSE 响应。
            'Content-Type': 'text/event-stream; charset=utf-8',
            // 禁止浏览器、CDN 或压缩层缓存及转换流内容。
            'Cache-Control': 'no-cache, no-transform',
            // 告知连接层保持 HTTP 长连接。
            Connection: 'keep-alive',
            // 告诉 Nginx 不要缓冲小响应。
            'X-Accel-Buffering': 'no',
        });
        // 立即发送响应头，让浏览器尽早触发 EventSource onopen。
        res.flushHeaders();
        // 原生 EventSource 自动重连时建议等待 1000ms。
        res.write('retry: 1000\n\n');

        // 从严格大于 lastSeq 的第一条缓存分片开始发送。
        let index = session.chunks.findIndex((chunk) => chunk.seq > lastSeq);
        if (index < 0) index = session.chunks.length;
        // closed 保证 cleanup 幂等，并阻止定时器继续写响应。
        let closed = false;
        // 统计当前连接已发送数量，用于首包 meta 和断流模拟。
        let sentOnConnection = 0;
        // 先声明定时器引用，使 cleanup 在任何关闭路径都能安全调用。
        let streamTimer;
        let heartbeatTimer;

        const streamMeta = {
            // 实际缓存场景，可能与重连请求中的 scenario 不同。
            scenario: session.scenario,
            // 场景中文名称。
            scenarioLabel: session.scenarioLabel,
            // 完整正文 SHA-256，验证重连没有重新生成。
            contentHash: session.contentHash,
            // 完整回答的 Unicode code point 数量。
            totalCharacters: Array.from(session.content).length,
            // 包含 done 在内的总分片数。
            totalChunks: session.chunks.length,
            // 会话首次创建时间。
            createdAt: session.createdAt,
            // 当前是该 messageId 的第几次连接。
            connection: session.connections,
            // 当前连接从哪个已确认序号后恢复。
            resumedFrom: lastSeq,
        };

        /** 同时释放正文和心跳定时器；可被多个关闭路径重复调用。 */
        const cleanup = () => {
            if (closed) return;
            closed = true;
            if (streamTimer) clearInterval(streamTimer);
            if (heartbeatTimer) clearInterval(heartbeatTimer);
        };

        streamTimer = setInterval(() => {
            if (closed || index >= session.chunks.length) return;
            const chunk = session.chunks[index];
            const payload = {
                // 继承 type、messageId、scenario、seq、delta 和 done。
                ...chunk,
                // 记录实际写出时间，用于分析端到端延迟。
                sentAt: new Date().toISOString(),
                // 首包和结束包携带完整元数据，其余分片保持轻量。
                ...((sentOnConnection === 0 || chunk.done) ? {meta: streamMeta} : {}),
                ...(chunk.done ? {finishReason: 'stop'} : {}),
            };

            // SSE id 与业务 seq 保持一致；data 使用单行 JSON。
            res.write(`id: ${chunk.seq}\n`);
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
            index += 1;
            sentOnConnection += 1;
            session.touchedAt = Date.now();

            if (chunk.done) {
                // 正常结束：先停止所有定时器，再关闭 HTTP 响应。
                cleanup();
                res.end();
                return;
            }

            if (disconnectAt && session.connections === 1 && sentOnConnection === disconnectAt) {
                // destroy 模拟非正常网络中断，不发送正常结束标志。
                cleanup();
                res.destroy();
            }
        }, intervalMs);

        // heartbeat 是独立事件，不占用业务 seq，也不会写入正文缓冲。
        heartbeatTimer = setInterval(() => {
            if (!closed) {
                res.write(`event: heartbeat\ndata: ${JSON.stringify({messageId, at: Date.now()})}\n\n`);
            }
        }, heartbeatMs);

        // 浏览器刷新、主动 close 或网络断开时清理连接级资源。
        req.on('close', cleanup);
    });

    // 周期扫描 touchedAt，回收超出续传窗口的会话。
    const sessionGc = setInterval(() => {
        const expiry = Date.now() - sessionTtlMs;
        for (const [messageId, session] of sessions) {
            if (session.touchedAt < expiry) sessions.delete(messageId);
        }
    }, gcIntervalMs);
    // GC 定时器本身不应阻止 Node 进程正常退出。
    sessionGc.unref();

    return {
        // Express app：供生产入口或测试绑定端口。
        app,
        // 会话 Map：供监控和测试检查缓存状态。
        sessions,
        // getSession：供测试验证相同 messageId 的幂等行为。
        getSession,
        // close：释放服务级 GC 定时器；测试结束必须调用。
        close: () => clearInterval(sessionGc),
    };
}

/** 生产/开发入口：创建服务并绑定显式端口或 PORT 环境变量。 */
function startServer(port = Number(process.env.PORT || DEFAULT_PORT)) {
    const service = createStreamService();
    const server = service.app.listen(port, () => {
        console.log(`AI typed SSE server: http://localhost:${port}/api/sse-ai-typed/stream`);
    });
    return {server, service};
}

// 直接 node app.js 时启动；被测试 require 时只导出工厂，不占用固定端口。
if (require.main === module) {
    startServer();
}

module.exports = {
    createChunks,
    createStreamService,
    startServer,
};
