import React, { createContext, useContext, ReactNode, useEffect, useRef, useCallback, useMemo } from 'react';
import { useWebSocket } from 'src/components/native-websocket';
import { wsConfigManager } from '../config/wsConfig';
import { UseWebSocketReturn } from 'src/components/native-websocket';
import { getId } from '@/utils/util-get-id';

interface WebSocketGlobalContextType extends UseWebSocketReturn {
  updateConfig: (config: any) => void;
  resetConfig: () => void;
  setOnMessage: (handler: ((event: MessageEvent) => void) | undefined) => (() => void) | undefined;
}

const WebSocketGlobalContext = createContext<WebSocketGlobalContextType | null>(null);

export const WebSocketGlobalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const config = wsConfigManager.getConfig();
  const onMessageRef = useRef<((event: MessageEvent) => void) | undefined>(undefined);
  const messageHandlersRef = useRef<Map<string, (event: MessageEvent) => void>>(new Map());
  
  const handleGlobalMessage = useCallback((event: MessageEvent) => {
    if (onMessageRef.current) {
      onMessageRef.current(event);
    }
    messageHandlersRef.current.forEach((handler) => {
      handler(event);
    });
  }, []);
  
  const ws = useWebSocket(config.url, {
    ...config.options,
    onMessage: handleGlobalMessage
  });

  const updateConfig = (newConfig: any) => {
    wsConfigManager.updateConfig(newConfig);
  };

  const resetConfig = () => {
    wsConfigManager.resetConfig();
  };

  const setOnMessageHandler = useCallback((handler: ((event: MessageEvent) => void) | undefined) => {
    if (!handler) {
      return undefined;
    }
    
    const handlerId = getId();
    messageHandlersRef.current.set(handlerId, handler);
    
    return () => {
      messageHandlersRef.current.delete(handlerId);
    };
  }, []);

  // 存储稳定的上下文值
  const contextValueRef = useRef<WebSocketGlobalContextType>({
    ...ws,
    updateConfig,
    resetConfig,
    setOnMessage: setOnMessageHandler
  });

  // 只更新变化的部分
  contextValueRef.current = {
    ...contextValueRef.current,
    ...ws,
    updateConfig,
    resetConfig
  };

  // 确保 setOnMessage 始终指向同一个函数
  contextValueRef.current.setOnMessage = setOnMessageHandler;

  return (
    <WebSocketGlobalContext.Provider value={contextValueRef.current}>
      {children}
    </WebSocketGlobalContext.Provider>
  );
};

export const useWebSocketGlobal = () => {
  const context = useContext(WebSocketGlobalContext);
  if (!context) {
    throw new Error('useWebSocketGlobal must be used within WebSocketGlobalProvider');
  }
  return context;
};
