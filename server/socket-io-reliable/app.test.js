const assert = require('node:assert/strict');
const {once} = require('node:events');
const {after, before, test} = require('node:test');
const {io: createClient} = require('socket.io-client');
const {createSocketIoService} = require('./app');

let service;
let baseUrl;

before(async () => {
    service = createSocketIoService({pingInterval: 100, pingTimeout: 100});
    service.server.listen(0, '127.0.0.1');
    await once(service.server, 'listening');
    const {port} = service.server.address();
    baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
    await new Promise((resolve) => service.close(resolve));
});

async function openClient(clientId) {
    const socket = createClient(baseUrl, {
        path: '/socket.io',
        transports: ['websocket'],
        auth: {clientId},
        reconnectionDelay: 10,
        reconnectionDelayMax: 20,
        randomizationFactor: 0,
    });
    await once(socket, 'connect');
    return socket;
}

function emitWithAck(socket, eventName, payload) {
    return new Promise((resolve) => socket.emit(eventName, payload, resolve));
}

test('健康检查公开 Engine.IO 心跳参数', async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.service, 'socket-io-reliable');
    assert.equal(body.pingInterval, 100);
    assert.equal(body.pingTimeout, 100);
});

test('连接事件、应用层 ack 和广播事件可用', async () => {
    const first = await openClient('socket-first');
    const second = await openClient('socket-second');
    const received = once(second, 'chat:message');

    const latency = await emitWithAck(first, 'latency:probe', Date.now());
    assert.ok(latency.serverAt >= latency.clientSentAt);

    const acknowledged = await emitWithAck(first, 'chat:send', {
        nickname: 'Socket.IO 用户',
        text: '事件广播',
    });
    const [message] = await received;

    assert.equal(acknowledged.ok, true);
    assert.equal(acknowledged.id, message.id);
    assert.equal(message.clientId, 'socket-first');
    assert.equal(message.text, '事件广播');

    first.disconnect();
    second.disconnect();
});

test('底层 transport 断开后 Manager 会自动重连并恢复会话', async () => {
    const client = await openClient('socket-recovery');
    const initialSocketId = client.id;
    const reconnectAttempt = once(client.io, 'reconnect_attempt');
    const reconnected = once(client, 'connect');

    client.emit('demo:transport-drop');
    await reconnectAttempt;
    await reconnected;

    assert.equal(client.connected, true);
    assert.equal(client.recovered, true);
    assert.equal(client.id, initialSocketId);
    client.disconnect();
});
