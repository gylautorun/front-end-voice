const express = require('express');
const cors = require('cors');
const getId = require('./util-id');
const app = express();
app.use(cors());
app.get('/api/sse', (req, res) => {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Credentials': 'true', // 允许发cookie
        'Access-Control-Allow-Origin': '*', // 允许跨域
        'Set-Cookie': 'test=123; path=/; domain=127.0.0.1; HttpOnly',
    });
    // 立即发送事件流的头部: 这是必需的, 因为浏览器将等待完整的HTTP头部才能开始处理数据
    res.flushHeaders();
    let count = 0;
    setInterval(() => {
        const data = {
            index: count,
            value: `Current time is ${new Date().toLocaleTimeString()}`,
            id: getId(),
            close: count > 10,
            // 关闭sse
            // close: true,
        };
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        count++;
    }, 1000);
});



app.listen(8081, () => {
    console.log('Server is running on port http://localhost:8081');
});