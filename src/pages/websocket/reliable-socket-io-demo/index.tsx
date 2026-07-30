import {useEffect, useRef, useState} from 'react';
import {
  ApiOutlined,
  ClearOutlined,
  ClockCircleOutlined,
  DisconnectOutlined,
  InboxOutlined,
  SendOutlined,
  SwapOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {Button, Input, Tag, Tooltip} from 'antd';
import {io, type Socket} from 'socket.io-client';
import style from '../reliable-connection-demo/index.module.scss';

type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

interface ChatMessage {
  id: number;
  clientId: string;
  nickname: string;
  text: string;
  sentAt: string;
}

interface ConnectionReadyEvent {
  socketId: string;
  recovered: boolean;
  online: number;
}

interface ChatAck {
  ok: boolean;
  id?: number;
  error?: string;
}

interface ActivityItem {
  id: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
  text: string;
  timestamp: number;
}

const STATE_LABELS: Record<ConnectionState, string> = {
  connecting: '连接中',
  connected: '已连接',
  reconnecting: '自动重连中',
  disconnected: '已断开',
};

function createClientId() {
  return `io-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(value: number | string) {
  return new Date(value).toLocaleTimeString('zh-CN', {hour12: false});
}

export default function SocketIoReliableDemo() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [transport, setTransport] = useState('--');
  const [latency, setLatency] = useState<number | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [nickname, setNickname] = useState('访客');
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const clientIdRef = useRef(createClientId());
  const pendingIdsRef = useRef(new Set<string>());
  const seenMessageIdsRef = useRef(new Set<number>());
  const activitySequenceRef = useRef(0);
  const messageListRef = useRef<HTMLDivElement>(null);

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
    const socket = io(window.location.origin, {
      path: '/socket.io',
      autoConnect: false,
      auth: {clientId: clientIdRef.current},
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.5,
      timeout: 10_000,
    });
    const manager = socket.io;
    let latencyTimer: number | undefined;

    const updateTransport = () => {
      const engine = socket.io.engine;
      setTransport(engine?.transport.name ?? '--');
      engine?.once('upgrade', (nextTransport) => {
        setTransport(nextTransport.name);
        addActivity(`Engine.IO transport 已升级为 ${nextTransport.name}`, 'success');
      });
    };

    const probeLatency = () => {
      if (!socket.connected) return;
      const startedAt = Date.now();
      socket.timeout(3_000).emit(
        'latency:probe',
        startedAt,
        (error: Error | null, response?: {clientSentAt: number}) => {
          if (error || !response) {
            setLatency(null);
            return;
          }
          const roundTrip = Date.now() - response.clientSentAt;
          setLatency(roundTrip);
          addActivity(`Socket.IO ack 往返 ${roundTrip} ms`, 'success');
        },
      );
    };

    socket.on('connect', () => {
      setConnectionState('connected');
      updateTransport();
      addActivity(`Socket.IO 已连接：${socket.id}`, 'success');
      window.clearInterval(latencyTimer);
      latencyTimer = window.setInterval(probeLatency, 10_000);
    });

    socket.on('disconnect', (reason) => {
      window.clearInterval(latencyTimer);
      latencyTimer = undefined;
      setLatency(null);
      setTransport('--');
      setConnectionState(socket.active ? 'reconnecting' : 'disconnected');
      addActivity(
        `连接断开：${reason}`,
        socket.active ? 'warning' : 'info',
      );
    });

    socket.on('connect_error', (error) => {
      addActivity(`连接失败：${error.message}`, 'danger');
    });

    socket.on('connection:ready', (event: ConnectionReadyEvent) => {
      addActivity(
        event.recovered
          ? `会话与遗漏事件已恢复，当前在线 ${event.online} 个连接`
          : `新会话已建立，当前在线 ${event.online} 个连接`,
        event.recovered ? 'warning' : 'success',
      );
    });

    socket.on('chat:message', (message: ChatMessage) => {
      if (seenMessageIdsRef.current.has(message.id)) return;
      seenMessageIdsRef.current.add(message.id);
      setMessages((current) => [...current, message].slice(-100));
      addActivity(`收到 chat:message #${message.id}`);
      window.setTimeout(() => {
        messageListRef.current?.scrollTo({
          top: messageListRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }, 0);
    });

    manager.on('reconnect_attempt', (attempt) => {
      setReconnectAttempt(attempt);
      setConnectionState('reconnecting');
      addActivity(`Manager 正在执行第 ${attempt} 次重连`, 'warning');
    });

    manager.on('reconnect', (attempt) => {
      setReconnectAttempt(attempt);
      addActivity(`Manager 第 ${attempt} 次重连成功`, 'success');
    });

    manager.on('reconnect_error', (error) => {
      addActivity(`重连失败：${error.message}`, 'danger');
    });

    manager.on('reconnect_failed', () => {
      setConnectionState('disconnected');
      addActivity('已达到最大重连次数', 'danger');
    });

    socketRef.current = socket;
    socket.connect();

    return () => {
      window.clearInterval(latencyTimer);
      socket.removeAllListeners();
      manager.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const sendMessage = () => {
    const socket = socketRef.current;
    const text = draft.trim();
    if (!socket || !text) return;
    if (pendingIdsRef.current.size >= 100) {
      addActivity('待确认消息已达到 100 条上限', 'danger');
      return;
    }

    const clientMessageId = `${clientIdRef.current}-${Date.now()}`;
    pendingIdsRef.current.add(clientMessageId);
    setPendingCount(pendingIdsRef.current.size);
    setDraft('');
    addActivity(
      socket.connected
        ? 'chat:send 已发出，等待服务端 ack'
        : '事件已进入 Socket.IO 发送缓冲区',
      socket.connected ? 'info' : 'warning',
    );

    socket.emit('chat:send', {
      clientId: clientIdRef.current,
      clientMessageId,
      nickname: nickname.trim() || '匿名',
      text,
    }, (ack: ChatAck) => {
      pendingIdsRef.current.delete(clientMessageId);
      setPendingCount(pendingIdsRef.current.size);
      addActivity(
        ack.ok ? `服务端已确认消息 #${ack.id}` : `消息被拒绝：${ack.error}`,
        ack.ok ? 'success' : 'danger',
      );
    });
  };

  const connected = connectionState === 'connected';

  return (
    <main className={style.page}>
      <header className={style.header}>
        <div>
          <p className={style.eyebrow}>SOCKET.IO LAB</p>
          <h1>Socket.IO 可靠连接</h1>
        </div>
        <Tag color={connected ? 'success' : connectionState === 'reconnecting' ? 'warning' : 'default'}>
          {STATE_LABELS[connectionState]}
        </Tag>
      </header>

      <section className={style.connectionBar} aria-label="连接控制">
        <Input
          prefix={<ApiOutlined />}
          value={`${window.location.origin}/socket.io`}
          disabled
          aria-label="Socket.IO 服务地址"
        />
        <div className={style.connectionActions}>
          {connectionState === 'disconnected' ? (
            <Button
              type="primary"
              icon={<ApiOutlined />}
              onClick={() => {
                setConnectionState('connecting');
                socketRef.current?.connect();
              }}
            >
              连接
            </Button>
          ) : (
            <Button
              icon={<DisconnectOutlined />}
              onClick={() => socketRef.current?.disconnect()}
            >
              断开
            </Button>
          )}
          <Button
            danger
            icon={<ThunderboltOutlined />}
            disabled={!connected}
            onClick={() => {
              socketRef.current?.emit('demo:transport-drop');
              addActivity('已请求关闭底层 Engine.IO transport', 'warning');
            }}
          >
            模拟断线
          </Button>
        </div>
      </section>

      <section className={style.metrics} aria-label="连接指标">
        <div className={style.metric}>
          <SwapOutlined />
          <span>当前 transport</span>
          <strong>{transport}</strong>
        </div>
        <div className={style.metric}>
          <ClockCircleOutlined />
          <span>应用层 ack</span>
          <strong>{latency === null ? '--' : `${latency} ms`}</strong>
        </div>
        <div className={style.metric}>
          <ApiOutlined />
          <span>重连次数</span>
          <strong>{reconnectAttempt}</strong>
        </div>
        <div className={style.metric}>
          <InboxOutlined />
          <span>待确认消息</span>
          <strong>{pendingCount}</strong>
        </div>
      </section>

      <section className={style.workspace}>
        <div className={style.chatPanel}>
          <div className={style.panelHeader}>
            <div>
              <h2>Socket.IO 事件通道</h2>
              <span>chat:send → chat:message</span>
            </div>
            <Tag>{clientIdRef.current}</Tag>
          </div>

          <div className={style.messageList} ref={messageListRef}>
            {messages.length === 0 ? (
              <div className={style.empty}>等待第一条事件</div>
            ) : messages.map((message) => {
              const local = message.clientId === clientIdRef.current;
              return (
                <article
                  key={message.id}
                  className={local ? style.localMessage : style.remoteMessage}
                >
                  <div className={style.messageMeta}>
                    <span>{message.nickname}</span>
                    <span>#{message.id} · {formatTime(message.sentAt)}</span>
                  </div>
                  <p>{message.text}</p>
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
              placeholder={connected ? '输入 chat:send 事件内容' : '事件会在重连后由 Socket.IO 自动发送'}
              autoSize={{minRows: 1, maxRows: 3}}
              maxLength={500}
              aria-label="消息"
            />
            <Tooltip title={connected ? '发送事件' : '加入发送缓冲区'}>
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={sendMessage}
                disabled={!draft.trim()}
                aria-label={connected ? '发送事件' : '加入发送缓冲区'}
              />
            </Tooltip>
          </div>
        </div>

        <aside className={style.activityPanel}>
          <div className={style.panelHeader}>
            <div>
              <h2>Manager 事件</h2>
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
              <div className={style.empty}>暂无 Manager 事件</div>
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
