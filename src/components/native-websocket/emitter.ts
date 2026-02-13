export class Emitter {
  private listeners: Map<string, Array<{ callback: (...args: any[]) => void; context: any }>>;
  
  constructor() {
    this.listeners = new Map();
  }
  
  /**
   * 添加事件监听 | Add event listener
   * @param event 事件名称 | Event name
   * @param callback 回调函数 | Callback
   * @param context 上下文 | Context
   */
  addListener(event: string, callback: (...args: any[]) => void, context: any): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push({ callback, context });
  }
  
  /**
   * 移除事件监听 | Remove event listener
   * @param event 事件名称 | Event name
   * @param callback 回调函数 | Callback
   * @param context 上下文 | Context
   */
  removeListener(event: string, callback: (...args: any[]) => void, context: any): void {
    if (!this.listeners.has(event)) return;
    
    const eventListeners = this.listeners.get(event)!;
    const index = eventListeners.findIndex(
      listener => listener.callback === callback && listener.context === context
    );
    
    if (index !== -1) {
      eventListeners.splice(index, 1);
      if (eventListeners.length === 0) {
        this.listeners.delete(event);
      }
    }
  }
  
  /**
   * 触发事件 | Trigger event
   * @param event 事件名称 | Event name
   * @param args 事件参数 | Event arguments
   */
  emit(event: string, ...args: any[]): void {
    if (!this.listeners.has(event)) return;
    
    const eventListeners = this.listeners.get(event)!;
    eventListeners.forEach(({ callback, context }) => {
      callback.apply(context, args);
    });
  }
  
  /**
   * 移除所有事件监听 | Remove all event listeners
   * @param event 事件名称 | Event name (optional)
   */
  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

export default new Emitter();