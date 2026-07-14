import {useCallback, useEffect, useRef, useState} from 'react';
import {
    BACKLOG_SNAPSHOT_THRESHOLD,
    DEFAULT_TYPING_SPEED,
    FIRST_CHUNK_TIMEOUT_MS,
    MAX_RETRIES,
    STREAM_IDLE_TIMEOUT_MS,
    TOTAL_STREAM_TIMEOUT_MS,
    TYPING_TICK_MS,
} from '../config';
import {openStreamConnection} from '../transports';
import type {StreamConnection} from '../transports';
import type {
    StreamChunk,
    StreamMeta,
    StreamMetrics,
    StreamScenario,
    StreamStatus,
    StreamTransport,
} from '../config/types';

/** 管理 SSE 协议、断点续传和打字缓冲，视图不直接操作连接或计时器。 */
export function useAiTypedStream() {
    // displayed：已经交给 Markdown 组件渲染的文本。
    const [displayed, setDisplayed] = useState('');
    // status：当前连接和生成状态，仅用于 UI 提示。
    const [status, setStatus] = useState<StreamStatus>('idle');
    // serverInterval：模拟服务端发送相邻分片的时间间隔。
    const [serverInterval, setServerInterval] = useState(90);
    // scenario：选择 Node 服务端生成的模拟回答类型。
    const [scenario, setScenario] = useState<StreamScenario>('comprehensive');
    // transport：选择浏览器原生 EventSource 或 fetch-event-source 插件。
    const [transport, setTransport] = useState<StreamTransport>('native');
    // typingSpeed：打字机每秒追加到 displayed 的目标字符数。
    const [typingSpeed, setTypingSpeed] = useState(DEFAULT_TYPING_SPEED);
    // simulateDrop：是否让首次连接在发送指定数量分片后主动断开。
    const [simulateDrop, setSimulateDrop] = useState(true);
    // paused：控制按钮的响应式状态；实际定时器判断使用 pausedRef。
    const [paused, setPaused] = useState(false);
    // metrics：展示接收字符数、已渲染字符数和最后确认的分片序号。
    const [metrics, setMetrics] = useState<StreamMetrics>({received: 0, displayed: 0, lastSeq: 0});
    // streamMeta：首包返回的内容哈希、总字符数、总分片数和连接信息。
    const [streamMeta, setStreamMeta] = useState<StreamMeta | null>(null);

    // 两种传输都实现 close，状态机不需要分别保存 EventSource 和 AbortController。
    const connectionRef = useRef<StreamConnection | null>(null);
    // pending：网络已收到但打字机尚未显示的字符缓冲区。
    const pendingRef = useRef<string[]>([]);
    // 保存不足一个字符的消费额度，使低速设置也能保持准确。
    const typingCreditRef = useRef(0);
    // received：已经按 seq 校验并收到的完整正文，用于统计和调试。
    const receivedRef = useRef('');
    // 最近一次成功接收的 seq，重连时从该位置继续。
    const lastSeqRef = useRef(0);
    // 当前回答 ID；重新生成时换新 ID，重连时保持不变。
    const messageIdRef = useRef('');
    // 当前连续重试次数，连接成功后归零。
    const retryRef = useRef(0);
    // 指数退避重连定时器。
    const retryTimerRef = useRef<number>();
    // 流空闲检测定时器，收到正文或心跳时都会重置。
    const idleTimerRef = useRef<number>();
    // 当前连接首个业务分片的等待定时器，heartbeat 不会重置它。
    const firstChunkTimerRef = useRef<number>();
    // 整条回答的总时长定时器，重连不会重置。
    const totalTimerRef = useRef<number>();
    // 服务端是否已经发送 done；done 后停止建立新连接。
    const doneRef = useRef(false);
    // 避免组件卸载后定时任务继续更新状态。
    const mountedRef = useRef(true);
    // 为异步回调提供最新暂停值，避免闭包读取旧 state。
    const pausedRef = useRef(false);

    /** 只关闭当前底层连接，保留所有续传位置和业务计时器。 */
    const closeActiveConnection = useCallback(() => {
        connectionRef.current?.close();
        connectionRef.current = null;
    }, []);

    /** 释放连接和全部定时器，保留正文及续传位置。 */
    const clearConnection = useCallback(() => {
        closeActiveConnection();
        window.clearTimeout(retryTimerRef.current);
        window.clearTimeout(idleTimerRef.current);
        window.clearTimeout(firstChunkTimerRef.current);
        window.clearTimeout(totalTimerRef.current);
    }, [closeActiveConnection]);

    // 间接保存最新版 connect，解决重连回调之间的循环依赖和陈旧闭包问题。
    const connectRef = useRef<() => void>(() => undefined);

    /** 按指数退避安排下一次断点续传。 */
    const scheduleReconnect = useCallback(() => {
        // 已卸载、已完成或用户暂停时，不允许自动重连。
        if (!mountedRef.current || doneRef.current || pausedRef.current) return;
        closeActiveConnection();
        window.clearTimeout(retryTimerRef.current);
        window.clearTimeout(firstChunkTimerRef.current);
        window.clearTimeout(idleTimerRef.current);

        if (!navigator.onLine) {
            // 离线期间不消耗重试额度，等待浏览器 online 事件恢复。
            setStatus('reconnecting');
            return;
        }
        if (retryRef.current >= MAX_RETRIES) {
            // 达到上限后交给用户点击“重新生成”。
            window.clearTimeout(totalTimerRef.current);
            setStatus('failed');
            return;
        }

        // 700ms、1.4s、2.8s……最大 8s，并加入随机抖动避免请求同时涌入。
        const delay = Math.min(8000, 700 * 2 ** retryRef.current) + Math.random() * 300;
        retryRef.current += 1;
        setStatus('reconnecting');
        retryTimerRef.current = window.setTimeout(() => connectRef.current(), delay);
    }, [closeActiveConnection]);

    /** 重置流空闲超时；心跳也视为连接仍然存活。 */
    const armIdleTimeout = useCallback(() => {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = window.setTimeout(() => {
            if (!doneRef.current && !pausedRef.current) {
                setStatus('stalled');
                scheduleReconnect();
            }
        }, STREAM_IDLE_TIMEOUT_MS);
    }, [scheduleReconnect]);

    /** 从新回答开始计时；重连不会延长总时长上限。 */
    const armTotalTimeout = useCallback(() => {
        window.clearTimeout(totalTimerRef.current);
        totalTimerRef.current = window.setTimeout(() => {
            if (doneRef.current || pausedRef.current) return;
            closeActiveConnection();
            setStatus('failed');
        }, TOTAL_STREAM_TIMEOUT_MS);
    }, [closeActiveConnection]);

    /** 校验并接收业务分片；两种传输最终都进入同一个协议入口。 */
    const acceptMessage = useCallback((data: string) => {
        // 防御性忽略没有业务 data 的 SSE 控制帧。
        if (!data.trim()) return;
        window.clearTimeout(firstChunkTimerRef.current);
        armIdleTimeout();

        let chunk: StreamChunk;
        try {
            chunk = JSON.parse(data) as StreamChunk;
        } catch {
            scheduleReconnect();
            return;
        }

        // 丢弃其他回答的分片，以及重连时可能重放的旧分片。
        if (chunk.messageId !== messageIdRef.current || chunk.seq <= lastSeqRef.current) return;
        if (chunk.seq !== lastSeqRef.current + 1) {
            // 出现序号断层时不拼接残缺文本，立即从 lastSeq 续传。
            scheduleReconnect();
            return;
        }

        lastSeqRef.current = chunk.seq;
        if (chunk.meta) setStreamMeta(chunk.meta);
        if (chunk.delta) {
            // 网络接收只写 received 和 pending，不直接逐分片更新正文 DOM。
            receivedRef.current += chunk.delta;
            pendingRef.current.push(...Array.from(chunk.delta));
        }
        setMetrics((current) => ({
            ...current,
            received: Array.from(receivedRef.current).length,
            lastSeq: chunk.seq,
        }));

        if (chunk.done) {
            // 网络完成不等于打字完成，pending 清空后才将状态更新为 done。
            doneRef.current = true;
            closeActiveConnection();
            window.clearTimeout(idleTimerRef.current);
            window.clearTimeout(totalTimerRef.current);
        }
    }, [armIdleTimeout, closeActiveConnection, scheduleReconnect]);

    /** 创建选定模式的 SSE 连接，并从 lastSeq 后的第一条分片开始接收。 */
    const connect = useCallback(() => {
        if (!messageIdRef.current || doneRef.current || pausedRef.current) return;
        closeActiveConnection();
        setStatus(lastSeqRef.current ? 'reconnecting' : 'connecting');

        const params = new URLSearchParams({
            // messageId 使重连命中同一份服务端回答缓存。
            messageId: messageIdRef.current,
            // lastSeq 指定只重放客户端尚未确认的分片。
            lastSeq: String(lastSeqRef.current),
            // intervalMs 只控制服务端模拟分片速度。
            intervalMs: String(serverInterval),
            // scenario 只在 messageId 首次创建时生效。
            scenario,
            // disconnectAt 用于验证真实断流后的恢复逻辑。
            disconnectAt: simulateDrop ? '12' : '0',
        });

        armIdleTimeout();
        const connection: StreamConnection = openStreamConnection(transport, params, {
            lastSeq: lastSeqRef.current,
            onOpen() {
                if (connectionRef.current !== connection) return;
                retryRef.current = 0;
                setStatus('streaming');
                armIdleTimeout();
            },
            onMessage(data) {
                if (connectionRef.current === connection) acceptMessage(data);
            },
            onHeartbeat() {
                if (connectionRef.current === connection) armIdleTimeout();
            },
            onDisconnect() {
                if (connectionRef.current === connection && !doneRef.current) scheduleReconnect();
            },
        });
        connectionRef.current = connection;

        window.clearTimeout(firstChunkTimerRef.current);
        firstChunkTimerRef.current = window.setTimeout(() => {
            if (connectionRef.current === connection && !doneRef.current) {
                setStatus('stalled');
                scheduleReconnect();
            }
        }, FIRST_CHUNK_TIMEOUT_MS);
    }, [acceptMessage, armIdleTimeout, closeActiveConnection, scenario, scheduleReconnect, serverInterval, simulateDrop, transport]);
    // 每次渲染同步最新版函数，让定时器和事件监听始终调用最新配置。
    connectRef.current = connect;

    /** 开始一条全新回答；只有这里会清空三层文本状态。 */
    const start = useCallback(() => {
        clearConnection();
        pendingRef.current = [];
        typingCreditRef.current = 0;
        receivedRef.current = '';
        lastSeqRef.current = 0;
        retryRef.current = 0;
        doneRef.current = false;
        pausedRef.current = false;
        messageIdRef.current = `message-${Date.now()}`;
        setDisplayed('');
        setMetrics({received: 0, displayed: 0, lastSeq: 0});
        setStreamMeta(null);
        setPaused(false);
        armTotalTimeout();
        // 推迟到当前 state 更新结束后再发起连接。
        window.setTimeout(() => connectRef.current(), 0);
    }, [armTotalTimeout, clearConnection]);

    /** 暂停时关闭网络但保留 lastSeq；继续时从断点恢复。 */
    const togglePause = useCallback(() => {
        const next = !pausedRef.current;
        pausedRef.current = next;
        setPaused(next);
        if (next) {
            clearConnection();
            setStatus('idle');
        } else if (!doneRef.current) {
            // 用户主动继续视为新的可用时间窗口。
            armTotalTimeout();
            connectRef.current();
        }
    }, [armTotalTimeout, clearConnection]);

    useEffect(() => {
        // 按固定刷新周期批量消费 pending，使打字速度和网络分片速度相互独立。
        const timer = window.setInterval(() => {
            // 后台或暂停时保留积压，不频繁更新 DOM。
            if (pausedRef.current || document.hidden) return;
            const pending = pendingRef.current;
            if (!pending.length) {
                // 没有待显示内容时清空额度，避免下一批内容突然跳出多个字符。
                typingCreditRef.current = 0;
                if (doneRef.current) setStatus('done');
                return;
            }

            // 速度乘以本帧秒数，得到当前帧应获得的字符消费额度。
            typingCreditRef.current += typingSpeed * TYPING_TICK_MS / 1000;
            // 只消费完整字符，小数额度留到下一帧继续累加。
            let count = Math.floor(typingCreditRef.current);
            if (count === 0) return;

            // 后台恢复后若积压超过阈值则直接追平，避免长时间补播历史动画。
            if (pending.length > BACKLOG_SNAPSHOT_THRESHOLD) count = pending.length;
            count = Math.min(count, pending.length);
            typingCreditRef.current -= count;
            const batch = pending.splice(0, count).join('');
            // 始终追加本帧文本，不覆盖或重新播放之前的内容。
            setDisplayed((current) => current + batch);
            setMetrics((current) => ({...current, displayed: current.displayed + Array.from(batch).length}));
        }, TYPING_TICK_MS);
        return () => window.clearInterval(timer);
    }, [typingSpeed]);

    useEffect(() => {
        // 网络恢复或页面重新可见时，如果没有活跃连接则执行断点续传。
        const resume = () => {
            if (
                !document.hidden
                && !doneRef.current
                && messageIdRef.current
                && !connectionRef.current
                && !pausedRef.current
            ) {
                connectRef.current();
            }
        };
        window.addEventListener('online', resume);
        document.addEventListener('visibilitychange', resume);
        return () => {
            window.removeEventListener('online', resume);
            document.removeEventListener('visibilitychange', resume);
        };
    }, []);

    useEffect(() => {
        // 组件生命周期清理，防止页面切换后连接与定时器泄漏。
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            clearConnection();
        };
    }, [clearConnection]);

    // 以下派生值只面向视图，不泄露内部 ref 和连接实现。
    const showTypingCursor = !['idle', 'done', 'failed'].includes(status);
    const enableCodeHighlight = status === 'done';
    const hasMessage = Boolean(messageIdRef.current);
    const configurationLocked = hasMessage && !['done', 'failed'].includes(status);

    return {
        displayed,
        status,
        serverInterval,
        setServerInterval,
        scenario,
        setScenario,
        transport,
        setTransport,
        typingSpeed,
        setTypingSpeed,
        simulateDrop,
        setSimulateDrop,
        paused,
        metrics,
        streamMeta,
        start,
        togglePause,
        showTypingCursor,
        enableCodeHighlight,
        hasMessage,
        configurationLocked,
    };
}

// View 通过该类型获得完整提示，不需要重复声明一份 props 接口。
export type AiTypedStreamViewModel = ReturnType<typeof useAiTypedStream>;
