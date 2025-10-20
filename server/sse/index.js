const http = require('http');
const qs = require('querystring');
const getId = require('./util-id');
// 配置服务
const server = http.createServer();

server.on('request', function(req, res) {
    // 访问链接
    if (req.url === '/api/sse') {
        // const params = qs.parse(data);
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Credentials': 'true', // 允许发cookie
            'Access-Control-Allow-Origin': '*', // 允许跨域
            'Set-Cookie': 'test=123; path=/; domain=127.0.0.1; HttpOnly',
        });
        let count = 0;
        const write = () => {
            console.log('count', count)
            const info = {
                index: count,
                value: `Current time is ${new Date().toLocaleTimeString()}`,
                id: getId(),
                close: count > 10,
                // 关闭sse
                // close: true,
            };
            res.write(`data: ${JSON.stringify(info)}\n\n`);
            count++;
        };
        write();
        const internal = setInterval(write, 1000);
        req.on('close', () => {
            console.log('close');
            clearInterval(internal);
        });
        return;
    }
    res.end('ok');
});
server.listen(8081, '127.0.0.1', function() {
    console.log('server is running at http://127.0.0.1:8081');
});