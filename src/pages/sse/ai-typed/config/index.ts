import type {StreamScenario, StreamStatus, StreamTransport} from './types';

/** 页面右上角展示的连接状态文案。 */
export const statusText: Record<StreamStatus, string> = {
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
export const MAX_RETRIES = 5;
// 打字机默认每秒显示 50 个 Unicode 字符。
export const DEFAULT_TYPING_SPEED = 50;
// 速度滑块允许的最慢速度，单位为字符/秒。
export const MIN_TYPING_SPEED = 10;
// 速度滑块允许的最快速度，单位为字符/秒。
export const MAX_TYPING_SPEED = 500;
// 用户每次拖动或按方向键调整 2 字符/秒。
export const TYPING_SPEED_STEP = 2;
// 缓冲区每 50ms 消费一次，最多每秒触发 20 次正文渲染。
export const TYPING_TICK_MS = 50;
// 后台恢复后超过该字符数时直接追平，避免长时间补播积压动画。
export const BACKLOG_SNAPSHOT_THRESHOLD = 2000;
// 连接后 15 秒没有收到业务分片则尝试恢复；heartbeat 不算业务首包。
export const FIRST_CHUNK_TIMEOUT_MS = 15 * 1000;
// 12 秒没有收到正文或 heartbeat，判定当前连接空闲。
export const STREAM_IDLE_TIMEOUT_MS = 12 * 1000;
// 单次回答最多持续 2 分钟，防止异常连接永久占用资源。
export const TOTAL_STREAM_TIMEOUT_MS = 2 * 60 * 1000;

// 与 Node 场景发现接口对应，用于直接切换不同类型的模拟回答。
export const streamScenarios: Array<{value: StreamScenario; label: string}> = [
    {value: 'comprehensive', label: '综合 Markdown'},
    {value: 'formats', label: 'Markdown 全格式'},
    {value: 'long', label: '长文本积压'},
    {value: 'unicode', label: 'Unicode 边界'},
    {value: 'security', label: '安全清洗'},
];

// 原生模式和插件模式并存，方便对比连接行为；业务分片协议保持一致。
export const transportOptions: Array<{label: string; value: StreamTransport}> = [
    {label: '原生 EventSource', value: 'native'},
    {label: '插件 fetch SSE', value: 'plugin'},
];
