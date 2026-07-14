const cors = require('cors');
const express = require('express');
const {createNativeSseHandler} = require('../routes/native-sse');
const {createPluginSseHandler} = require('../routes/plugin-sse');
const {createSessionStore} = require('./session-store');

/**
 * 创建可独立启动和测试的 SSE 服务。
 * @param {{minIntervalMs?: number, heartbeatMs?: number, sessionTtlMs?: number, gcIntervalMs?: number}} options
 * @param {{defaultScenario: string, buildScenarioAnswer: Function, listScenarios: Function}} scenarioSource
 * @returns {{app: import('express').Express, sessions: Map, getSession: Function, close: Function}}
 */
function createStreamService(options = {}, scenarioSource) {
    // app 只注册路由，不在工厂内绑定端口，测试可以使用随机端口。
    const app = express();
    // minIntervalMs 限制最小发送间隔；测试可覆盖为 1ms。
    const minIntervalMs = options.minIntervalMs ?? 20;
    // heartbeatMs 必须小于代理层空闲超时。
    const heartbeatMs = options.heartbeatMs ?? 5000;
    // sessionTtlMs 控制一份回答可被断点续传多长时间。
    const sessionTtlMs = options.sessionTtlMs ?? 10 * 60 * 1000;
    // gcIntervalMs 控制扫描过期回答的频率。
    const gcIntervalMs = options.gcIntervalMs ?? 60 * 1000;
    // store 是两种路由共享的回答缓存，确保切换传输后仍可按 seq 重放。
    const store = createSessionStore({
        sessionTtlMs,
        gcIntervalMs,
        // defaultScenario 由 app 组合层决定，缓存工具不感知 mock-data。
        defaultScenario: scenarioSource.defaultScenario,
        // buildScenarioAnswer 可以替换为数据库读取或真实 AI 结果构造器。
        buildScenarioAnswer: scenarioSource.buildScenarioAnswer,
    });
    // routeDependencies 保证两个路由使用完全相同的缓存和时间配置。
    const routeDependencies = {
        getSession: store.getSession,
        minIntervalMs,
        heartbeatMs,
        // 路由把默认场景继续传给协议解析工具。
        defaultScenario: scenarioSource.defaultScenario,
    };

    // 允许示例页面直接跨域访问；经 Vite 同源代理时也不冲突。
    app.use(cors());

    /** 返回可用模拟场景，便于前端和自动化测试发现能力。 */
    app.get('/api/sse-ai-typed/scenarios', (_req, res) => {
        res.json({
            // 未指定 scenario 时使用综合场景。
            defaultScenario: scenarioSource.defaultScenario,
            // 场景 ID、名称、用途和字符规模。
            scenarios: scenarioSource.listScenarios(),
        });
    });

    // 原生路由只负责 Express res.write 和结构化 heartbeat。
    app.get('/api/sse-ai-typed/stream', createNativeSseHandler(routeDependencies));
    // 插件路由只负责 better-sse 会话和插件序列化。
    app.get('/api/sse-ai-typed/stream-plugin', createPluginSseHandler(routeDependencies));

    return {
        // Express app：供生产入口或测试绑定端口。
        app,
        // sessions：供监控和测试检查缓存状态。
        sessions: store.sessions,
        // getSession：保持原 app.js 对测试暴露的兼容接口。
        getSession: store.getSession,
        // close：释放服务级 GC 定时器；测试结束必须调用。
        close: store.close,
    };
}

module.exports = {createStreamService};
