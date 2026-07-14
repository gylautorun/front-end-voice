const {
    createStreamPayload,
    prepareStreamRequest,
    shouldSimulateDisconnect,
} = require('../utils/stream-protocol');

/** 创建 Express 原生 res.write SSE 路由处理器。 */
function createNativeSseHandler({getSession, minIntervalMs, heartbeatMs, defaultScenario}) {
    return (req, res) => {
        const context = prepareStreamRequest(req, {
            getSession,
            minIntervalMs,
            defaultScenario,
            transport: 'native',
        });

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

        // index 指向当前连接下一条待发送缓存分片。
        let index = context.startIndex;
        // sentOnConnection 用于首包 meta 和断流模拟。
        let sentOnConnection = 0;
        // closed 保证 cleanup 幂等，并阻止定时器继续写响应。
        let closed = false;
        let streamTimer;
        let heartbeatTimer;

        /** 同时释放正文和心跳定时器；可被多个关闭路径重复调用。 */
        const cleanup = () => {
            if (closed) return;
            closed = true;
            if (streamTimer) clearInterval(streamTimer);
            if (heartbeatTimer) clearInterval(heartbeatTimer);
        };

        streamTimer = setInterval(() => {
            if (closed || index >= context.session.chunks.length) return;
            const chunk = context.session.chunks[index];
            const payload = createStreamPayload(chunk, context.meta, sentOnConnection);

            // SSE id 与业务 seq 保持一致；data 使用单行 JSON。
            res.write(`id: ${chunk.seq}\n`);
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
            index += 1;
            sentOnConnection += 1;
            context.session.touchedAt = Date.now();

            if (chunk.done) {
                // 正常结束：先停止所有定时器，再关闭 HTTP 响应。
                cleanup();
                res.end();
                return;
            }

            if (shouldSimulateDisconnect(context, sentOnConnection)) {
                // destroy 模拟非正常网络中断，不发送正常结束标志。
                cleanup();
                res.destroy();
            }
        }, context.intervalMs);

        // heartbeat 是独立事件，不占用业务 seq，也不会写入正文缓冲。
        heartbeatTimer = setInterval(() => {
            if (!closed) {
                res.write(`event: heartbeat\ndata: ${JSON.stringify({messageId: context.messageId, at: Date.now()})}\n\n`);
            }
        }, heartbeatMs);

        // 浏览器刷新、主动 close 或网络断开时清理连接级资源。
        req.on('close', cleanup);
    };
}

module.exports = {createNativeSseHandler};
