import { useState } from 'react';
import {
  useWebSocket,
  WebSocketProvider,
  useWebSocketContext,
} from 'src/components/native-websocket';
import style from './index.module.scss';

// 基本使用示例
function BasicWebSocket() {
  const { socket, send, isConnected, connect, disconnect, readyState } = useWebSocket('ws://echo.websocket.org');

  const handleSendMessage = () => {
    send('Hello WebSocket!');
  };

  return (
    <div className={style.section}>
      <h3>基本 WebSocket 连接</h3>
      <div className={style.status}>
        <p>连接状态: <span className={isConnected ? style.connected : style.disconnected}>
          {isConnected ? '已连接' : '未连接'}
        </span></p>
        <p>Ready State: <span>{readyState}</span></p>
      </div>
      <div className={style.controls}>
        <button 
          onClick={handleSendMessage} 
          disabled={!isConnected}
          className={style.button}
        >
          发送消息
        </button>
        <button 
          onClick={() => connect()} 
          disabled={isConnected}
          className={style.button}
        >
          连接
        </button>
        <button 
          onClick={disconnect} 
          disabled={!isConnected}
          className={style.button}
        >
          断开连接
        </button>
      </div>
    </div>
  );
}

// 配置化使用示例
function ConfiguredWebSocket() {
  const [message, setMessage] = useState('');
  const [receivedMessage, setReceivedMessage] = useState('');
  
  const { send, isConnected, readyState } = useWebSocket('ws://echo.websocket.org', {
    format: 'json',
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
    onOpen: (event) => {
      console.log('WebSocket 连接成功:', event);
    },
    onClose: (event) => {
      console.log('WebSocket 连接关闭:', event);
    },
    onError: (event) => {
      console.error('WebSocket 错误:', event);
    },
    onMessage: (event) => {
      console.log('收到消息:', event.data);
      setReceivedMessage(event.data);
    }
  });

  const handleSendJSON = () => {
    if (!message.trim() || !isConnected) return;
    
    const messageData = {
      content: message,
      sender: 'user',
      timestamp: new Date().toISOString()
    };
    
    send(messageData);
  };

  return (
    <div className={style.section}>
      <h3>配置化 WebSocket 连接</h3>
      <div className={style.status}>
        <p>连接状态: <span className={isConnected ? style.connected : style.disconnected}>
          {isConnected ? '已连接' : '未连接'}
        </span></p>
        <p>Ready State: <span>{readyState}</span></p>
      </div>
      <div className={style.inputGroup}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="输入消息..."
          className={style.input}
        />
        <button 
          onClick={handleSendJSON} 
          disabled={!isConnected || !message.trim()}
          className={style.button}
        >
          发送 JSON 消息
        </button>
      </div>
      {receivedMessage && (
        <div className={style.message}>
          <p>收到消息: <span>{receivedMessage}</span></p>
        </div>
      )}
    </div>
  );
}

// Context 使用示例 - 子组件
function ContextChildComponent() {
  const { send, isConnected } = useWebSocketContext();
  const [message, setMessage] = useState('');

  const handleSend = () => {
    if (!message.trim() || !isConnected) return;
    send(`Hello from child: ${message}`);
  };

  return (
    <div className={style.childComponent}>
      <h4>子组件</h4>
      <p>连接状态: <span className={isConnected ? style.connected : style.disconnected}>
        {isConnected ? '已连接' : '未连接'}
      </span></p>
      <div className={style.inputGroup}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="输入消息..."
          className={style.input}
        />
        <button 
          onClick={handleSend} 
          disabled={!isConnected || !message.trim()}
          className={style.button}
        >
          从子组件发送
        </button>
      </div>
    </div>
  );
}

// Context 使用示例 - 父组件
function ContextWebSocket() {
  return (
    <WebSocketProvider url="ws://echo.websocket.org" options={{
      format: 'json',
      reconnection: true
    }}>
      <div className={style.section}>
        <h3>使用 Context 的 WebSocket 连接</h3>
        <ContextChildComponent />
        <ContextChildComponent />
      </div>
    </WebSocketProvider>
  );
}

// 聊天室示例
function ChatRoom() {
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
    <div className={style.section}>
      <h3>WebSocket 聊天室</h3>
      <div className={style.status}>
        <p>连接状态: <span className={isConnected ? style.connected : style.disconnected}>
          {isConnected ? '已连接' : '未连接'}
        </span></p>
        <p>Ready State: <span>{readyState}</span></p>
      </div>
      <div className={style.chatBox}>
        {messages.map((msg, index) => (
          <div key={index} className={style.chatMessage}>
            {msg}
          </div>
        ))}
        {messages.length === 0 && (
          <div className={style.emptyMessage}>
            暂无消息，开始发送吧！
          </div>
        )}
      </div>
      <div className={style.inputGroup}>
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="输入消息..."
          className={style.input}
        />
        <button
          onClick={handleSend}
          disabled={!isConnected || !inputMessage.trim()}
          className={style.button}
        >
          发送
        </button>
      </div>
    </div>
  );
}

