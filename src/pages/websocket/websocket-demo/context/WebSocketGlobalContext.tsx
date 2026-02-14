import React, { createContext, useContext, ReactNode } from 'react';
import { useWebSocket } from 'src/components/native-websocket';
import { wsConfigManager } from '../config/wsConfig';
import { UseWebSocketReturn } from 'src/components/native-websocket';

interface WebSocketGlobalContextType extends UseWebSocketReturn {
  updateConfig: (config: any) => void;
  resetConfig: () => void;
}

const WebSocketGlobalContext = createContext<WebSocketGlobalContextType | null>(null);

export const WebSocketGlobalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const config = wsConfigManager.getConfig();
  const ws = useWebSocket(config.url, config.options);

  const updateConfig = (newConfig: any) => {
    wsConfigManager.updateConfig(newConfig);
  };

  const resetConfig = () => {
    wsConfigManager.resetConfig();
  };

  return (
    <WebSocketGlobalContext.Provider value={{ ...ws, updateConfig, resetConfig }}>
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
