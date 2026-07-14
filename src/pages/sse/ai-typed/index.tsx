import {useCallback, useEffect, useRef, useState} from 'react';
import ReactMarkdown from 'react-markdown';
import type {Components, ExtraProps} from 'react-markdown';
import type {ComponentPropsWithoutRef} from 'react';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import {
    PauseOutlined,
    PlayCircleOutlined,
    ReloadOutlined,
    WifiOutlined,
    DisconnectOutlined,
} from '@ant-design/icons';
import style from './style.module.scss';

// 流式任务状态机：只更新提示状态，不会因重连清空已经显示的正文。
type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'reconnecting' | 'stalled' | 'done' | 'failed';

/** 服务端每次通过 SSE data 字段发送的业务分片。 */
interface StreamChunk {
    // 事件类型：普通增量或流结束事件。
    type?: 'delta' | 'done';
    // 一次回答的唯一标识，用于避免不同回答之间串流。
    messageId: string;
    // 本次回答使用的服务端模拟场景。
    scenario?: StreamScenario;
    // 从 1 开始连续递增的分片序号，用于去重、断层检测和续传。
    seq: number;
    // 本次新增的 Markdown 文本，只能追加，不能覆盖已有内容。
    delta: string;
    // 表示服务端已经发送完这次回答；正文缓冲区可能仍未消费完。
    done?: boolean;
    // 服务端实际写出该分片的 ISO 时间。
    sentAt?: string;
    // 首包和结束包携带的流级验证元数据。
    meta?: StreamMeta;
    // done 事件的结束原因。
    finishReason?: 'stop';
}

/** 服务端支持的场景类型 */
type StreamScenario = 'comprehensive' | 'formats' | 'long' | 'unicode' | 'security';

interface StreamMeta {
    // 服务端实际采用的场景 ID。
    scenario: StreamScenario;
    // 场景的中文展示名称。
    scenarioLabel: string;
    // 完整回答的 SHA-256，用于确认重连前后内容没有重新生成。
    contentHash: string;
    // 完整回答包含的 Unicode 字符数。
    totalCharacters: number;
    // 包含 done 在内的总分片数。
    totalChunks: number;
    // 该 messageId 会话的创建时间。
    createdAt: string;
    // 当前是该会话的第几次连接。
    connection: number;
    // 当前连接从哪个 lastSeq 之后恢复。
    resumedFrom: number;
}

/** rehype 处理过程中使用的最小语法树结构。 */
interface HastNode {
    // 节点类型，例如 root、element 或 text。
    type: string;
    // 当前节点包含的子节点；文本节点没有 children。
    children?: HastNode[];
    // element 节点对应的 HTML 标签名。
    tagName?: string;
    // element 节点的 className、aria 属性等 HTML 属性。
    properties?: Record<string, unknown>;
    // text 节点保存的实际字符串。
    value?: string;
}

interface GraphemeSegment {
    segment: string;
    index: number;
}

interface SegmenterLike {
    segment: (input: string) => Iterable<GraphemeSegment>;
}

type SegmenterConstructor = new (
    locales?: string | string[],
    options?: {granularity: 'grapheme'},
) => SegmenterLike;

/** 将字符串拆成带 UTF-16 起始位置的完整字素，旧浏览器回退到 Unicode code point。 */
function segmentGraphemes(value: string): GraphemeSegment[] {
    const Segmenter = (Intl as unknown as {Segmenter?: SegmenterConstructor}).Segmenter;
    if (Segmenter) {
        return Array.from(new Segmenter(undefined, {granularity: 'grapheme'}).segment(value));
    }

    let index = 0;
    return Array.from(value).map((segment) => {
        const current = {segment, index};
        index += segment.length;
        return current;
    });
}

/** 找到最后一个非空白字素，并保留它前后的原始文本。 */
function splitLastVisibleGrapheme(value: string) {
    const segments = segmentGraphemes(value);
    for (let index = segments.length - 1; index >= 0; index -= 1) {
        const current = segments[index];
        if (current.segment.trim()) {
            const end = current.index + current.segment.length;
            return {
                before: value.slice(0, current.index),
                grapheme: current.segment,
                trailing: value.slice(end),
            };
        }
    }
    return null;
}

