import Emitter from './emitter';
import { WebSocketOpts } from './type';

export default class Observer {
  private connectionUrl: string;
  private opts: WebSocketOpts;
  private format: string;
  public reconnection: boolean;
  private reconnectionAttempts: number;
  private reconnectionDelay: number;
  public reconnectTimeoutId: number | null = null;
  private reconnectionCount: number = 0;
  private passToStoreHandler: any;
  private store: any;
  private mutations: any;
  public WebSocket: WebSocket | null = null;
  
  constructor(connectionUrl: string, opts: WebSocketOpts = { format: '' }) {
    this.format = opts.format && opts.format.toLowerCase();
    
    if (connectionUrl.startsWith('//')) {
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
      connectionUrl = `${scheme}:${connectionUrl}`;
    }
    
    this.connectionUrl = connectionUrl;
    this.opts = opts;
    this.reconnection = this.opts.reconnection || false;
    this.reconnectionAttempts = this.opts.reconnectionAttempts || Infinity;
    this.reconnectionDelay = this.opts.reconnectionDelay || 1000;
    this.passToStoreHandler = this.opts.passToStoreHandler;
    
    if (opts.store) {
      this.store = opts.store;
    }
    
    if (opts.mutations) {
      this.mutations = opts.mutations;
    }
    
    if (!opts.connectManually) {
      this.connect(connectionUrl, opts);
      this.onEvent();
    }
  }
  
  connect(connectionUrl: string, opts: WebSocketOpts = { format: '' }): WebSocket {
    const protocol = opts.protocol || '';
    
    this.WebSocket = opts.WebSocket || 
      (protocol === '' 
        ? new WebSocket(connectionUrl) 
        : new WebSocket(connectionUrl, protocol));
    
    if (this.format === 'json') {
      if (!('sendObj' in this.WebSocket)) {
        (this.WebSocket as any).sendObj = (obj: any) => 
          this.WebSocket!.send(JSON.stringify(obj));
      }
    }
    
    return this.WebSocket;
  }
  
  reconnect(): void {
    if (this.reconnectionCount <= this.reconnectionAttempts) {
      this.reconnectionCount++;
      
      if (this.reconnectTimeoutId) {
        clearTimeout(this.reconnectTimeoutId);
      }
      
      this.reconnectTimeoutId = setTimeout(() => {
        if (this.store) {
          this.passToStore('SOCKET_RECONNECT', this.reconnectionCount);
        }
        
        this.connect(this.connectionUrl, this.opts);
        this.onEvent();
      }, this.reconnectionDelay);
    } else {
      if (this.store) {
        this.passToStore('SOCKET_RECONNECT_ERROR', true);
      }
    }
  }
  
  onEvent(): void {
    if (!this.WebSocket) return;
    
    this.WebSocket.onopen = (event) => {
      Emitter.emit('onopen', event);
      this.opts.onOpen?.(event);
      
      if (this.store) {
        this.passToStore('SOCKET_ONOPEN', event);
      }
      
      if (this.reconnection) {
        this.reconnectionCount = 0;
      }
    };
    
    this.WebSocket.onclose = (event) => {
      Emitter.emit('onclose', event);
      this.opts.onClose?.(event);
      
      if (this.store) {
        this.passToStore('SOCKET_ONCLOSE', event);
      }
      
      if (this.reconnection) {
        this.reconnect();
      }
    };
    
    this.WebSocket.onerror = (event) => {
      Emitter.emit('onerror', event);
      this.opts.onError?.(event);
      
      if (this.store) {
        this.passToStore('SOCKET_ONERROR', event);
      }
    };
    
    this.WebSocket.onmessage = (event) => {
      Emitter.emit('onmessage', event);
      this.opts.onMessage?.(event);
      
      if (this.store) {
        this.passToStore('SOCKET_ONMESSAGE', event);
      }
    };
  }
  
  passToStore(eventName: string, event: any): void {
    if (this.passToStoreHandler) {
      this.passToStoreHandler(
        eventName,
        event,
        this.defaultPassToStore.bind(this)
      );
    } else {
      this.defaultPassToStore(eventName, event);
    }
  }
  
  defaultPassToStore(
    eventName: string,
    event: {
      data: string;
      mutation: string;
      namespace: string;
      action: string;
    }
  ): void {
    if (!eventName.startsWith('SOCKET_')) {
      return;
    }
    
    let method = 'commit';
    let target = eventName.toUpperCase();
    let msg = event;
    
    if (this.format === 'json' && event.data) {
      try {
        msg = JSON.parse(event.data);
        
        if (msg.mutation) {
          target = [msg.namespace || '', msg.mutation]
            .filter((e: string) => !!e)
            .join('/');
        } else if (msg.action) {
          method = 'dispatch';
          target = [msg.namespace || '', msg.action]
            .filter((e: string) => !!e)
            .join('/');
        }
      } catch (error) {
        console.error('Error parsing JSON message:', error);
      }
    }
    
    if (this.mutations) {
      target = this.mutations[target] || target;
    }
    
    if (this.store) {
      if (this.store._p) {
        // Pinia
        this.store[target](msg);
      } else {
        // Vuex or Redux
        if (typeof this.store[method] === 'function') {
          this.store[method](target, msg);
        }
      }
    }
  }
  
  disconnect(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    
    if (this.WebSocket) {
      this.WebSocket.close();
      this.WebSocket = null;
    }
  }
  
  send(data: string | any): void {
    if (!this.WebSocket || this.WebSocket.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket is not connected');
      return;
    }
    
    if (this.format === 'json' && typeof data === 'object') {
      if (typeof (this.WebSocket as any).sendObj === 'function') {
        (this.WebSocket as any).sendObj(data);
      } else {
        this.WebSocket.send(JSON.stringify(data));
      }
    } else {
      this.WebSocket.send(data);
    }
  }
}