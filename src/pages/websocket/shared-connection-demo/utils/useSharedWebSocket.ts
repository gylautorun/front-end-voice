import { useEffect, useCallback, useState } from 'react';
import wsManager, { WebSocketMessage, ConnectionState, ConnectionHistoryItem } from './WebSocketConnectionManager';

interface UseSharedWebSocketReturn {
  send: (data: any) => void;
  isConnected: boolean;
  readyState: number;
  isMaster: boolean;
  tabId: string;
  connectionState: ConnectionState;
  lastMessage: WebSocketMessage | null;
  connectionHistory: ConnectionHistoryItem[];
}

export default function useSharedWebSocket(): UseSharedWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [readyState, setReadyState] = useState(3);
  const [isMaster, setIsMaster] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(wsManager.getConnectionState());
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [connectionHistory, setConnectionHistory] = useState<ConnectionHistoryItem[]>(wsManager.getConnectionHistory());

  const send = useCallback((data: any) => {
    wsManager.send(data);
  }, []);

  useEffect(() => {
    // 监听连接状态变化
    const unsubscribeState = wsManager.onConnectionStateChange((state) => {
      setIsConnected(state.isConnected);
      setReadyState(state.readyState);
      setConnectionState(state);
      setIsMaster(state.masterTabId === wsManager.getTabId());
      // 更新连接历史记录
      setConnectionHistory(wsManager.getConnectionHistory());
    });

    // 监听消息
    const unsubscribeMessage = wsManager.onMessage((message) => {
      setLastMessage(message);
      // 消息也是连接历史的一部分，所以也更新
      setConnectionHistory(wsManager.getConnectionHistory());
    });

    // 初始状态
    setIsMaster(wsManager.isMasterTab());
    setConnectionHistory(wsManager.getConnectionHistory());

    return () => {
      unsubscribeState();
      unsubscribeMessage();
    };
  }, []);

  return {
    send,
    isConnected,
    readyState,
    isMaster,
    tabId: wsManager.getTabId(),
    connectionState,
    lastMessage,
    connectionHistory
  };
}
