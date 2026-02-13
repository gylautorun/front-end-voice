import { useState, useEffect, useRef, useCallback } from 'react';
import Observer from './observer';
import Emitter from './emitter';
import { WebSocketOpts, UseWebSocketReturn, WebSocketInstance } from './type';

/**
 * React WebSocket Hook
 * @param url WebSocket 连接 URL
 * @param options WebSocket 配置选项
 * @returns WebSocket 实例和相关方法
 */
export const useWebSocket = (
  url: string,
  options: WebSocketOpts = { format: '' }
): UseWebSocketReturn => {
  const [socket, setSocket] = useState<WebSocketInstance | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [readyState, setReadyState] = useState<number>(WebSocket.CLOSED);
  const observerRef = useRef<Observer | null>(null);
  const reconnectAttemptRef = useRef(0);
  
  const connect = useCallback((customUrl?: string, customOptions?: WebSocketOpts) => {
    const connectUrl = customUrl || url;
    const connectOptions = { ...options, ...customOptions };
    
    if (!connectUrl) {
      throw new Error('[react-native-socket] cannot locate connection');
    }
    
    const observer = new Observer(connectUrl, { ...connectOptions, connectManually: true });
    const ws = observer.connect(connectUrl, connectOptions);
    observer.onEvent();
    
    observerRef.current = observer;
    setSocket(ws as WebSocketInstance);
    setReadyState(ws.readyState);
    
    // 添加事件监听器
    const handleOpen = (event: Event) => {
      setIsConnected(true);
      setReadyState(WebSocket.OPEN);
      reconnectAttemptRef.current = 0;
    };
    
    const handleClose = (event: CloseEvent) => {
      setIsConnected(false);
      setReadyState(WebSocket.CLOSED);
    };
    
    const handleError = (event: Event) => {
      setReadyState(WebSocket.CLOSED);
    };
    
    const handleMessage = (event: MessageEvent) => {
      // 消息处理由用户通过 onMessage 回调处理
    };
    
    Emitter.addListener('onopen', handleOpen, null);
    Emitter.addListener('onclose', handleClose, null);
    Emitter.addListener('onerror', handleError, null);
    Emitter.addListener('onmessage', handleMessage, null);
    
    return () => {
      Emitter.removeListener('onopen', handleOpen, null);
      Emitter.removeListener('onclose', handleClose, null);
      Emitter.removeListener('onerror', handleError, null);
      Emitter.removeListener('onmessage', handleMessage, null);
    };
  }, [url, options]);
  
  const disconnect = useCallback(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    
    setSocket(null);
    setIsConnected(false);
    setReadyState(WebSocket.CLOSED);
  }, []);
  
  const send = useCallback((data: string | any) => {
    if (observerRef.current) {
      observerRef.current.send(data);
    } else if (socket) {
      if (options.format === 'json' && typeof data === 'object') {
        if (typeof socket.sendObj === 'function') {
          socket.sendObj(data);
        } else {
          socket.send(JSON.stringify(data));
        }
      } else {
        socket.send(data as string);
      }
    }
  }, [socket, options.format]);
  
  // 初始化连接
  useEffect(() => {
    if (url && !options.connectManually) {
      const cleanup = connect();
      return cleanup;
    }
  }, [url, options.connectManually, connect]);
  
  // 清理函数
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);
  
  return {
    socket,
    connect,
    disconnect,
    send,
    isConnected,
    readyState
  };
};

/**
 * WebSocket Context Provider
 */
export const WebSocketProvider: React.FC<{
  url: string;
  options?: WebSocketOpts;
  children: React.ReactNode;
}> = ({ url, options = { format: '' }, children }) => {
  const websocket = useWebSocket(url, options);
  
  return (
    <WebSocketContext.Provider value={websocket}>
      {children}
    </WebSocketContext.Provider>
  );
};

// 创建 WebSocket Context
import { createContext, useContext } from 'react';

const WebSocketContext = createContext<UseWebSocketReturn>({
  socket: null,
  connect: () => () => {},
  disconnect: () => {},
  send: () => {},
  isConnected: false,
  readyState: WebSocket.CLOSED as number
});

/**
 * 使用 WebSocket Context
 */
export const useWebSocketContext = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
};

export default useWebSocket;