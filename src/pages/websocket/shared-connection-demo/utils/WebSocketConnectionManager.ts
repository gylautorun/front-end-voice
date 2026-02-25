import Observer from 'src/components/native-websocket/observer';
import Emitter from 'src/components/native-websocket/emitter';

export interface WebSocketMessage {
  type: string;
  data?: any;
  senderId?: string;
  timestamp?: number;
}

export interface ConnectionState {
  isConnected: boolean;
  readyState: number;
  connectionId: string;
  masterTabId: string;
}

class WebSocketConnectionManager {
  private static instance: WebSocketConnectionManager;
  private channel: BroadcastChannel;
  private socket: Observer | null = null;
  private isMaster: boolean = false;
  private tabId: string;
  private connectionState: ConnectionState;
  private messageHandlers: Array<(message: WebSocketMessage) => void> = [];
  private connectionStateHandlers: Array<(state: ConnectionState) => void> = [];
  private url: string = 'ws://localhost:8080';

  private constructor() {
    this.tabId = this.generateTabId();
    this.channel = new BroadcastChannel('websocket-shared-connection');
    this.connectionState = {
      isConnected: false,
      readyState: 3,
      connectionId: '',
      masterTabId: ''
    };
    
    this.setupEventListeners();
    this.tryToBecomeMaster();
  }

  public static getInstance(): WebSocketConnectionManager {
    if (!WebSocketConnectionManager.instance) {
      WebSocketConnectionManager.instance = new WebSocketConnectionManager();
    }
    return WebSocketConnectionManager.instance;
  }

  private generateTabId(): string {
    return `tab-${Math.random().toString(36).substr(2, 9)}-${Date.now()}`;
  }

  private setupEventListeners() {
    // 监听来自其他标签页的消息
    this.channel.onmessage = (event: MessageEvent) => {
      const message: WebSocketMessage = event.data;
      this.handleChannelMessage(message);
    };

    // 监听来自 WebSocket 的消息
    Emitter.addListener('onmessage', (event: MessageEvent) => {
      this.handleWebSocketMessage(event);
    }, this);

    Emitter.addListener('onopen', () => {
      this.updateConnectionState(true, 1);
    }, this);

    Emitter.addListener('onclose', () => {
      this.updateConnectionState(false, 3);
    }, this);

    Emitter.addListener('onerror', () => {
      this.updateConnectionState(false, 3);
    }, this);

    // 监听标签页关闭事件
    window.addEventListener('beforeunload', () => {
      this.handleTabClose();
    });
  }

  private handleChannelMessage(message: WebSocketMessage) {
    switch (message.type) {
      case 'MASTER_ANNOUNCEMENT':
        this.handleMasterAnnouncement(message);
        break;
      case 'MASTER_REQUEST':
        this.handleMasterRequest(message);
        break;
      case 'MASTER_VACANT':
        this.tryToBecomeMaster();
        break;
      case 'WEBSOCKET_MESSAGE':
        this.handleSharedWebSocketMessage(message);
        break;
      case 'CONNECTION_STATE':
        this.updateStateFromMaster(message);
        break;
      default:
        break;
    }
  }

  private handleMasterAnnouncement(message: WebSocketMessage) {
    if (message.senderId && message.senderId !== this.tabId) {
      this.isMaster = false;
      if (message.data) {
        this.connectionState = {
          ...this.connectionState,
          masterTabId: message.senderId,
          ...message.data
        };
        this.notifyConnectionStateHandlers();
      }
    }
  }

  private handleMasterRequest(message: WebSocketMessage) {
    if (this.isMaster) {
      this.announceMasterStatus();
    }
  }

  private handleWebSocketMessage(event: MessageEvent) {
    // 只有主标签页会接收 WebSocket 消息，然后广播给其他标签页
    if (this.isMaster) {
      this.broadcastWebSocketMessage(event.data);
    }
  }

