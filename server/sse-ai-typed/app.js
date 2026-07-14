const {createStreamService: createStreamServiceFactory} = require('./utils/service');
const {createChunks} = require('./utils/stream-protocol');
const {
    DEFAULT_SCENARIO,
    buildScenarioAnswer,
    listScenarios,
} = require('./mock-data');

// 未设置 PORT 时使用的本地开发端口。
const DEFAULT_PORT = 8082;

/**
 * app.js 是依赖组合入口：在这里把具体模拟数据实现注入通用流服务。
 * utils 不直接 require mock-data，后续替换数据库或真实 AI 服务时只需修改此处。
 */
function createStreamService(options = {}) {
    return createStreamServiceFactory(options, {
        // defaultScenario：请求未指定 scenario 时采用的场景 ID。
        defaultScenario: DEFAULT_SCENARIO,
        // buildScenarioAnswer：根据场景 ID 生成完整回答及场景元数据。
        buildScenarioAnswer,
        // listScenarios：为场景发现接口提供可序列化的场景目录。
        listScenarios,
    });
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
    // 保留原测试导入路径，实际实现已经移动到 stream-protocol.js。
    createChunks,
    // 保留原测试和脚本导入路径，实际服务组装位于 service.js。
    createStreamService,
    startServer,
};
