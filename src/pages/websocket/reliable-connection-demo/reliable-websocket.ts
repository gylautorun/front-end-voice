export type ReliableSocketState =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed';

export interface ReconnectInfo {
  attempt: number;
  delay: number;
}

interface ReliableWebSocketOptions {
  getUrl: () => string;
  heartbeatInterval?: number;
  reconnectBaseDelay?: number;
  maxReconnectDelay?: number;
  reconnectJitter?: number;
  maxQueueSize?: number;
  onStateChange?: (state: ReliableSocketState) => void;
  onMessage?: (data: string) => void;
  onQueueChange?: (size: number) => void;
  onHeartbeat?: (latency: number) => void;
  onReconnectScheduled?: (info: ReconnectInfo) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: () => void;
}

const DEFAULT_OPTIONS = {
  heartbeatInterval: 10_000,
  reconnectBaseDelay: 1_000,
  maxReconnectDelay: 30_000,
  reconnectJitter: 1_000,
  maxQueueSize: 100,
};

/**
 * Browser WebSocket wrapper with business heartbeats, queued sends and
 * exponential-backoff reconnects. Protocol-level ping/pong remains a server job.
 */
export class ReliableWebSocket {
  private socket: WebSocket | null = null;
  private readonly options: ReliableWebSocketOptions & typeof DEFAULT_OPTIONS;
  private reconnectAttempts = 0;
  private reconnectTimer?: number;
  private heartbeatTimer?: number;
  private awaitingPongAt?: number;
  private manualClose = true;
  private state: ReliableSocketState = 'idle';
  private queue: string[] = [];

  constructor(options: ReliableWebSocketOptions) {
    this.options = {...DEFAULT_OPTIONS, ...options};
  }

  connect() {
    if (
      this.socket?.readyState === WebSocket.OPEN
      || this.socket?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    this.manualClose = false;
    this.clearReconnectTimer();
    this.openSocket(false);
  }

  send(data: string): 'sent' | 'queued' {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(data);
      return 'sent';
    }

    if (this.queue.length >= this.options.maxQueueSize) {
      this.queue.shift();
    }
    this.queue.push(data);
    this.options.onQueueChange?.(this.queue.length);
    return 'queued';
  }

  close() {
    this.manualClose = true;
    this.clearReconnectTimer();
    this.stopHeartbeat();

    const socket = this.socket;
    this.socket = null;
    if (
      socket?.readyState === WebSocket.OPEN
      || socket?.readyState === WebSocket.CONNECTING
    ) {
      socket.close(1000, 'manual close');
    }
    this.setState('closed');
  }

  destroy() {
    this.close();
    this.queue = [];
    this.options.onQueueChange?.(0);
  }

  private openSocket(isReconnect: boolean) {
    this.setState(isReconnect ? 'reconnecting' : 'connecting');

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.options.getUrl());
    } catch {
      this.options.onError?.();
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.reconnectAttempts = 0;
      this.awaitingPongAt = undefined;
      this.setState('open');
      this.startHeartbeat();
      this.flushQueue();
    };

    socket.onmessage = (event) => {
      if (event.data === 'pong') {
        if (this.awaitingPongAt !== undefined) {
          this.options.onHeartbeat?.(Date.now() - this.awaitingPongAt);
        }
        this.awaitingPongAt = undefined;
        return;
      }
      this.options.onMessage?.(String(event.data));
    };

    socket.onerror = () => {
      if (this.socket === socket) this.options.onError?.();
    };

    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.stopHeartbeat();
      this.options.onClose?.(event);
      if (this.manualClose) {
        this.setState('closed');
      } else {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect() {
    if (this.manualClose || this.reconnectTimer !== undefined) return;

    const attempt = ++this.reconnectAttempts;
    const exponentialDelay = Math.min(
      this.options.maxReconnectDelay,
      this.options.reconnectBaseDelay * 2 ** (attempt - 1),
    );
    const delay = Math.round(
      exponentialDelay + Math.random() * this.options.reconnectJitter,
    );

    this.setState('reconnecting');
    this.options.onReconnectScheduled?.({attempt, delay});
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      this.openSocket(true);
    }, delay);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      if (this.socket?.readyState !== WebSocket.OPEN) return;

      if (this.awaitingPongAt !== undefined) {
        this.socket.close(4000, 'heartbeat timeout');
        return;
      }

      this.awaitingPongAt = Date.now();
      this.socket.send('ping');
    }, this.options.heartbeatInterval);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer !== undefined) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    this.awaitingPongAt = undefined;
  }

  private flushQueue() {
    while (this.queue.length && this.socket?.readyState === WebSocket.OPEN) {
      const message = this.queue.shift();
      if (message !== undefined) this.socket.send(message);
    }
    this.options.onQueueChange?.(this.queue.length);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== undefined) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private setState(state: ReliableSocketState) {
    if (this.state === state) return;
    this.state = state;
    this.options.onStateChange?.(state);
  }
}
