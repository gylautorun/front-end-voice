// 传输数据时的处理函数类型定义 | Type definition of processing function when transferring data
export type StoreHandler<T = any> = (
  eventName: string,
  event: {
    data: string;
    mutation: string;
    namespace: string;
    action: string;
  },
  opts?: T
) => void;

// 插件调用者可以传的参数类型定义 | The parameter type definition that the plug-in caller can pass
export type WebSocketOpts<T = any> = {
  format: 'json' | string;
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  maxReconnectionDelay?: number;
  reconnectionDelayGrowFactor?: number;
  connectManually?: boolean;
  passToStoreHandler?: StoreHandler;
  store?: T;
  mutations?: T;
  protocol?: string;
  WebSocket?: WebSocket;
  onOpen?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  onMessage?: (event: MessageEvent) => void;
};

// WebSocket 实例类型 | WebSocket instance type
export interface WebSocketInstance {
  send: (data: string) => void;
  sendObj?: (obj: any) => void;
  close: (code?: number, reason?: string) => void;
  readyState: number;
  CONNECTING: number;
  OPEN: number;
  CLOSING: number;
  CLOSED: number;
}

// Hook 返回类型 | Hook return type
export interface UseWebSocketReturn {
  socket: WebSocketInstance | null;
  connect: (url?: string, options?: WebSocketOpts) => () => void;
  disconnect: () => void;
  send: (data: string | any) => void;
  isConnected: boolean;
  readyState: number;
}