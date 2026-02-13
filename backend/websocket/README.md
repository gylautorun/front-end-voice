# WebSocket 后端服务器

这是一个基于 Node.js 的 WebSocket 后端服务器，用于支持前端 WebSocket 组件的演示和测试。

## 功能特性

- **基本 WebSocket 连接** - 支持标准的 WebSocket 协议
- **消息回显** - 模拟 echo.websocket.org 的功能
- **聊天广播** - 支持多客户端之间的消息广播
- **系统消息** - 新客户端连接和断开时的系统通知
- **连接管理** - 实时跟踪连接数量和客户端状态

## 技术栈

- Node.js
- ws 库 (WebSocket 服务器实现)
- 原生 http 模块

## 快速开始

### 1. 安装依赖

```bash
cd backend/websocket
npm install
```

### 2. 启动服务器

#### 开发模式 (带热重载)

```bash
npm run dev
```

#### 生产模式

```bash
npm start
```

### 3. 服务器信息

- **WebSocket 地址**: `ws://localhost:8080`
- **HTTP 地址**: `http://localhost:8080`
- **默认端口**: 8080

## 消息格式

### 客户端发送的消息

#### 聊天消息

```json
{
  "type": "chat",
  "content": "Hello everyone!"
}
```

#### 回显消息

```json
{
  "type": "echo",
  "content": "Hello WebSocket!"
}
```

### 服务器返回的消息

#### 欢迎消息

```json
{
  "type": "welcome",
  "message": "Welcome to WebSocket server! You are client 1",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### 聊天消息

```json
{
  "type": "chat",
  "sender": "Client 1",
  "content": "Hello everyone!",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### 系统消息

```json
{
  "type": "system",
  "message": "Client 1 joined the chat",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### 回显消息

```json
{
  "type": "echo",
  "content": "Hello WebSocket!",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 测试连接

可以使用以下工具测试 WebSocket 连接：

1. **浏览器控制台** - 使用原生 WebSocket API
2. **Postman** - 支持 WebSocket 测试
3. **wscat** - 命令行 WebSocket 客户端
4. **前端 Demo** - 使用项目中的 WebSocket 演示页面

### 浏览器测试示例

```javascript
const ws = new WebSocket('ws://localhost:8080');

ws.onopen = () => {
  console.log('Connected to WebSocket server');
  ws.send(JSON.stringify({ type: 'echo', content: 'Hello from browser!' }));
};

ws.onmessage = (event) => {
  console.log('Received:', event.data);
};

ws.onclose = () => {
  console.log('Disconnected from WebSocket server');
};
```

## 错误处理

- 服务器会自动处理连接错误
- 客户端断开连接时会自动清理资源
- 支持优雅关闭服务器

## 注意事项

- 此服务器仅用于开发和测试目的
- 生产环境中应添加身份验证和消息验证
- 建议使用 WSS (WebSocket Secure) 在生产环境中

## 许可证

MIT
