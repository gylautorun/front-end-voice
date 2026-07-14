const assert = require('node:assert/strict');
const {once} = require('node:events');
const {after, before, test} = require('node:test');
const {createChunks, createStreamService} = require('./app');
const {buildScenarioAnswer, listScenarios} = require('./mock-data');

// service 保存可测试工厂返回值，用于测试结束释放 GC 定时器。
let service;
// server 是测试生命周期内绑定随机端口的真实 HTTP 服务。
let server;
// baseUrl 根据随机端口生成，所有集成测试都通过真实 fetch 访问。
let baseUrl;

before(async () => {
    // 测试中允许 1ms 分片和 5ms 心跳，缩短真实流式测试耗时。
    service = createStreamService({minIntervalMs: 1, heartbeatMs: 5});
    // 端口 0 让操作系统选择空闲端口，避免测试与开发服务冲突。
    server = service.app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
    // 先释放服务级定时器，再关闭 HTTP server。
    service.close();
    server.close();
    await once(server, 'close');
});

/** 将单个 SSE 文本块解析为测试需要的 event、id 和 data。 */
function parseEventBlock(block) {
    // 未声明 event 时，SSE 规范默认事件名为 message。
    const parsed = {event: 'message', id: '', data: ''};
    // SSE 允许多行 data，解析后用换行重新合并。
    const dataLines = [];

    for (const line of block.split('\n')) {
        if (line.startsWith('event:')) parsed.event = line.slice(6).trim();
        if (line.startsWith('id:')) parsed.id = line.slice(3).trim();
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    parsed.data = dataLines.join('\n');
    return parsed;
}

/**
 * 读取一个 SSE 响应，支持服务端主动断流时返回已经成功收到的事件。
 * options.headers 用于验证 Last-Event-ID。
 * options.stopWhen 用于收到目标事件后主动结束，例如 heartbeat。
 * options.allowPrematureClose 用于断流场景保留关闭前已确认事件。
 */
async function collectStream(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {headers: options.headers});
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    // events 只保存完整的 SSE 事件，半包继续留在 buffer。
    const events = [];
    // buffer 保存两次 reader.read() 之间尚未形成 \n\n 的 SSE 半包。
    let buffer = '';
    // streamError 记录预期的非正常断流错误。
    let streamError;
    let streamFinished = false;

    try {
        while (!streamFinished) {
            const {done, value} = await reader.read();
            if (done) {
                streamFinished = true;
                continue;
            }
            buffer += decoder.decode(value, {stream: true});
            // 网络 read 边界不等于 SSE 事件边界，必须按空行拆分并保留最后半包。
            const blocks = buffer.split('\n\n');
            buffer = blocks.pop() ?? '';

            for (const block of blocks) {
                if (!block.trim() || block.startsWith('retry:')) continue;
                events.push(parseEventBlock(block));
                if (options.stopWhen?.(events.at(-1))) {
                    // heartbeat 测试达到目标后主动取消，避免等待长正文完成。
                    await reader.cancel();
                    return {response, events};
                }
            }
        }
    } catch (error) {
        streamError = error;
        if (!options.allowPrematureClose) throw error;
    }

    return {response, events, streamError};
}

/** 过滤 heartbeat，只返回带数字 id 的 JSON 业务事件。 */
function messagePayloads(events) {
    return events
        .filter((event) => event.event === 'message' && event.data)
        .map((event) => ({id: Number(event.id), payload: JSON.parse(event.data)}));
}

