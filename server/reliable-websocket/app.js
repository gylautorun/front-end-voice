const http = require('node:http');
const {WebSocket, WebSocketServer} = require('ws');

const DEFAULT_PORT = 8083;
const DEFAULT_HEARTBEAT_MS = 30_000;
const DEFAULT_HISTORY_LIMIT = 100;
const WS_PATH = '/ws/reliable';

function sendJson(socket, payload) {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
    }
}

function parseNonNegativeInteger(value) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeClientId(value) {
    const candidate = String(value ?? '').trim();
    return /^[a-zA-Z0-9_-]{1,80}$/.test(candidate)
        ? candidate
        : `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getConfiguredOrigins(explicitOrigins) {
    if (explicitOrigins) return new Set(explicitOrigins);
    const origins = String(process.env.ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
    return new Set(origins);
}

function isOriginAllowed(origin, configuredOrigins) {
    if (!origin) return true;
    if (configuredOrigins.size) return configuredOrigins.has(origin);

    try {
        const url = new URL(origin);
        return (
            (url.protocol === 'http:' || url.protocol === 'https:')
            && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
        );
    } catch {
        return false;
    }
}

function createWebSocketService(options = {}) {
    const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
    const historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
    const allowedOrigins = getConfiguredOrigins(options.allowedOrigins);
    const clients = new Set();
    const history = [];
    let nextMessageId = 1;

    const server = http.createServer((request, response) => {
        if (request.method === 'GET' && request.url === '/health') {
            response.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
            response.end(JSON.stringify({
                ok: true,
                service: 'reliable-websocket',
                connections: clients.size,
                historySize: history.length,
            }));
            return;
        }

        response.writeHead(404, {'Content-Type': 'application/json; charset=utf-8'});
        response.end(JSON.stringify({error: 'Not found'}));
    });

    const wss = new WebSocketServer({noServer: true, clientTracking: false});

    server.on('upgrade', (request, socket, head) => {
        let requestUrl;
        try {
            requestUrl = new URL(request.url, 'http://localhost');
        } catch {
            socket.destroy();
            return;
        }

        if (requestUrl.pathname !== WS_PATH) {
            socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
            socket.destroy();
            return;
        }

        if (!isOriginAllowed(request.headers.origin, allowedOrigins)) {
            socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
            socket.destroy();
            return;
        }

        wss.handleUpgrade(request, socket, head, (websocket) => {
            wss.emit('connection', websocket, request, requestUrl);
        });
    });

    wss.on('connection', (socket, request, requestUrl) => {
        const clientId = normalizeClientId(requestUrl.searchParams.get('clientId'));
        const lastId = parseNonNegativeInteger(requestUrl.searchParams.get('lastId'));
        socket.isAlive = true;
        socket.clientId = clientId;
        clients.add(socket);

        sendJson(socket, {
            type: 'connection',
            clientId,
            online: clients.size,
            message: 'WebSocket 握手完成',
            sentAt: new Date().toISOString(),
        });

        for (const message of history) {
            if (message.id > lastId) sendJson(socket, {...message, replayed: true});
        }

        socket.on('pong', () => {
            socket.isAlive = true;
        });

        socket.on('message', (data, isBinary) => {
            if (isBinary) {
                sendJson(socket, {type: 'error', message: '此 demo 只接受文本消息'});
                return;
            }

            const rawMessage = data.toString();
            if (rawMessage === 'ping') {
                socket.send('pong');
                return;
            }

            let payload;
            try {
                payload = JSON.parse(rawMessage);
            } catch {
                sendJson(socket, {type: 'error', message: '消息必须是合法 JSON'});
                return;
            }

            if (payload.type === 'simulate_disconnect') {
                sendJson(socket, {
                    type: 'system',
                    message: '服务端即将 terminate 当前连接',
                    sentAt: new Date().toISOString(),
                });
                const timer = setTimeout(() => socket.terminate(), 150);
                timer.unref?.();
                return;
            }

            if (payload.type !== 'chat') {
                sendJson(socket, {type: 'error', message: '不支持的消息类型'});
                return;
            }

            const text = String(payload.text ?? '').trim();
            if (!text || text.length > 500) {
                sendJson(socket, {type: 'error', message: '消息长度必须在 1 到 500 个字符之间'});
                return;
            }

            const nickname = String(payload.nickname ?? '匿名').trim().slice(0, 20) || '匿名';
            const message = {
                type: 'chat',
                id: nextMessageId++,
                clientId,
                clientMessageId: String(payload.clientMessageId ?? '').slice(0, 120),
                nickname,
                text,
                sentAt: new Date().toISOString(),
            };

            history.push(message);
            if (history.length > historyLimit) history.splice(0, history.length - historyLimit);

            const encoded = JSON.stringify(message);
            for (const client of clients) {
                if (client.readyState === WebSocket.OPEN) client.send(encoded);
            }
        });

        socket.on('close', () => {
            clients.delete(socket);
        });

        socket.on('error', () => {
            // Close is the single cleanup path; the client gets only a generic error by browser design.
        });
    });

    const heartbeatTimer = setInterval(() => {
        for (const socket of clients) {
            if (!socket.isAlive) {
                socket.terminate();
                continue;
            }
            socket.isAlive = false;
            socket.ping();
        }
    }, heartbeatMs);
    heartbeatTimer.unref?.();

    function close() {
        clearInterval(heartbeatTimer);
        for (const socket of clients) socket.terminate();
        clients.clear();
        wss.close();
    }

    return {
        server,
        wss,
        clients,
        history,
        close,
    };
}

function startServer(port = Number(process.env.PORT || DEFAULT_PORT)) {
    const service = createWebSocketService();
    service.server.listen(port, () => {
        console.log(`Reliable WebSocket server: ws://localhost:${port}${WS_PATH}`);
        console.log(`Health check: http://localhost:${port}/health`);
    });
    return service;
}

if (require.main === module) {
    startServer();
}

module.exports = {
    WS_PATH,
    createWebSocketService,
    startServer,
};
