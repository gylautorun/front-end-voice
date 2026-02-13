# WebSocket 组件

## 目录结构

```
src/components/native-websocket/
├── emitter.ts         # 事件发射器
├── index.ts           # 导出文件
├── observer.ts        # WebSocket 连接管理
├── type.ts            # 类型定义
└── useWebSocket.tsx   # React Hook 实现
```

## 核心功能

1. **自动连接管理** - 组件挂载时自动连接，卸载时自动断开
2. **自动重连机制** - 连接断开后可配置自动重连
3. **JSON 格式支持** - 自动处理 JSON 序列化和反序列化
4. **React Hook 风格** - 符合现代 React 开发习惯
5. **上下文（Context）支持** - 方便在多个组件间共享连接
6. **完整的事件处理** - 支持 onOpen、onClose、onError、onMessage 事件

## 安装

该组件已集成在项目中，直接导入使用即可。

## 导入方式

```tsx
// 方式 1: 导入默认导出
import useWebSocket from 'src/components/native-websocket';

// 方式 2: 导入命名导出
import { useWebSocket, WebSocketProvider, useWebSocketContext } from 'src/components/native-websocket';
```

## 使用方式

### 1. 基本使用

```tsx
import { useWebSocket } from 'src/components/native-websocket';

function BasicExample() {
  const { socket, send, isConnected, connect, disconnect, readyState } = useWebSocket('ws://echo.websocket.org');

  return (
    <div>
      <p>连接状态: {isConnected ? '已连接' : '未连接'}</p>
      <p>Ready State: {readyState}</p>
      <button onClick={() => send('Hello WebSocket!')} disabled={!isConnected}>
        发送消息
      </button>
    </div>
  );
}
```

### 2. 带配置选项

```tsx
import { useWebSocket } from 'src/components/native-websocket';

function ConfiguredExample() {
  const { send, isConnected } = useWebSocket('ws://echo.websocket.org', {
    format: 'json',
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
    onOpen: (event) => console.log('连接成功:', event),
    onClose: (event) => console.log('连接关闭:', event),
    onError: (event) => console.error('错误:', event),
    onMessage: (event) => console.log('收到消息:', event.data)
  });

  return (
    <div>
      <button onClick={() => send({ type: 'message', content: 'Hello JSON' })}>
        发送 JSON 消息
      </button>
    </div>
  );
}
```

### 3. 使用 Context

```tsx
import { WebSocketProvider, useWebSocketContext } from 'src/components/native-websocket';

// 子组件
function ChildComponent() {
  const { send, isConnected } = useWebSocketContext();
  return <button onClick={() => send('Hello from child')}>发送消息</button>;
}

// 父组件
function ParentComponent() {
  return (
    <WebSocketProvider url="ws://echo.websocket.org">
      <ChildComponent />
    </WebSocketProvider>
  );
}
```

### 4. 手动连接控制

```tsx
import { useWebSocket } from 'src/components/native-websocket';

function ManualExample() {
  const { connect, disconnect, isConnected } = useWebSocket('', {
    connectManually: true
  });

  return (
    <div>
      <button onClick={() => connect('ws://echo.websocket.org')}>
        连接
      </button>
      <button onClick={disconnect}>
        断开
      </button>
    </div>
  );
}
```

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| format | string | "" | 数据格式，支持 'json' |
| reconnection | boolean | false | 是否自动重连 |
| reconnectionAttempts | number | Infinity | 重连尝试次数 |
| reconnectionDelay | number | 1000 | 重连延迟时间(ms) |
| connectManually | boolean | false | 是否手动连接 |
| passToStoreHandler | function | - | 传递到存储的处理函数 |
| store | any | - | 状态管理存储 |
| mutations | any | - | 状态变更映射 |
| protocol | string | "" | WebSocket 协议 |
| WebSocket | WebSocket | - | 自定义 WebSocket 实现 |
| onOpen | function | - | 连接打开时的回调 |
| onClose | function | - | 连接关闭时的回调 |
| onError | function | - | 发生错误时的回调 |
| onMessage | function | - | 收到消息时的回调 |

## 返回值说明

| 属性/方法 | 类型 | 说明 |
|----------|------|------|
| socket | WebSocketInstance \| null | WebSocket 实例 |
| send | function | 发送消息的方法 |
| connect | function | 连接 WebSocket 的方法 |
| disconnect | function | 断开 WebSocket 连接的方法 |
| isConnected | boolean | 是否已连接 |
| readyState | number | WebSocket 状态码 |

## Ready State 状态码

