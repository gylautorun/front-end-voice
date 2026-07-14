const crypto = require('node:crypto');
const {createChunks} = require('./stream-protocol');

/**
 * 创建带 TTL 回收的单进程回答缓存。
 * @param {{sessionTtlMs: number, gcIntervalMs: number, defaultScenario: string, buildScenarioAnswer: Function}} options
 */
function createSessionStore({
    sessionTtlMs,
    gcIntervalMs,
    defaultScenario,
    buildScenarioAnswer,
}) {
    // sessions 以 messageId 为 key，保存完整回答和可重放分片。
    const sessions = new Map();

    /** 同一个 messageId 始终复用首次生成的场景和分片。 */
    function getSession(messageId, requestedScenario = defaultScenario) {
        let session = sessions.get(messageId);
        if (!session) {
            const scenario = buildScenarioAnswer(requestedScenario);
            const contentHash = crypto.createHash('sha256').update(scenario.content).digest('hex');
            session = {
                // messageId 是回答的幂等键。
                messageId,
                // scenario 只记录首次生成时采用的场景 ID。
                scenario: scenario.id,
                // scenarioLabel 供前端指标区展示。
                scenarioLabel: scenario.label,
                // content 用于测试完整重建；生产可替换为持久化分片。
                content: scenario.content,
                // contentHash 验证重连前后复用的是同一份回答。
                contentHash,
                // chunks 包含全部 delta 和最后一条 done。
                chunks: createChunks({messageId, scenario: scenario.id, content: scenario.content}),
                // connections 每建立一次 HTTP 连接递增。
                connections: 0,
                // createdAt 在重连时保持不变。
                createdAt: new Date().toISOString(),
                // touchedAt 供 TTL 定时回收使用。
                touchedAt: Date.now(),
            };
            sessions.set(messageId, session);
        }
        session.touchedAt = Date.now();
        return session;
    }

    // 周期扫描 touchedAt，回收超出续传窗口的回答。
    const sessionGc = setInterval(() => {
        const expiry = Date.now() - sessionTtlMs;
        for (const [messageId, session] of sessions) {
            if (session.touchedAt < expiry) sessions.delete(messageId);
        }
    }, gcIntervalMs);
    // GC 定时器本身不应阻止 Node 进程正常退出。
    sessionGc.unref();

    return {
        // sessions 暴露给监控和自动化测试检查缓存状态。
        sessions,
        // getSession 是两种路由共享的幂等会话入口。
        getSession,
        // close 在测试或服务关闭时释放 GC 定时器。
        close: () => clearInterval(sessionGc),
    };
}

module.exports = {createSessionStore};
