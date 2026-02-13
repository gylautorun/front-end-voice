
const WebSocket = require('ws');
const http = require('http');
const url = require('url');

// 创建 HTTP 服务器作为 WebSocket 服务器的基础
const server = http.createServer((req, res) => {
  // 处理 HTTP 请求
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WebSocket server is running\n');
});

// 创建 WebSocket 服务器
const wss = new WebSocket.Server({ server });

// 连接计数
let connectionCount = 0;

// 存储所有连接的客户端
const clients = new Set();

// 处理连接事件
wss.on('connection', (ws, req) => {
  // 增加连接计数
  connectionCount++;
  const clientId = connectionCount;
  
  // 添加到客户端集合
  clients.add(ws);
  
  console.log(`Client ${clientId} connected. Total connections: ${connectionCount}`);
  
  // 发送欢迎消息
  ws.send(JSON.stringify({
    type: 'welcome',
    message: `Welcome to WebSocket server! You are client ${clientId}`,
    timestamp: new Date().toISOString()
  }));
  
  // 广播新客户端连接
  broadcast(JSON.stringify({
    type: 'system',
    message: `Client ${clientId} joined the chat`,
    timestamp: new Date().toISOString()
  }), ws);
  
  // 处理消息事件
  ws.on('message', (message) => {
    console.log(`Received from client ${clientId}: ${message}`);
    
    try {
      // 尝试解析 JSON 消息
      const parsedMessage = JSON.parse(message);
      
      // 处理不同类型的消息
      switch (parsedMessage.type) {
        case 'chat':
          // 广播聊天消息
          broadcast(JSON.stringify({
            type: 'chat',
            sender: `Client ${clientId}`,
            content: parsedMessage.content,
            timestamp: new Date().toISOString()
          }));
          break;
        
        case 'echo':
          // 回显消息（模拟 echo.websocket.org）
          ws.send(JSON.stringify({
            type: 'echo',
            content: parsedMessage.content,
            timestamp: new Date().toISOString()
          }));
          break;
        
        default:
          // 默认回显消息
          ws.send(JSON.stringify({
            type: 'echo',
            content: parsedMessage,
            timestamp: new Date().toISOString()
          }));
      }
    } catch (error) {
      // 非 JSON 消息，直接回显
      ws.send(`Echo: ${message}`);
    }
  });
  
  // 处理关闭事件
  ws.on('close', () => {
    // 从客户端集合中移除
    clients.delete(ws);
    
    console.log(`Client ${clientId} disconnected. Total connections: ${clients.size}`);
    
    // 广播客户端断开连接
    broadcast(JSON.stringify({
      type: 'system',
      message: `Client ${clientId} left the chat`,
      timestamp: new Date().toISOString()
    }));
  });
  
  // 处理错误事件
  ws.on('error', (error) => {
    console.error(`Error from client ${clientId}:`, error);
  });
});

// 广播消息给所有客户端
function broadcast(message, excludeClient = null) {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client !== excludeClient) {
      client.send(message);
    }
  });
}

// 处理服务器错误
server.on('error', (error) => {
  console.error('Server error:', error);
});

// 启动服务器
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`WebSocket server is running on port ${PORT}`);
  console.log(`WebSocket URL: ws://localhost:${PORT}`);
  console.log(`HTTP URL: http://localhost:${PORT}`);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  
  // 关闭所有客户端连接
  clients.forEach((client) => {
    client.close();
  });
  
  // 关闭服务器
  server.close(() => {
    console.log('Server stopped');
    process.exit(0);
  });
});