// 手动连接示例
function ManualWebSocket() {
  const [url, setUrl] = useState('ws://echo.websocket.org');
  const { connect, disconnect, isConnected, send } = useWebSocket('', {
    connectManually: true,
    format: 'json'
  });

  const handleConnect = () => {
    if (!url.trim()) return;
    connect(url);
  };

  const handleSend = () => {
    if (!isConnected) return;
    send('Hello from manual connection!');
  };

  return (
    <div className={style.section}>
      <h3>手动连接控制</h3>
      <div className={style.status}>
        <p>连接状态: <span className={isConnected ? style.connected : style.disconnected}>
          {isConnected ? '已连接' : '未连接'}
        </span></p>
      </div>
      <div className={style.inputGroup}>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="输入 WebSocket URL..."
          className={style.input}
        />
        <button 
          onClick={handleConnect} 
          disabled={isConnected}
          className={style.button}
        >
          连接
        </button>
        <button 
          onClick={disconnect} 
          disabled={!isConnected}
          className={style.button}
        >
          断开
        </button>
      </div>
      <button 
        onClick={handleSend} 
        disabled={!isConnected}
        className={style.button}
      >
        发送消息
      </button>
    </div>
  );
}

// 主页面
export default function WebSocketDemo() {
  return (
    <div className={style.container}>
      <h1>WebSocket 组件使用示例</h1>
      <p className={style.description}>
        本页面展示了 WebSocket 组件的各种使用方式，包括基本连接、配置化使用、Context 共享、聊天室示例和手动连接控制。
      </p>
      
      <BasicWebSocket />
      <ConfiguredWebSocket />
      <ContextWebSocket />
      <ChatRoom />
      <ManualWebSocket />
      
      <div className={style.documentation}>
        <h2>WebSocket 组件文档</h2>
        <div className={style.docSection}>
          <h3>安装与导入</h3>
          <pre className={style.code}>
{`// 方式 1: 导入默认导出
import useWebSocket from 'src/components/native-websocket';

// 方式 2: 导入命名导出
import { useWebSocket, WebSocketProvider, useWebSocketContext } from 'src/components/native-websocket';`}
          </pre>
        </div>
        
        <div className={style.docSection}>
          <h3>配置选项</h3>
          <table className={style.table}>
            <thead>
              <tr>
                <th>选项</th>
                <th>类型</th>
                <th>默认值</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>format</td>
                <td>string</td>
                <td>""</td>
                <td>数据格式，支持 'json'</td>
              </tr>
              <tr>
                <td>reconnection</td>
                <td>boolean</td>
                <td>false</td>
                <td>是否自动重连</td>
              </tr>
              <tr>
                <td>reconnectionAttempts</td>
                <td>number</td>
                <td>Infinity</td>
                <td>重连尝试次数</td>
              </tr>
              <tr>
                <td>reconnectionDelay</td>
                <td>number</td>
                <td>1000</td>
                <td>重连延迟时间(ms)</td>
              </tr>
              <tr>
                <td>connectManually</td>
                <td>boolean</td>
                <td>false</td>
                <td>是否手动连接</td>
              </tr>
              <tr>
                <td>onOpen</td>
                <td>function</td>
                <td>-</td>
                <td>连接打开时的回调</td>
              </tr>
              <tr>
                <td>onClose</td>
                <td>function</td>
                <td>-</td>
                <td>连接关闭时的回调</td>
              </tr>
              <tr>
                <td>onError</td>
                <td>function</td>
                <td>-</td>
                <td>发生错误时的回调</td>
              </tr>
              <tr>
                <td>onMessage</td>
                <td>function</td>
                <td>-</td>
                <td>收到消息时的回调</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div className={style.docSection}>
          <h3>Ready State 状态码</h3>
          <table className={style.table}>
            <thead>
              <tr>
                <th>状态码</th>
                <th>常量</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>0</td>
                <td>WebSocket.CONNECTING</td>
                <td>正在连接</td>
              </tr>
              <tr>
                <td>1</td>
                <td>WebSocket.OPEN</td>
                <td>已连接</td>
              </tr>
              <tr>
                <td>2</td>
                <td>WebSocket.CLOSING</td>
                <td>正在关闭</td>
              </tr>
              <tr>
                <td>3</td>
                <td>WebSocket.CLOSED</td>
                <td>已关闭</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div className={style.docSection}>
          <h3>注意事项</h3>
          <ul className={style.list}>
            <li>支持 ws:// 和 wss:// 协议</li>
            <li>当设置 format: 'json' 时，会自动处理 JSON 序列化和反序列化</li>
            <li>组件卸载时会自动断开连接</li>
            <li>支持所有现代浏览器，不支持 IE11 及以下版本</li>
            <li>重连失败时会停止重连并触发相应事件</li>
          </ul>
        </div>
      </div>
    </div>
  );
}