  private handleSharedWebSocketMessage(message: WebSocketMessage) {
    // 处理从其他标签页广播的 WebSocket 消息
    this.notifyMessageHandlers(message);
  }

  private updateStateFromMaster(message: WebSocketMessage) {
    if (message.data) {
      this.connectionState = {
        ...this.connectionState,
        ...message.data
      };
      this.notifyConnectionStateHandlers();
    }
  }

  private handleTabClose() {
    if (this.isMaster) {
      this.broadcast({ type: 'MASTER_VACANT', senderId: this.tabId });
      this.disconnect();
    }
  }

  private tryToBecomeMaster() {
    // 发送主标签页请求
    this.broadcast({ type: 'MASTER_REQUEST', senderId: this.tabId });
    
    // 如果 500ms 内没有收到主标签页的响应，则成为主标签页
    setTimeout(() => {
      if (!this.isMaster) {
        this.becomeMaster();
      }
    }, 500);
  }

  private becomeMaster() {
    this.isMaster = true;
    this.connectionState.masterTabId = this.tabId;
    this.connectionState.connectionId = this.generateTabId();
    
    console.log(`[WebSocket] Tab ${this.tabId} became master`);
    this.announceMasterStatus();
    this.connect();
  }

  private announceMasterStatus() {
    this.broadcast({
      type: 'MASTER_ANNOUNCEMENT',
      senderId: this.tabId,
      data: this.connectionState
    });
  }

  private broadcast(message: WebSocketMessage) {
    message.senderId = this.tabId;
    message.timestamp = Date.now();
    this.channel.postMessage(message);
  }

  private broadcastWebSocketMessage(data: any) {
    this.broadcast({
      type: 'WEBSOCKET_MESSAGE',
      data,
      senderId: this.tabId
    });
  }

  private updateConnectionState(isConnected: boolean, readyState: number) {
    this.connectionState = {
      ...this.connectionState,
      isConnected,
      readyState
    };
    
    if (this.isMaster) {
      this.broadcast({
        type: 'CONNECTION_STATE',
        data: this.connectionState,
        senderId: this.tabId
      });
    }
    
    this.notifyConnectionStateHandlers();
  }

  private connect() {
    if (this.isMaster && !this.socket) {
      this.socket = new Observer(this.url, {
        format: 'json',
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        maxReconnectionDelay: 30000,
        reconnectionDelayGrowFactor: 1.5
      });
    }
  }

  private disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // 公共方法
  public send(data: any) {
    if (this.isMaster) {
      // 主标签页直接发送
      if (this.socket) {
        this.socket.send(data);
      }
    } else {
      // 从标签页通过广播发送给主标签页
      this.broadcast({
        type: 'SEND_WEBSOCKET_MESSAGE',
        data,
        senderId: this.tabId
      });
    }
  }

  public onMessage(handler: (message: WebSocketMessage) => void) {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }

  public onConnectionStateChange(handler: (state: ConnectionState) => void) {
    this.connectionStateHandlers.push(handler);
    // 立即通知当前状态
    handler(this.connectionState);
    return () => {
      this.connectionStateHandlers = this.connectionStateHandlers.filter(h => h !== handler);
    };
  }

  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  public isMasterTab(): boolean {
    return this.isMaster;
  }

  public getTabId(): string {
    return this.tabId;
  }

  public setUrl(url: string) {
    this.url = url;
    if (this.isMaster && this.socket) {
      this.disconnect();
      this.connect();
    }
  }

  private notifyMessageHandlers(message: WebSocketMessage) {
    this.messageHandlers.forEach(handler => handler(message));
  }

  private notifyConnectionStateHandlers() {
    this.connectionStateHandlers.forEach(handler => handler(this.connectionState));
  }

  // 清理方法
  public destroy() {
    this.channel.close();
    this.disconnect();
    this.messageHandlers = [];
    this.connectionStateHandlers = [];
  }
}

export default WebSocketConnectionManager.getInstance();
