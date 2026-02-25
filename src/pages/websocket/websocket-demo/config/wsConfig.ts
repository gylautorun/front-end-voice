import { WebSocketOpts } from 'src/components/native-websocket';

export interface WebSocketGlobalConfig {
  url: string;
  options: WebSocketOpts;
}

const defaultOnOpen = (event: Event) => {
  console.log('全局 WebSocket 连接成功:', event);
};

const defaultOnClose = (event: CloseEvent) => {
  console.log('全局 WebSocket 连接关闭:', event);
};

const defaultOnError = (event: Event) => {
  console.error('全局 WebSocket 错误:', event);
};

const defaultOnMessage = (event: MessageEvent) => {
  console.log('全局 WebSocket 收到消息:', event.data);
};

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
    onOpen: defaultOnOpen,
    onClose: defaultOnClose,
    onError: defaultOnError,
    onMessage: defaultOnMessage
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
