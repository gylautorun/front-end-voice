import { WebSocketOpts } from 'src/components/native-websocket';

export interface WebSocketGlobalConfig {
  url: string;
  options: WebSocketOpts;
}

export const defaultWebSocketConfig: WebSocketGlobalConfig = {
  url: 'ws://localhost:8080',
  options: {
    format: 'json',
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    maxReconnectionDelay: 30000,
    reconnectionDelayGrowFactor: 1.5,
    connectManually: false,
    onOpen: (event) => {
      console.log('全局 WebSocket 连接成功:', event);
    },
    onClose: (event) => {
      console.log('全局 WebSocket 连接关闭:', event);
    },
    onError: (event) => {
      console.error('全局 WebSocket 错误:', event);
    },
    onMessage: (event) => {
      console.log('全局 WebSocket 收到消息:', event.data);
    }
  }
};

class WebSocketConfigManager {
  private config: WebSocketGlobalConfig;

  constructor() {
    this.config = { ...defaultWebSocketConfig };
  }

  getConfig(): WebSocketGlobalConfig {
    return { ...this.config };
  }

  updateConfig(partialConfig: Partial<WebSocketGlobalConfig>): void {
    this.config = {
      ...this.config,
      ...partialConfig,
      options: {
        ...this.config.options,
        ...partialConfig.options
      }
    };
  }

  updateOptions(partialOptions: Partial<WebSocketOpts>): void {
    this.config.options = {
      ...this.config.options,
      ...partialOptions
    };
  }

  resetConfig(): void {
    this.config = { ...defaultWebSocketConfig };
  }
}

export const wsConfigManager = new WebSocketConfigManager();
