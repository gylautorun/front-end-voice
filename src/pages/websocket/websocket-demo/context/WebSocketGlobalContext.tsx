import React, { createContext, useContext, ReactNode, useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from 'src/components/native-websocket';
import { wsConfigManager } from '../config/wsConfig';
import { UseWebSocketReturn } from 'src/components/native-websocket';

interface WebSocketGlobalContextType extends UseWebSocketReturn {
  updateConfig: (config: any) => void;
  resetConfig: () => void;
  onMessage?: (event: MessageEvent) => void;
  setOnMessage: (handler: ((event: MessageEvent) => void) | undefined) => void;
}

const WebSocketGlobalContext = createContext<WebSocketGlobalContextType | null>(null);

export const WebSocketGlobalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const config = wsConfigManager.getConfig();
  const [onMessage, setOnMessage] = useState<((event: MessageEvent) => void) | undefined>(undefined);
  const onMessageRef = useRef<((event: MessageEvent) => void) | undefined>(undefined);
  
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);
  
  const handleGlobalMessage = useCallback((event: MessageEvent) => {
    if (onMessageRef.current) {
      onMessageRef.current(event);
    }
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

  return (
    <WebSocketGlobalContext.Provider value={{ ...ws, updateConfig, resetConfig, onMessage, setOnMessage }}>
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
