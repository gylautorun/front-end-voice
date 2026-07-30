import {useEffect, useRef, useState} from 'react';
import {
  ApiOutlined,
  ClearOutlined,
  ClockCircleOutlined,
  DisconnectOutlined,
  InboxOutlined,
  ReloadOutlined,
  SendOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {Button, Input, Tag, Tooltip} from 'antd';
import {
  ReliableWebSocket,
  type ReliableSocketState,
} from './reliable-websocket';
import style from './index.module.scss';

interface ChatMessage {
  type: 'chat';
  id: number;
  clientId: string;
  nickname: string;
  text: string;
  sentAt: string;
  replayed?: boolean;
}

interface ServerEvent {
  type: 'connection' | 'system' | 'error';
  message: string;
  clientId?: string;
  online?: number;
  sentAt?: string;
}

interface ActivityItem {
  id: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
  text: string;
  timestamp: number;
}

const STATE_LABELS: Record<ReliableSocketState, string> = {
  idle: '未启动',
  connecting: '连接中',
  open: '已连接',
  reconnecting: '等待重连',
  closed: '已断开',
};

function createClientId() {
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDefaultUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/reliable`;
}

function formatTime(timestamp: number | string) {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {hour12: false});
}

export default function ReliableConnectionDemo() {
  const [wsUrl, setWsUrl] = useState(getDefaultUrl);
  const [nickname, setNickname] = useState('访客');
  const [draft, setDraft] = useState('');
  const [socketState, setSocketState] = useState<ReliableSocketState>('idle');
  const [queueSize, setQueueSize] = useState(0);
  const [heartbeatLatency, setHeartbeatLatency] = useState<number | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [nextReconnectDelay, setNextReconnectDelay] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  const socketRef = useRef<ReliableWebSocket | null>(null);
  const wsUrlRef = useRef(wsUrl);
  const lastMessageIdRef = useRef(0);
  const seenMessageIdsRef = useRef(new Set<number>());
  const clientIdRef = useRef(createClientId());
  const activitySequenceRef = useRef(0);
  const messageListRef = useRef<HTMLDivElement>(null);

  wsUrlRef.current = wsUrl;

  const addActivity = (
    text: string,
    tone: ActivityItem['tone'] = 'info',
  ) => {
    const sequence = ++activitySequenceRef.current;
    setActivities((current) => [
      {
        id: `${Date.now()}-${sequence}`,
        tone,
        text,
        timestamp: Date.now(),
      },
      ...current,
    ].slice(0, 60));
  };

  useEffect(() => {
    const socket = new ReliableWebSocket({
      getUrl: () => {
        const url = new URL(wsUrlRef.current);
        url.searchParams.set('clientId', clientIdRef.current);
        url.searchParams.set('lastId', String(lastMessageIdRef.current));
        return url.toString();
      },
      heartbeatInterval: 10_000,
      maxReconnectDelay: 30_000,
      onStateChange: (state) => {
        setSocketState(state);
        if (state === 'open') {
          setReconnectAttempt(0);
          setNextReconnectDelay(null);
          addActivity('连接已建立，离线队列已开始补发', 'success');
        }
      },
      onQueueChange: setQueueSize,
      onHeartbeat: (latency) => {
        setHeartbeatLatency(latency);
        addActivity(`业务心跳 pong，往返 ${latency} ms`, 'success');
      },
      onReconnectScheduled: ({attempt, delay}) => {
        setReconnectAttempt(attempt);
        setNextReconnectDelay(delay);
        addActivity(`第 ${attempt} 次重连将在 ${(delay / 1000).toFixed(1)} 秒后执行`, 'warning');
      },
      onClose: (event) => {
        setHeartbeatLatency(null);
        const reason = event.reason ? `，${event.reason}` : '';
        addActivity(`连接关闭：${event.code}${reason}`, event.code === 1000 ? 'info' : 'danger');
      },
      onError: () => addActivity('WebSocket 发生错误，浏览器未提供更多细节', 'danger'),
      onMessage: (rawData) => {
        try {
          const event = JSON.parse(rawData) as ChatMessage | ServerEvent;
          if (event.type === 'chat') {
            if (seenMessageIdsRef.current.has(event.id)) return;
            seenMessageIdsRef.current.add(event.id);
            lastMessageIdRef.current = Math.max(lastMessageIdRef.current, event.id);
            setMessages((current) => [...current, event].slice(-100));
            addActivity(
              event.replayed ? `补推历史消息 #${event.id}` : `收到消息 #${event.id}`,
              event.replayed ? 'warning' : 'info',
            );
            window.setTimeout(() => {
              messageListRef.current?.scrollTo({
                top: messageListRef.current.scrollHeight,
                behavior: 'smooth',
              });
            }, 0);
            return;
          }

          if (event.type === 'connection') {
            addActivity(`${event.message}，当前在线 ${event.online ?? 1} 个连接`, 'success');
          } else {
            addActivity(event.message, event.type === 'error' ? 'danger' : 'info');
          }
        } catch {
          addActivity(`收到非 JSON 消息：${rawData}`, 'warning');
        }
      },
    });

    socketRef.current = socket;
    socket.connect();
    return () => {
      socket.destroy();
      socketRef.current = null;
    };
  }, []);

  const sendMessage = () => {
    const text = draft.trim();
    if (!text) return;

    const delivery = socketRef.current?.send(JSON.stringify({
      type: 'chat',
      clientId: clientIdRef.current,
      clientMessageId: `${clientIdRef.current}-${Date.now()}`,
      nickname: nickname.trim() || '匿名',
      text,
    }));
    setDraft('');
    addActivity(
      delivery === 'sent' ? '消息已发送' : '连接不可用，消息已进入离线队列',
      delivery === 'sent' ? 'success' : 'warning',
    );
  };

  const isOpen = socketState === 'open';

  return (
    <main className={style.page}>
      <header className={style.header}>
        <div>
          <p className={style.eyebrow}>NATIVE WEBSOCKET LAB</p>
          <h1>原生 WebSocket 可靠连接</h1>
        </div>
        <Tag color={isOpen ? 'success' : socketState === 'reconnecting' ? 'warning' : 'default'}>
          {STATE_LABELS[socketState]}
        </Tag>
      </header>

      <section className={style.connectionBar} aria-label="连接控制">
        <Input
          prefix={<ApiOutlined />}
          value={wsUrl}
          onChange={(event) => setWsUrl(event.target.value)}
          disabled={socketState === 'open' || socketState === 'connecting'}
          aria-label="WebSocket 服务地址"
        />
        <div className={style.connectionActions}>
          {socketState === 'closed' || socketState === 'idle' ? (
            <Button
              type="primary"
              icon={<ApiOutlined />}
              onClick={() => socketRef.current?.connect()}
              disabled={!wsUrl.trim()}
            >
              连接
            </Button>
          ) : (
            <Button
              icon={<DisconnectOutlined />}
              onClick={() => socketRef.current?.close()}
            >
              断开
            </Button>
          )}
          <Button
            danger
            icon={<ThunderboltOutlined />}
            disabled={!isOpen}
            onClick={() => {
              socketRef.current?.send(JSON.stringify({type: 'simulate_disconnect'}));
              addActivity('已请求服务端异常中断当前连接', 'warning');
            }}
          >
            模拟断线
          </Button>
        </div>
      </section>

      <section className={style.metrics} aria-label="连接指标">
        <div className={style.metric}>
          <ClockCircleOutlined />
          <span>心跳延迟</span>
          <strong>{heartbeatLatency === null ? '--' : `${heartbeatLatency} ms`}</strong>
        </div>
        <div className={style.metric}>
          <ReloadOutlined />
          <span>重连次数</span>
          <strong>{reconnectAttempt}</strong>
        </div>
        <div className={style.metric}>
          <InboxOutlined />
          <span>离线队列</span>
          <strong>{queueSize}</strong>
        </div>
        <div className={style.metric}>
          <ApiOutlined />
          <span>下次重连</span>
          <strong>{nextReconnectDelay === null ? '--' : `${(nextReconnectDelay / 1000).toFixed(1)} s`}</strong>
        </div>
      </section>

      <section className={style.workspace}>
        <div className={style.chatPanel}>
          <div className={style.panelHeader}>
            <div>
              <h2>消息通道</h2>
              <span>last_id: {lastMessageIdRef.current || '--'}</span>
            </div>
            <Tag>{clientIdRef.current}</Tag>
          </div>

          <div className={style.messageList} ref={messageListRef}>
            {messages.length === 0 ? (
              <div className={style.empty}>等待第一条消息</div>
            ) : messages.map((message) => {
              const isLocal = message.clientId === clientIdRef.current;
              return (
                <article
                  key={message.id}
                  className={isLocal ? style.localMessage : style.remoteMessage}
                >
                  <div className={style.messageMeta}>
                    <span>{message.nickname}</span>
                    <span>#{message.id} · {formatTime(message.sentAt)}</span>
                  </div>
                  <p>{message.text}</p>
                  {message.replayed && <Tag color="warning">断线补推</Tag>}
                </article>
              );
            })}
          </div>

          <div className={style.composer}>
            <Input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={20}
              aria-label="昵称"
              className={style.nicknameInput}
            />
            <Input.TextArea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onPressEnter={(event) => {
                if (!event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={isOpen ? '输入一条广播消息' : '消息会在重连后自动发送'}
              autoSize={{minRows: 1, maxRows: 3}}
              maxLength={500}
              aria-label="消息"
            />
            <Tooltip title={isOpen ? '发送消息' : '加入离线队列'}>
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={sendMessage}
                disabled={!draft.trim()}
                aria-label={isOpen ? '发送消息' : '加入离线队列'}
              />
            </Tooltip>
          </div>
        </div>

        <aside className={style.activityPanel}>
          <div className={style.panelHeader}>
            <div>
              <h2>连接事件</h2>
              <span>{activities.length} 条</span>
            </div>
            <Tooltip title="清空事件">
              <Button
                type="text"
                icon={<ClearOutlined />}
                onClick={() => setActivities([])}
                aria-label="清空事件"
              />
            </Tooltip>
          </div>
          <div className={style.activityList}>
            {activities.length === 0 ? (
              <div className={style.empty}>暂无连接事件</div>
            ) : activities.map((item) => (
              <div key={item.id} className={`${style.activity} ${style[item.tone]}`}>
                <time>{formatTime(item.timestamp)}</time>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