/**
 * 从语法树末尾反向查找最后一个可见字素，跳过块之间的换行文本。
 * 最后一个字素与光标放进同一个不可拆分内联节点，防止光标单独换行。
 */
function insertCursorAfterLastText(node: HastNode): boolean {
    if (!node.children) return false;

    for (let index = node.children.length - 1; index >= 0; index -= 1) {
        const child = node.children[index];
        const textParts = child.type === 'text' && child.value
            ? splitLastVisibleGrapheme(child.value)
            : null;

        if (textParts) {
            const replacement: HastNode[] = [];
            if (textParts.before) {
                replacement.push({type: 'text', value: textParts.before});
            }
            replacement.push({
                type: 'element',
                tagName: 'span',
                properties: {className: [style.cursorAnchor]},
                children: [
                    // 保留完整字素，避免在组合字符或 ZWJ emoji 内部插入 DOM 节点。
                    {type: 'text', value: textParts.grapheme},
                    {
                        type: 'element',
                        tagName: 'span',
                        properties: {className: [style.cursor]},
                        children: [],
                    },
                ],
            });
            if (textParts.trailing) {
                replacement.push({type: 'text', value: textParts.trailing});
            }
            node.children.splice(index, 1, ...replacement);
            return true;
        }
        if (insertCursorAfterLastText(child)) return true;
    }

    return false;
}

/** 在 Markdown 已完成安全清洗后追加内联打字机光标。 */
function rehypeTypingCursor() {
    return (tree: HastNode): void => {
        // transformer 只原地修改语法树；不能返回 boolean，否则 unified 会把它当成新语法树。
        insertCursorAfterLastText(tree);
    };
}

type MarkdownLinkProps = ComponentPropsWithoutRef<'a'> & ExtraProps;

/** 外部 HTTP(S) 链接在新标签页打开，站内相对路径和锚点保持当前页导航。 */
function MarkdownLink({node: _node, href = '', children, ...props}: MarkdownLinkProps) {
    const isExternal = /^(?:https?:)?\/\//i.test(href);

    return (
        <a
            {...props}
            href={href}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noopener noreferrer' : undefined}
        >
            {children}
        </a>
    );
}

// 对象定义在组件外，避免打字机每次渲染都创建新的组件映射。
const markdownComponents: Components = {
    a: MarkdownLink,
};

/** 页面右上角展示的连接状态文案。 */
const statusText: Record<StreamStatus, string> = {
    // 尚未开始，或被用户主动暂停。
    idle: '等待开始',
    // 首次请求尚未成功建立连接。
    connecting: '正在连接',
    // 连接正常，正在持续接收服务端分片。
    streaming: '正在生成',
    // 连接异常，正在按退避策略恢复。
    reconnecting: '网络中断，正在恢复',
    // 超过空闲阈值没有收到正文或心跳。
    stalled: '连接较慢，仍在等待',
    // 服务端已结束且前端缓冲区已经显示完毕。
    done: '生成完成',
    // 自动重试达到上限，需要用户重新发起。
    failed: '恢复失败',
};

// 一次回答最多自动恢复 5 次，避免服务异常时无限重连。
const MAX_RETRIES = 5;
// 打字机默认每秒显示 36 个 Unicode 字符。
const DEFAULT_TYPING_SPEED = 50;
// 速度滑块允许的最慢速度，单位为字符/秒。
const MIN_TYPING_SPEED = 10;
// 速度滑块允许的最快速度，单位为字符/秒。
const MAX_TYPING_SPEED = 500;
// 用户每次拖动或按方向键调整 2 字符/秒。
const TYPING_SPEED_STEP = 2;
// 缓冲区每 50ms 消费一次，最多每秒触发 20 次正文渲染。
const TYPING_TICK_MS = 50;
// 后台恢复后超过该字符数时直接追平，避免长时间补播积压动画。
const BACKLOG_SNAPSHOT_THRESHOLD = 2000;
// 连接后 15 秒没有收到业务分片则尝试恢复；heartbeat 不算业务首包。
const FIRST_CHUNK_TIMEOUT_MS = 15 * 1000;
// 12 秒没有收到正文或 heartbeat，判定当前连接空闲。
const STREAM_IDLE_TIMEOUT_MS = 12 * 1000;
// 单次回答最多持续 2 分钟，防止异常连接永久占用资源。
const TOTAL_STREAM_TIMEOUT_MS = 2 * 60 * 1000;