| 状态码 | 常量 | 说明 |
|--------|------|------|
| 0 | WebSocket.CONNECTING | 正在连接 |
| 1 | WebSocket.OPEN | 已连接 |
| 2 | WebSocket.CLOSING | 正在关闭 |
| 3 | WebSocket.CLOSED | 已关闭 |

## 完整示例

### 聊天室示例

```tsx
import { useState } from 'react';
import { useWebSocket } from 'src/components/native-websocket';

export default function ChatRoom() {
  const [messages, setMessages] = useState<string[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  
  const { send, isConnected, readyState } = useWebSocket('ws://echo.websocket.org', {
    format: 'json',
    onMessage: (event) => {
      try {
        const data = JSON.parse(event.data);
        setMessages(prev => [...prev, `服务器: ${data.content}`]);
      } catch {
        setMessages(prev => [...prev, `服务器: ${event.data}`]);
      }
    }
  });

  const handleSend = () => {
    if (!inputMessage.trim() || !isConnected) return;
    
    const messageData = {
      content: inputMessage,
      sender: 'user',
      timestamp: new Date().toISOString()
    };
    
    send(messageData);
    setMessages(prev => [...prev, `我: ${inputMessage}`]);
    setInputMessage('');
  };

  return (
    <div>
      <h2>WebSocket 聊天室</h2>
      <div style={{ height: '300px', overflowY: 'auto', padding: '10px', border: '1px solid #ddd' }}>
        {messages.map((msg, index) => (
          <div key={index} style={{ marginBottom: '8px' }}>
            {msg}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', marginTop: '10px' }}>
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="输入消息..."
          style={{ flex: 1, padding: '8px' }}
        />
        <button
          onClick={handleSend}
          disabled={!isConnected || !inputMessage.trim()}
          style={{ padding: '8px 16px', marginLeft: '8px' }}
        >
          发送
        </button>
      </div>
      <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
        <p>连接状态: {isConnected ? '已连接' : '未连接'}</p>
        <p>Ready State: {readyState}</p>
      </div>
    </div>
  );
}
```

## 注意事项

1. **URL 格式**
   - 支持 `ws://` 和 `wss://` 协议
   - 支持相对路径（会自动添加当前协议）

2. **JSON 格式**
   - 当设置 `format: 'json'` 时，会自动处理 JSON 序列化和反序列化
   - 可以直接发送和接收对象

3. **重连机制**
   - 当 `reconnection: true` 时，连接断开后会自动重连
   - 可配置重连尝试次数和延迟时间

4. **清理**
   - 组件卸载时会自动断开连接
   - 手动调用 `disconnect` 也会清理所有资源

5. **浏览器兼容性**
   - 支持所有现代浏览器
   - 不支持 IE11 及以下版本

6. **错误处理**
   - 连接失败时会触发 onError 事件
   - 重连失败时会停止重连并触发相应事件

7. **性能优化**
   - 使用 React 的 useCallback 优化回调函数
   - 合理使用事件监听器，避免内存泄漏

## 常见问题与解决方案

### 1. 连接失败
- **原因**：URL 错误、服务器未运行、网络问题
- **解决**：检查 URL 格式、确保服务器运行、检查网络连接

### 2. 消息发送失败
- **原因**：连接未建立、消息格式错误
- **解决**：确保 isConnected 为 true 再发送消息、检查消息格式

### 3. 自动重连失败
- **原因**：重连配置错误、服务器不可访问
- **解决**：检查重连配置、确保服务器可访问

### 4. TypeScript 类型错误
- **原因**：类型定义不匹配
- **解决**：确保所有类型定义正确、检查参数类型

### 5. 内存泄漏
- **原因**：事件监听器未清理
- **解决**：组件卸载时会自动清理，无需手动处理

## 示例页面

项目中提供了完整的示例页面，包含多种使用方式：

- **路径**：`src/pages/websocket-demo/`
- **访问**：启动开发服务器后访问 `http://localhost:5173/websocket-demo`

示例页面包含：
- 基本 WebSocket 连接
- 配置化 WebSocket 连接
- 使用 Context 的 WebSocket 连接
- WebSocket 聊天室
- 手动连接控制

## 总结

WebSocket 组件提供了一种简洁、强大的方式来处理 WebSocket 连接，支持：
- 自动连接管理
- 自动重连
- JSON 格式支持
- React Hook 风格
- 上下文（Context）支持
- 完整的事件处理
- TypeScript 类型安全

通过以上方式，你可以轻松地在 React 应用中集成 WebSocket 功能，实现实时通信、聊天室、实时数据更新等功能。