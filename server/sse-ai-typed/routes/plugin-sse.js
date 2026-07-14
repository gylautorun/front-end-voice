const {createSession: createBetterSseSession} = require('better-sse');
const {
    createStreamPayload,
    prepareStreamRequest,
    shouldSimulateDisconnect,
} = require('../utils/stream-protocol');

/** 创建 better-sse 插件路由处理器。 */
function createPluginSseHandler({getSession, minIntervalMs, heartbeatMs, defaultScenario}) {
    return async (req, res, next) => {
        const context = prepareStreamRequest(req, {
            getSession,
            minIntervalMs,
            defaultScenario,
            transport: 'better-sse',
        });

        let betterSession;
        try {
            betterSession = await createBetterSseSession(req, res, {
                // retry 建议客户端异常断线后等待 1000ms。
                retry: 1000,
                // keepAlive 由插件发送注释型心跳。
                keepAlive: heartbeatMs,
                // 业务所需的反缓冲响应头仍显式配置。
                headers: {
                    'Cache-Control': 'no-cache, no-transform',
                    'X-Accel-Buffering': 'no',
                },
            });
        } catch (error) {
            next(error);
            return;
        }

        // index 指向当前连接下一条待发送缓存分片。
        let index = context.startIndex;
        // sentOnConnection 用于首包 meta 和断流模拟。
        let sentOnConnection = 0;
        // closed 保证 disconnected、done 和模拟断流清理幂等。
        let closed = false;
        let streamTimer;

        const cleanup = () => {
            if (closed) return;
            closed = true;
            if (streamTimer) clearInterval(streamTimer);
        };

        // better-sse 会在底层请求或响应关闭后发出 disconnected。
        betterSession.on('disconnected', cleanup);

        streamTimer = setInterval(() => {
            if (closed || !betterSession.isConnected || index >= context.session.chunks.length) return;
            const chunk = context.session.chunks[index];
            const payload = createStreamPayload(chunk, context.meta, sentOnConnection);

            // 插件负责 JSON.stringify、data/event/id 字段和事件末尾空行。
            betterSession.push(payload, 'message', String(chunk.seq));
            index += 1;
            sentOnConnection += 1;
            context.session.touchedAt = Date.now();

            if (chunk.done) {
                cleanup();
                res.end();
                return;
            }

            if (shouldSimulateDisconnect(context, sentOnConnection)) {
                cleanup();
                res.destroy();
            }
        }, context.intervalMs);
    };
}

module.exports = {createPluginSseHandler};