// 与 Node 场景发现接口对应，用于直接切换不同类型的模拟回答。
const streamScenarios: Array<{value: StreamScenario; label: string}> = [
    {value: 'comprehensive', label: '综合 Markdown'},
    {value: 'formats', label: 'Markdown 全格式'},
    {value: 'long', label: '长文本积压'},
    {value: 'unicode', label: 'Unicode 边界'},
    {value: 'security', label: '安全清洗'},
];

export default function AiTypedSse() {
    // displayed：已经交给 ReactMarkdown 渲染的文本。
    const [displayed, setDisplayed] = useState('');
    // status：当前连接和生成状态，仅用于 UI 提示。
    const [status, setStatus] = useState<StreamStatus>('idle');
    // serverInterval：模拟服务端发送相邻分片的时间间隔。
    const [serverInterval, setServerInterval] = useState(90);
    // scenario：选择 Node 服务端生成的模拟回答类型。
    const [scenario, setScenario] = useState<StreamScenario>('comprehensive');
    // typingSpeed：打字机每秒追加到 displayed 的目标字符数。
    const [typingSpeed, setTypingSpeed] = useState(DEFAULT_TYPING_SPEED);
    // simulateDrop：是否让首次连接在发送指定数量分片后主动断开。
    const [simulateDrop, setSimulateDrop] = useState(true);
    // paused：控制按钮的响应式状态；实际定时器判断使用 pausedRef。
    const [paused, setPaused] = useState(false);
    // metrics：展示接收字符数、已渲染字符数和最后确认的分片序号。
    const [metrics, setMetrics] = useState({received: 0, displayed: 0, lastSeq: 0});
    // streamMeta：首包返回的内容哈希、总字符数、总分片数和连接信息。
    const [streamMeta, setStreamMeta] = useState<StreamMeta | null>(null);

    // 当前 EventSource 实例。保存到 ref 可在错误、暂停或卸载时立即关闭。
    const sourceRef = useRef<EventSource | null>(null);
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

    /** 统一释放连接和相关定时器，保留正文及续传位置。 */
    const clearConnection = useCallback(() => {
        sourceRef.current?.close();
        sourceRef.current = null;
        window.clearTimeout(retryTimerRef.current);
        window.clearTimeout(idleTimerRef.current);
        window.clearTimeout(firstChunkTimerRef.current);
        window.clearTimeout(totalTimerRef.current);
    }, []);

    // 间接保存最新版 connect，解决重连回调之间的循环依赖和陈旧闭包问题。
    const connectRef = useRef<() => void>(() => undefined);

    /** 按指数退避安排下一次断点续传。 */
    const scheduleReconnect = useCallback(() => {
        // 已卸载、已完成或用户暂停时，不允许自动重连。
        if (!mountedRef.current || doneRef.current || pausedRef.current) return;
        sourceRef.current?.close();
        sourceRef.current = null;
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
    }, []);

    /** 重置 12 秒流空闲超时；心跳也视为连接仍然存活。 */
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
            sourceRef.current?.close();
            sourceRef.current = null;
            setStatus('failed');
        }, TOTAL_STREAM_TIMEOUT_MS);
    }, []);

    /** 创建 SSE 连接，并从 lastSeq 后的第一条分片开始接收。 */
    const connect = useCallback(() => {
        if (!messageIdRef.current || doneRef.current || pausedRef.current) return;
        sourceRef.current?.close();
        setStatus(lastSeqRef.current ? 'reconnecting' : 'connecting');

        const params = new URLSearchParams({
            // 服务端据此复用同一份回答缓存，而不是重新生成答案。
            messageId: messageIdRef.current,
            // 显式传递断点，比只依赖浏览器的 Last-Event-ID 更容易控制。
            lastSeq: String(lastSeqRef.current),
            // 演示用发送速度。
            intervalMs: String(serverInterval),
            // 请求指定的模拟回答类型；同一 messageId 重连时服务端仍复用首次场景。
            scenario,
            // 仅首次连接发送到第 12 个分片时模拟断流。
            disconnectAt: simulateDrop ? '12' : '0',
        });
        const source = new EventSource(`/api/sse-ai-typed/stream?${params}`);
        sourceRef.current = source;
        armIdleTimeout();
        // heartbeat 只能证明连接存活，不能代替首个业务分片。
        window.clearTimeout(firstChunkTimerRef.current);
        firstChunkTimerRef.current = window.setTimeout(() => {
            if (sourceRef.current === source && !doneRef.current) {
                setStatus('stalled');
                scheduleReconnect();
            }
        }, FIRST_CHUNK_TIMEOUT_MS);

        source.onopen = () => {
            // 忽略已经被新连接替换的旧 EventSource 回调。
            if (sourceRef.current !== source) return;
            retryRef.current = 0;
            setStatus('streaming');
            armIdleTimeout();
        };

        // 心跳没有正文，只负责证明链路仍然存活。
        source.addEventListener('heartbeat', armIdleTimeout);
        source.onmessage = (event) => {
            if (sourceRef.current !== source) return;
            // 收到任何合法格式的业务事件后，首包等待结束。
            window.clearTimeout(firstChunkTimerRef.current);
            armIdleTimeout();

            let chunk: StreamChunk;
            try {
                chunk = JSON.parse(event.data) as StreamChunk;
            } catch {
                // 数据格式异常时保留当前内容，从最后合法 seq 重新拉取。
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
            if (chunk.meta) {
                // 首包和 done 都可能携带 meta，使用最新连接信息覆盖展示。
                setStreamMeta(chunk.meta);
            }
            if (chunk.delta) {
                // 网络接收只写 received 和 pending，不直接触发正文逐分片渲染。
                receivedRef.current += chunk.delta;
                // Array.from 按 Unicode 字符拆分，避免普通 emoji 被拆成半个代理项。
                pendingRef.current.push(...Array.from(chunk.delta));
            }
            setMetrics((current) => ({
                ...current,
                received: Array.from(receivedRef.current).length,
                lastSeq: chunk.seq,
            }));

            if (chunk.done) {
                // 仅关闭网络；pending 会继续消费，清空后状态才变为 done。
                doneRef.current = true;
                source.close();
                sourceRef.current = null;
                window.clearTimeout(idleTimerRef.current);
                window.clearTimeout(totalTimerRef.current);
            }
        };

        source.onerror = () => {
            if (sourceRef.current === source && !doneRef.current) scheduleReconnect();
        };
    }, [armIdleTimeout, scenario, scheduleReconnect, serverInterval, simulateDrop]);
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
            // 网络缓冲不足时只消费已有字符，不能读取数组范围之外的数据。
            count = Math.min(count, pending.length);
            // 扣除本帧实际使用的消费额度。
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
            if (!document.hidden && !doneRef.current && messageIdRef.current && !sourceRef.current && !pausedRef.current) {
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

    // 仅在连接或生成过程中显示光标，空闲、完成和失败状态隐藏光标。
    const showTypingCursor = !['idle', 'done', 'failed'].includes(status);
    // pending 消费完并进入 done 后才执行完整语法高亮，避免打字阶段反复分析代码。
    const enableCodeHighlight = status === 'done';
    // 新回答开始后（包括暂停状态）锁定服务端参数，完成或失败后才允许调整。
    const configurationLocked = Boolean(messageIdRef.current) && !['done', 'failed'].includes(status);

    return (
        <main className={style.page}>
            <header className={style.header}>
                <div>
                    <p className={style.eyebrow}>SSE STREAM LAB</p>
                    <h1>AI 流式打字机</h1>
                    <p>序号校验、断点续传与自适应缓冲，让弱网输出保持连续。</p>
                </div>
                <div className={`${style.status} ${style[status]}`}>
                    {status === 'failed' || status === 'reconnecting' ? <DisconnectOutlined /> : <WifiOutlined />}
                    {statusText[status]}
                </div>
            </header>

            <section className={style.toolbar} aria-label="流式控制">
                <label className={style.selectControl}>
                    模拟内容
                    <select
                        value={scenario}
                        disabled={configurationLocked}
                        onChange={(event) => setScenario(event.target.value as StreamScenario)}
                    >
                        {streamScenarios.map((item) => (
                            <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                    </select>
                </label>
                <label className={style.rangeControl}>
                    服务端分片间隔
                    <span>{serverInterval} ms</span>
                    <input
                        type="range"
                        min="30"
                        max="400"
                        step="10"
                        value={serverInterval}
                        disabled={configurationLocked}
                        onChange={(event) => setServerInterval(Number(event.target.value))}
                    />
                </label>
                <label className={style.rangeControl}>
                    打字机速度
                    <span>{typingSpeed} 字符/秒</span>
                    {/* min/max 限制速度范围，step 控制滑块每次调整的粒度。 */}
                    <input
                        type="range"
                        min={MIN_TYPING_SPEED}
                        max={MAX_TYPING_SPEED}
                        step={TYPING_SPEED_STEP}
                        // value 由 React state 控制，拖动时可以实时改变当前打字速度。
                        value={typingSpeed}
                        onChange={(event) => setTypingSpeed(Number(event.target.value))}
                    />
                </label>
                <label className={style.switchLabel}>
                    <input
                        type="checkbox"
                        checked={simulateDrop}
                        disabled={configurationLocked}
                        onChange={(event) => setSimulateDrop(event.target.checked)}
                    />
                    <span className={style.switch} />
                    首次连接模拟断流
                </label>
                <div className={style.actions}>
                    <button type="button" onClick={start} title="开始新的流式回答">
                        {displayed ? <ReloadOutlined /> : <PlayCircleOutlined />}
                        {displayed ? '重新生成' : '开始生成'}
                    </button>
                    <button type="button" className={style.secondary} onClick={togglePause} disabled={!messageIdRef.current || status === 'done'}>
                        {paused ? <PlayCircleOutlined /> : <PauseOutlined />}
                        {paused ? '继续' : '暂停'}
                    </button>
                </div>
            </section>

            <section className={style.streamPanel}>
                <div className={style.panelTop}>
                    <span>模型回答</span>
                    <div className={style.metrics}>
                        {streamMeta && <span>{streamMeta.scenarioLabel}</span>}
                        {streamMeta && <span>连接 #{streamMeta.connection}</span>}
                        <span>收到 {metrics.received}{streamMeta ? `/${streamMeta.totalCharacters}` : ''}</span>
                        <span>显示 {metrics.displayed}</span>
                        <span>SEQ {metrics.lastSeq}{streamMeta ? `/${streamMeta.totalChunks}` : ''}</span>
                    </div>
                </div>
                <article className={style.markdown} aria-live="polite">
                    {displayed ? (
                        // GFM 支持表格等扩展语法，sanitize 防止流内容注入危险 HTML。
                        <ReactMarkdown
                            components={markdownComponents}
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[
                                // 第一步清洗服务端 Markdown 生成的 HTML，过滤危险属性和标签。
                                rehypeSanitize,
                                // 第二步仅在生成完成后高亮带语言标记的围栏代码块。
                                ...(enableCodeHighlight ? [rehypeHighlight] : []),
                                // 第三步在清洗后的最后一个文本节点中插入光标，避免被 sanitize 删除。
                                ...(showTypingCursor ? [rehypeTypingCursor] : []),
                            ]}
                        >
                            {displayed}
                        </ReactMarkdown>
                    ) : (
                        <p className={style.placeholder}>
                            点击“开始生成”查看 Markdown 流式拼接效果
                            {/* 句号与光标共用锚点，避免连接首包到达前光标单独换行。 */}
                            <span className={showTypingCursor ? style.cursorAnchor : undefined}>
                                。{showTypingCursor && <span className={style.cursor} aria-hidden="true" />}
                            </span>
                        </p>
                    )}
                </article>
            </section>
        </main>
    );
}
