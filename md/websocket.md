# WebSocket 组件演示项目

## 项目概述

这是一个包含 WebSocket 组件实现和演示的前端项目。项目使用 React 框架开发，包含以下核心功能：

- **WebSocket 组件** - 基于 React Hook 的 WebSocket 封装
- **多种使用示例** - 基本连接、配置化使用、Context 共享、聊天室、手动连接
- **完整后端支持** - 基于 Node.js 的 WebSocket 服务器
- **详细文档** - 组件使用说明和 API 文档

## 项目结构

```
├── src/
│   ├── components/
│   │   └── native-websocket/    # WebSocket 组件实现
│   │       ├── react/            # React 版本
│   │       └── vue/              # Vue 版本
│   └── pages/
│       └── websocket/
│           └── websocket-demo/   # WebSocket 演示页面
├── backend/
│   └── websocket/                # WebSocket 后端服务器
└── README.md                     # 项目文档
```

## 快速开始

### 1. 启动后端服务器

```bash
# 进入后端目录
cd backend/websocket

# 安装依赖
npm install

# 启动服务器
npm run dev
```

后端服务器将在 `http://localhost:8080` 运行，WebSocket 服务地址为 `ws://localhost:8080`。

### 2. 启动前端开发服务器

```bash
# 回到项目根目录
cd ../..

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端开发服务器通常运行在 `http://localhost:3000` 或类似地址。

### 3. 访问演示页面

打开浏览器，访问前端开发服务器地址，然后导航到 WebSocket 演示页面：

- 路径：`/websocket/websocket-demo`
- 完整 URL：`http://localhost:3000/websocket/websocket-demo`

## 功能演示

### 1. 基本 WebSocket 连接

- 自动连接到 WebSocket 服务器
- 显示连接状态和 Ready State
- 支持发送消息、连接和断开操作

### 2. 配置化 WebSocket 连接

- 支持 JSON 格式消息
- 自动重连机制
- 自定义事件回调
- 发送和接收 JSON 消息

### 3. Context 共享示例

- 使用 React Context 共享 WebSocket 连接
- 多个子组件共享同一个连接实例
- 从任意组件发送消息

### 4. WebSocket 聊天室

- 实时消息收发
- 消息历史记录
- 连接状态显示
- JSON 消息格式支持

### 5. 手动连接控制

- 自定义 WebSocket URL
- 手动触发连接和断开
- 动态切换 WebSocket 服务器

## 后端服务器功能

### 核心功能

- **消息回显** - 模拟 echo.websocket.org 的功能
- **聊天广播** - 支持多客户端之间的消息广播
- **系统通知** - 新客户端连接和断开时的通知
- **连接管理** - 实时跟踪连接数量

### 消息格式

#### 客户端发送

```json
{
  "type": "chat",  // 或 "echo"
  "content": "消息内容"
}
```

#### 服务器响应

```json
{
  "type": "welcome",  // 或 "chat", "system", "echo"
  "message": "消息内容",  // 或 "content"
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 技术栈

### 前端

- React 18+
- TypeScript
- SCSS
- React Hooks

### 后端

- Node.js
- ws (WebSocket 库)
- nodemon (开发工具)

## 浏览器支持

- Chrome 60+
- Firefox 55+
- Safari 10.1+
- Edge 79+

## 注意事项

1. **跨域问题** - 开发环境中可能需要配置 CORS
2. **生产环境** - 建议使用 WSS (WebSocket Secure) 协议
3. **错误处理** - 生产环境中应添加更完善的错误处理
4. **性能优化** - 大量消息时应考虑节流和防抖

## 测试

### 测试 WebSocket 连接

可以使用以下方法测试 WebSocket 服务器：

1. **浏览器控制台**

```javascript
const ws = new WebSocket('ws://localhost:8080');
ws.onopen = () => ws.send('Hello WebSocket!');
ws.onmessage = (e) => console.log('Received:', e.data);
```

2. **Postman** - 支持 WebSocket 测试
3. **wscat** - 命令行 WebSocket 客户端
4. **前端演示页面** - 项目内置的演示页面

### 测试场景

- 基本连接和断开
- 消息发送和接收
- 多客户端同时连接
- 服务器重启后的重连
- 网络中断后的重连

## 故障排除

### 常见问题

1. **连接失败**

   - 检查后端服务器是否运行
   - 确认 WebSocket URL 是否正确
   - 检查网络连接
2. **消息发送失败**

   - 确认连接状态为 "已连接"
   - 检查消息格式是否正确
   - 查看浏览器控制台错误
3. **后端服务器错误**

   - 查看后端服务器日志
   - 检查端口是否被占用
   - 确认依赖安装正确

### 调试工具

- **浏览器开发者工具** - Network 和 Console 标签页
- **后端服务器日志** - 终端输出
- **WebSocket 调试工具** - 如 Chrome 的 WebSocket Monitor

## 许可证

MIT