test('模拟场景包含综合、全格式、长文本、Unicode 和安全清洗数据', () => {
    // 准备并检查场景目录，防止新增或删除场景后前端选项失配。
    const scenarios = listScenarios();
    assert.deepEqual(scenarios.map((item) => item.id), [
        'comprehensive',
        'formats',
        'long',
        'unicode',
        'security',
    ]);
    assert.ok(scenarios.every((item) => item.characters > 300));

    // 综合场景必须真实覆盖表格、任务列表和多语言代码围栏。
    const comprehensive = buildScenarioAnswer('comprehensive').content;
    assert.match(comprehensive, /\| 指标 \| 当前策略 \|/);
    assert.match(comprehensive, /```ts/);
    assert.match(comprehensive, /```json/);
    assert.match(comprehensive, /- \[x\]/);

    // 全格式场景必须覆盖 URL、引用式链接、图片、对齐表格和多语言代码块。
    const formats = buildScenarioAnswer('formats').content;
    assert.match(formats, /\[OpenAI\]\(https:\/\/openai\.com\//);
    assert.match(formats, /GFM 裸 URL：https:\/\/example\.com/);
    assert.match(formats, /!\[用于验证 Markdown 图片/);
    assert.match(formats, /\[sse-standard\]: https:\/\//);
    assert.match(formats, /\| :--- \| :---: \| ---: \|/);
    assert.match(formats, /```python/);
    assert.match(formats, /```sql/);

    // 安全场景必须包含待前端 sanitize 验证的危险输入。
    const security = buildScenarioAnswer('security').content;
    assert.match(security, /<script>/);
    assert.match(security, /onerror=/);
});

test('createChunks 生成连续序号并可无损还原 Unicode 原文', () => {
    // 准备 Unicode 原文并执行服务端分片。
    const scenario = buildScenarioAnswer('unicode');
    const chunks = createChunks({
        messageId: 'unit-unicode',
        scenario: scenario.id,
        content: scenario.content,
    });

    // 逐条验证协议属性，再将所有 delta 拼回原文。
    chunks.forEach((chunk, index) => {
        assert.equal(chunk.seq, index + 1);
        assert.equal(chunk.messageId, 'unit-unicode');
        assert.equal(chunk.scenario, 'unicode');
    });
    assert.equal(chunks.at(-1).done, true);
    assert.equal(chunks.at(-1).delta, '');
    assert.equal(chunks.slice(0, -1).map((chunk) => chunk.delta).join(''), scenario.content);
    assert.doesNotMatch(chunks.map((chunk) => chunk.delta).join(''), /�/);
});

test('场景发现接口返回每种数据的描述和字符数', async () => {
    // 通过真实 HTTP 请求验证 JSON 发现接口，而不是直接调用内部函数。
    const response = await fetch(`${baseUrl}/api/sse-ai-typed/scenarios`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.defaultScenario, 'comprehensive');
    assert.equal(body.scenarios.length, 5);
    assert.ok(body.scenarios.every((item) => item.label && item.description && item.characters));
});

test('完整 SSE 返回正确响应头、连续 id、丰富元数据和 done', async () => {
    // 完整读取 Unicode 流，覆盖响应头、首包、正文和结束包。
    const result = await collectStream(
        '/api/sse-ai-typed/stream?messageId=full-unicode&scenario=unicode&intervalMs=1',
    );
    const messages = messagePayloads(result.events);
    const first = messages[0].payload;
    const last = messages.at(-1).payload;
    const expectedContent = buildScenarioAnswer('unicode').content;

    // 先验证网关相关响应头，再验证事件连续性和元数据一致性。
    assert.match(result.response.headers.get('content-type'), /^text\/event-stream/);
    assert.equal(result.response.headers.get('cache-control'), 'no-cache, no-transform');
    assert.equal(result.response.headers.get('x-accel-buffering'), 'no');
    messages.forEach((event, index) => assert.equal(event.id, index + 1));
    assert.equal(messages.map(({payload}) => payload.delta).join(''), expectedContent);
    assert.equal(first.type, 'delta');
    assert.equal(first.meta.scenario, 'unicode');
    assert.equal(first.meta.totalCharacters, Array.from(expectedContent).length);
    assert.equal(first.meta.totalChunks, messages.length);
    assert.equal(first.meta.resumedFrom, 0);
    assert.equal(last.type, 'done');
    assert.equal(last.done, true);
    assert.equal(last.finishReason, 'stop');
    assert.equal(last.meta.contentHash, first.meta.contentHash);
    assert.ok(Date.parse(first.sentAt));
});

test('同一 messageId 复用原回答，查询参数 lastSeq 从下一条继续', async () => {
    // 第一次请求完整生成综合场景并建立会话缓存。
    const messageId = 'resume-query';
    const initial = await collectStream(
        `/api/sse-ai-typed/stream?messageId=${messageId}&scenario=comprehensive&intervalMs=1`,
    );
    const initialMessages = messagePayloads(initial.events);
    const lastSeq = 7;
    // 第二次故意请求不同场景；相同 messageId 必须仍复用首次综合回答。
    const resumed = await collectStream(
        `/api/sse-ai-typed/stream?messageId=${messageId}&scenario=security&lastSeq=${lastSeq}&intervalMs=1`,
    );
    const resumedMessages = messagePayloads(resumed.events);

    // 续传结果只能包含 lastSeq 之后的事件，且连接元数据递增。
    assert.equal(resumedMessages[0].id, lastSeq + 1);
    assert.ok(resumedMessages.every((event) => event.id > lastSeq));
    assert.equal(resumedMessages[0].payload.scenario, 'comprehensive');
    assert.equal(resumedMessages[0].payload.meta.connection, 2);
    assert.equal(resumedMessages[0].payload.meta.resumedFrom, lastSeq);
    assert.equal(
        resumedMessages.map(({payload}) => payload.delta).join(''),
        initialMessages.slice(lastSeq).map(({payload}) => payload.delta).join(''),
    );
});

test('Last-Event-ID 请求头也能从下一条事件继续', async () => {
    // 预先创建缓存，再通过标准 SSE 请求头而不是查询参数提交断点。
    const session = service.getSession('resume-header', 'comprehensive');
    const resumed = await collectStream(
        '/api/sse-ai-typed/stream?messageId=resume-header&intervalMs=1',
        {headers: {'Last-Event-ID': '5'}},
    );
    const messages = messagePayloads(resumed.events);

    assert.equal(messages[0].id, 6);
    assert.equal(messages[0].payload.meta.resumedFrom, 5);
    assert.equal(messages.map(({payload}) => payload.delta).join(''), session.chunks.slice(5).map((chunk) => chunk.delta).join(''));
});

test('首次连接主动断流后，按客户端最后收到的 seq 可连续恢复', async () => {
    // 首次请求在第 6 次服务端 write 后强制 destroy，模拟非正常网络中断。
    const messageId = 'forced-disconnect';
    const interrupted = await collectStream(
        `/api/sse-ai-typed/stream?messageId=${messageId}&scenario=comprehensive&intervalMs=1&disconnectAt=6`,
        {allowPrematureClose: true},
    );
    const before = messagePayloads(interrupted.events);
    // 以客户端实际解析成功的最后 id 为准，不能使用服务端已 write 的数量。
    const clientLastSeq = before.at(-1)?.id ?? 0;
    const resumed = await collectStream(
        `/api/sse-ai-typed/stream?messageId=${messageId}&lastSeq=${clientLastSeq}&intervalMs=1`,
    );
    const afterResume = messagePayloads(resumed.events);
    // 合并断流前后事件，结果应从 1 连续到 done 并等于服务端原文。
    const combined = [...before, ...afterResume];
    const expectedContent = buildScenarioAnswer('comprehensive').content;

    assert.ok(interrupted.streamError);
    assert.ok(clientLastSeq > 0);
    combined.forEach((event, index) => assert.equal(event.id, index + 1));
    assert.equal(combined.map(({payload}) => payload.delta).join(''), expectedContent);
    assert.equal(combined.at(-1).payload.done, true);
});

test('长间隔正文期间会发送结构化 heartbeat', async () => {
    // 正文间隔设为 1000ms，测试 heartbeat 应先于第一条正文到达。
    const result = await collectStream(
        '/api/sse-ai-typed/stream?messageId=heartbeat&scenario=long&intervalMs=1000',
        {stopWhen: (event) => event.event === 'heartbeat'},
    );
    const heartbeat = result.events.find((event) => event.event === 'heartbeat');
    const payload = JSON.parse(heartbeat.data);

    assert.equal(payload.messageId, 'heartbeat');
    assert.equal(typeof payload.at, 'number');
});
