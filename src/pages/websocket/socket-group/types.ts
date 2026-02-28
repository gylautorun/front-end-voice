/** 单条聊天消息 */
export interface ChatMessage {
  id: string;
  /** 发送者所在 tab 的 id（用于区分不同浏览器标签页） */
  tabId: string;
  /** 发送者（页面内的某个用户） */
  userId?: string;
  nickname: string;
  text: string;
  timestamp: number;
  /** 是否来自当前标签页（用于区分展示） */
  isLocal?: boolean;
}

/** BroadcastChannel 消息格式 */
export interface ChannelMessage {
  type: 'chat';
  payload: Omit<ChatMessage, 'isLocal'>;
}
