const assert = require('node:assert/strict');
const {once} = require('node:events');
const {after, before, test} = require('node:test');
const {WebSocket} = require('ws');
const {createWebSocketService} = require('./app');

let service;
let baseHttpUrl;
let baseWsUrl;

before(async () => {
    service = createWebSocketService({heartbeatMs: 50, historyLimit: 10});
    service.server.listen(0, '127.0.0.1');
    await once(service.server, 'listening');
    const {port} = service.server.address();
    baseHttpUrl = `http://127.0.0.1:${port}`;
    baseWsUrl = `ws://127.0.0.1:${port}`;
});

after(async () => {
    service.close();
    service.server.close();
    await once(service.server, 'close');
});

async function openClient(query = '') {
    const socket = new WebSocket(`${baseWsUrl}/ws/reliable${query}`);
    const queue = [];
    const waiters = [];

    socket.on('message', (data) => {
        const raw = data.toString();
        queue.push(raw);
        for (const notify of waiters.splice(0)) notify();
    });
    await once(socket, 'open');

    return {
        socket,
        async next(predicate = () => true) {
            const timeoutAt = Date.now() + 1_000;
            while (Date.now() < timeoutAt) {
                const index = queue.findIndex((raw) => predicate(raw));
                if (index >= 0) return queue.splice(index, 1)[0];
                await new Promise((resolve, reject) => {
                    const timer = setTimeout(() => {
                        const waiterIndex = waiters.indexOf(notify);
                        if (waiterIndex >= 0) waiters.splice(waiterIndex, 1);
                        reject(new Error('Timed out waiting for WebSocket message'));
                    }, 1_000);
                    function notify() {
                        clearTimeout(timer);
                        resolve();
                    }
                    waiters.push(notify);
                });
            }
            throw new Error('Timed out waiting for WebSocket message');
        },
    };
}

async function closeClient(client) {
    if (client.socket.readyState === WebSocket.CLOSED) return;
    client.socket.close();
    await once(client.socket, 'close');
}

test('健康检查返回连接数和历史消息数', async () => {
    const response = await fetch(`${baseHttpUrl}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.service, 'reliable-websocket');
    assert.equal(body.connections, 0);
    assert.equal(body.historySize, 0);
});

test('连接握手、业务层 ping/pong 与聊天广播可用', async () => {
    const first = await openClient('?clientId=first&lastId=0');
    const second = await openClient('?clientId=second&lastId=0');

    const connection = JSON.parse(await first.next((raw) => raw.includes('"type":"connection"')));
    assert.equal(connection.clientId, 'first');

    first.socket.send('ping');
    assert.equal(await first.next((raw) => raw === 'pong'), 'pong');

    first.socket.send(JSON.stringify({type: 'chat', nickname: '测试用户', text: '广播消息'}));
    const firstMessage = JSON.parse(await first.next((raw) => raw.includes('"type":"chat"')));
    const secondMessage = JSON.parse(await second.next((raw) => raw.includes('"type":"chat"')));

    assert.equal(firstMessage.id, 1);
    assert.equal(firstMessage.clientId, 'first');
    assert.equal(secondMessage.text, '广播消息');
    assert.equal(secondMessage.replayed, undefined);

    await Promise.all([closeClient(first), closeClient(second)]);
});

test('lastId 只补推断线后遗漏的消息', async () => {
    const sender = await openClient('?clientId=sender&lastId=1');
    sender.socket.send(JSON.stringify({type: 'chat', nickname: '服务端', text: '断线期间消息'}));
    const liveMessage = JSON.parse(await sender.next((raw) => raw.includes('断线期间消息')));
    assert.equal(liveMessage.id, 2);
    await closeClient(sender);

    const resumed = await openClient('?clientId=resumed&lastId=1');
    const replayed = JSON.parse(await resumed.next((raw) => raw.includes('"replayed":true')));

    assert.equal(replayed.id, 2);
    assert.equal(replayed.text, '断线期间消息');
    assert.equal(replayed.replayed, true);
    await closeClient(resumed);
});

test('模拟异常断线会产生 1006 并清理连接', async () => {
    const client = await openClient('?clientId=unstable&lastId=2');
    client.socket.send(JSON.stringify({type: 'simulate_disconnect'}));
    const notice = JSON.parse(await client.next((raw) => raw.includes('terminate')));
    assert.equal(notice.type, 'system');

    const [code] = await once(client.socket, 'close');
    assert.equal(code, 1006);
});
