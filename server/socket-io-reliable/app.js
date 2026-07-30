const http = require('node:http');
const {Server} = require('socket.io');

const DEFAULT_PORT = 8084;
const SOCKET_IO_PATH = '/socket.io';

function getConfiguredOrigins(explicitOrigins) {
    if (explicitOrigins) return new Set(explicitOrigins);
    return new Set(
        String(process.env.ALLOWED_ORIGINS ?? '')
            .split(',')
            .map((origin) => origin.trim())
            .filter(Boolean),
    );
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

function normalizeClientId(value, fallback) {
    const candidate = String(value ?? '').trim();
    return /^[a-zA-Z0-9_-]{1,80}$/.test(candidate) ? candidate : fallback;
}

function createSocketIoService(options = {}) {
    const allowedOrigins = getConfiguredOrigins(options.allowedOrigins);
    const pingInterval = options.pingInterval ?? 10_000;
    const pingTimeout = options.pingTimeout ?? 5_000;
    let nextMessageId = 1;

    const server = http.createServer((request, response) => {
        if (request.method === 'GET' && request.url === '/health') {
            response.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
            response.end(JSON.stringify({
                ok: true,
                service: 'socket-io-reliable',
                connections: io.engine.clientsCount,
                pingInterval,
                pingTimeout,
            }));
            return;
        }

        response.writeHead(404, {'Content-Type': 'application/json; charset=utf-8'});
        response.end(JSON.stringify({error: 'Not found'}));
    });

    const io = new Server(server, {
        path: SOCKET_IO_PATH,
        serveClient: false,
        pingInterval,
        pingTimeout,
        connectionStateRecovery: {
            maxDisconnectionDuration: 2 * 60_000,
            skipMiddlewares: true,
        },
        cors: {
            origin(origin, callback) {
                callback(null, isOriginAllowed(origin, allowedOrigins));
            },
            credentials: true,
        },
        allowRequest(request, callback) {
            const allowed = isOriginAllowed(request.headers.origin, allowedOrigins);
            callback(null, allowed);
        },
    });

    io.on('connection', (socket) => {
        const clientId = normalizeClientId(
            socket.handshake.auth.clientId,
            `io-${socket.id}`,
        );
        socket.data.clientId = clientId;

        socket.emit('connection:ready', {
            socketId: socket.id,
            recovered: socket.recovered,
            online: io.engine.clientsCount,
        });

        socket.on('latency:probe', (clientSentAt, acknowledge) => {
            if (typeof acknowledge !== 'function') return;
            acknowledge({
                clientSentAt: Number(clientSentAt) || Date.now(),
                serverAt: Date.now(),
            });
        });

        socket.on('chat:send', (payload = {}, acknowledge = () => {}) => {
            const text = String(payload.text ?? '').trim();
            if (!text || text.length > 500) {
                acknowledge({ok: false, error: '消息长度必须在 1 到 500 个字符之间'});
                return;
            }

            const nickname = String(payload.nickname ?? '匿名').trim().slice(0, 20) || '匿名';
            const message = {
                id: nextMessageId++,
                clientId,
                clientMessageId: String(payload.clientMessageId ?? '').slice(0, 120),
                nickname,
                text,
                sentAt: new Date().toISOString(),
            };

            io.emit('chat:message', message);
            acknowledge({ok: true, id: message.id});
        });

        socket.on('demo:transport-drop', () => {
            const timer = setTimeout(() => socket.conn.close(), 150);
            timer.unref?.();
        });
    });

    function close(callback) {
        io.close(callback);
    }

    return {
        server,
        io,
        close,
    };
}

function startServer(port = Number(process.env.PORT || DEFAULT_PORT)) {
    const service = createSocketIoService();
    service.server.listen(port, () => {
        console.log(`Socket.IO server: http://localhost:${port}${SOCKET_IO_PATH}`);
        console.log(`Health check: http://localhost:${port}/health`);
    });
    return service;
}

if (require.main === module) {
    startServer();
}

module.exports = {
    SOCKET_IO_PATH,
    createSocketIoService,
    startServer,
};
