import { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Input } from 'antd';
import style from './style.module.scss';
import type { ChatMessage, ChannelMessage } from './types';

const CHANNEL_NAME = 'socket-group-chat';
const DEFAULT_WS_URL = 'ws://localhost:8080';

interface ChatUser {
  id: string;
  nickname: string;
  isMain: boolean;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function generateTabId(): string {
  return `tab-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
}

function tabPrefix(tabId: string): string {
  return tabId.split('-').slice(1, 3).join('-');
}

function SocketGroup() {
  const [users, setUsers] = useState<ChatUser[]>(() => [
    { id: generateId(), nickname: '主用户', isMain: true },
    { id: generateId(), nickname: '用户B', isMain: false },
  ]);
  const [inputByUserId, setInputByUserId] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [wsUrl, setWsUrl] = useState(DEFAULT_WS_URL);
  const [isConnected, setIsConnected] = useState(false);

  const tabIdRef = useRef<string>(generateTabId());
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const mainUserIdRef = useRef<string>('');
  const wsRef = useRef<WebSocket | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const main = users.find((u) => u.isMain);
    if (main) mainUserIdRef.current = main.id;
  }, [users]);

  // 当消息列表变化时，滚动到最新位置
  useEffect(() => {
    setTimeout(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }, 0);
  }, [messages]);

  // 广播通道：多标签页互通，无需后端
  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;
    const onMessage = (e: MessageEvent<ChannelMessage>) => {
      if (e.data?.type === 'chat' && e.data.payload) {
        const { id, nickname: n, text, timestamp, tabId, userId } = e.data.payload;
        if (!id || seenMessageIdsRef.current.has(id)) return;
        seenMessageIdsRef.current.add(id);
        // 单页多用户场景：只有主用户视为“本地”（右侧），同页其他用户也视为“远端”（左侧）
        const isLocal = tabId === tabIdRef.current && !!userId && userId === mainUserIdRef.current;
        setMessages((prev) => [
          ...prev,
          { id, tabId, userId, nickname: n, text, timestamp, isLocal },
        ]);
      }
    };
    channel.addEventListener('message', onMessage);
    return () => {
      channel.removeEventListener('message', onMessage);
      channel.close();
      channelRef.current = null;
    };
  }, []);

  // WebSocket 连接与断开
  const connect = useCallback(() => {
    const url = wsUrl.trim();
    if (!url) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;
    };
    ws.onerror = () => {};
    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string);
        
        // 处理历史消息
        if (data.type === 'history' && data.messages) {
          const newMessages = data.messages.filter((msg: ChatMessage) => {
            if (!msg.id || seenMessageIdsRef.current.has(msg.id)) return false;
            seenMessageIdsRef.current.add(msg.id);
            return true;
          });
          if (newMessages.length > 0) {
            setMessages((prev) => [
              ...prev,
              ...newMessages.map((msg: ChatMessage) => ({
                id: msg.id,
                tabId: msg.tabId || 'tab-unknown',
                userId: msg.userId,
                nickname: msg.nickname || '?',
                text: msg.text || '',
                timestamp: msg.timestamp || Date.now(),
                isLocal: (msg.tabId === tabIdRef.current && msg.userId === mainUserIdRef.current)
              }))
            ]);
          }
          return;
        }
        
        // 处理普通消息
        const payload = data.payload ?? data;
        const id = payload.id ?? generateId();
        const tabId = payload.tabId ?? 'tab-unknown';
        const userId = payload.userId;
        const nicknameStr = payload.nickname ?? '?';
        const text = payload.text ?? String(event.data);
        const timestamp = payload.timestamp ?? Date.now();
        if (seenMessageIdsRef.current.has(id)) return;
        seenMessageIdsRef.current.add(id);
        const isLocal = tabId === tabIdRef.current && !!userId && userId === mainUserIdRef.current;
        setMessages((prev) => [...prev, { id, tabId, userId, nickname: nicknameStr, text, timestamp, isLocal }]);
      } catch {
        const id = generateId();
        const tabId = 'tab-unknown';
        if (seenMessageIdsRef.current.has(id)) return;
        seenMessageIdsRef.current.add(id);
        setMessages((prev) => [...prev, { id, tabId, nickname: '?', text: String(event.data), timestamp: Date.now(), isLocal: false }]);
      }
    };
  }, [wsUrl]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const sendMessage = useCallback((userId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const user = users.find((u) => u.id === userId);
    const name = user?.nickname.trim() || '匿名';
    const msg: ChatMessage = {
      id: generateId(),
      tabId: tabIdRef.current,
      userId,
      nickname: name,
      text: trimmed,
      timestamp: Date.now(),
      isLocal: !!user?.isMain,
    };
    setInputByUserId((prev) => ({ ...prev, [userId]: '' }));
    if (!seenMessageIdsRef.current.has(msg.id)) {
      seenMessageIdsRef.current.add(msg.id);
      setMessages((prev) => [...prev, msg]);
    }

    const channel = channelRef.current;
    if (channel) {
      channel.postMessage({
        type: 'chat',
        payload: {
          id: msg.id,
          tabId: msg.tabId,
          userId: msg.userId,
          nickname: msg.nickname,
          text: msg.text,
          timestamp: msg.timestamp,
        },
      } as ChannelMessage);
    }
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'chat', ...msg }));
    }
    setTimeout(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }, 0);
  }, [users]);

  const addUser = useCallback(() => {
    setUsers((prev) => [
      ...prev,
      { id: generateId(), nickname: `用户${String.fromCharCode(65 + prev.length)}`, isMain: false },
    ]);
  }, []);

  const removeUser = useCallback((userId: string) => {
    setUsers((prev) => prev.filter((u) => !(u.id === userId && !u.isMain)));
    setInputByUserId((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  }, []);

  const setUserNickname = useCallback((userId: string, nickname: string) => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, nickname } : u)));
  }, []);

  const setUserInput = useCallback((userId: string, value: string) => {
    setInputByUserId((prev) => ({ ...prev, [userId]: value }));
  }, []);

  const mainUser = users.find((u) => u.isMain);
  const otherUsers = users.filter((u) => !u.isMain);

  return (
    <div className={style['socket-group']}>
      <div className={style.header}>
        <h2 className={style.title}>多人聊天 Demo</h2>
        <p className={style.hint}>
          单页多用户：主用户代表“自己”，同页新增的用户代表“其他人”。多开标签页可与其他标签互通。可选填 WebSocket 连接服务端。
        </p>
        <p className={style['tab-id']}>当前 Tab：{tabPrefix(tabIdRef.current)}</p>
      </div>

      <div className={style.config}>
        <div className={style['ws-row']}>
          <Input
            placeholder="WebSocket 地址（可选，如 ws://localhost:8080）"
            value={wsUrl}
            onChange={(e) => setWsUrl(e.target.value)}
            className={style['ws-input']}
            disabled={isConnected}
          />
          {!isConnected ? (
            <Button type="primary" onClick={connect} disabled={!wsUrl.trim()}>
              连接
            </Button>
          ) : (
            <Button danger onClick={disconnect}>
              断开
            </Button>
          )}
        </div>
      </div>

      <div className={style.room}>
        <div className={style['message-list']} ref={listRef}>
          {messages.length === 0 && (
            <div className={style.empty}>暂无消息，用下方任一用户输入框发送～</div>
          )}
          {messages.map((m) => (
            // 展示层再兜底一次：只有主用户 + 当前 tab 才算本地
            <div
              key={m.id}
              className={(m.tabId === tabIdRef.current && m.userId === mainUserIdRef.current) ? style['message-local'] : style['message-remote']}
            >
              <span className={style['message-meta']}>
                [{tabPrefix(m.tabId)}] {m.nickname} · {new Date(m.timestamp).toLocaleTimeString()}
              </span>
              <div className={style['message-text']}>{m.text}</div>
            </div>
          ))}
        </div>
        <div className={style['users-inputs']}>
          {mainUser && (
            <div className={style['main-user']}>
              <div className={style['user-label']}>
                <Input
                  value={mainUser.nickname}
                  onChange={(e) => setUserNickname(mainUser.id, e.target.value)}
                  placeholder="昵称"
                  maxLength={20}
                  className={style['user-nickname']}
                />
                <span className={style['main-badge']}>主用户</span>
              </div>
              <div className={style['send-row']}>
                <Input.TextArea
                  value={inputByUserId[mainUser.id] ?? ''}
                  onChange={(e) => setUserInput(mainUser.id, e.target.value)}
                  onPressEnter={(e) => {
                    if (!e.shiftKey) {
                      e.preventDefault();
                      sendMessage(mainUser.id, inputByUserId[mainUser.id] ?? '');
                    }
                  }}
                  placeholder="我来说一句…"
                  autoSize={{ minRows: 1, maxRows: 3 }}
                  className={style['text-area']}
                />
                <Button
                  type="primary"
                  onClick={() => sendMessage(mainUser.id, inputByUserId[mainUser.id] ?? '')}
                  disabled={!(inputByUserId[mainUser.id] ?? '').trim()}
                >
                  发送
                </Button>
              </div>
            </div>
          )}

          <div className={style['other-users-header']}>其他人</div>
          {otherUsers.map((user) => (
            <div key={user.id} className={style['user-row']}>
              <div className={style['user-label']}>
                <Input
                  value={user.nickname}
                  onChange={(e) => setUserNickname(user.id, e.target.value)}
                  placeholder="昵称"
                  maxLength={20}
                  className={style['user-nickname']}
                />
                <Button type="text" size="small" danger onClick={() => removeUser(user.id)}>
                  移除
                </Button>
              </div>
              <div className={style['send-row']}>
                <Input.TextArea
                  value={inputByUserId[user.id] ?? ''}
                  onChange={(e) => setUserInput(user.id, e.target.value)}
                  onPressEnter={(e) => {
                    if (!e.shiftKey) {
                      e.preventDefault();
                      sendMessage(user.id, inputByUserId[user.id] ?? '');
                    }
                  }}
                  placeholder={`${user.nickname || '该用户'} 输入…`}
                  autoSize={{ minRows: 1, maxRows: 3 }}
                  className={style['text-area']}
                />
                <Button
                  type="primary"
                  onClick={() => sendMessage(user.id, inputByUserId[user.id] ?? '')}
                  disabled={!(inputByUserId[user.id] ?? '').trim()}
                >
                  发送
                </Button>
              </div>
            </div>
          ))}
          <Button className={style['add-user']} onClick={addUser}>
            添加用户
          </Button>
        </div>
      </div>
    </div>
  );
}

export default SocketGroup;
