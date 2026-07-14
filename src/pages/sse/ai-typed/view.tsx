import {
    DisconnectOutlined,
    PauseOutlined,
    PlayCircleOutlined,
    ReloadOutlined,
    WifiOutlined,
} from '@ant-design/icons';
import {Segmented} from 'antd';
import {
    MAX_TYPING_SPEED,
    MIN_TYPING_SPEED,
    statusText,
    streamScenarios,
    transportOptions,
    TYPING_SPEED_STEP,
} from './config';
import {StreamMarkdown} from './stream-markdown';
import style from './style.module.scss';
import type {StreamScenario, StreamTransport} from './config/types';
import type {AiTypedStreamViewModel} from './hooks/use-ai-typed-stream';

interface AiTypedSseViewProps {
    // model 是 Hook 暴露的纯视图状态与命令，不包含底层连接实例。
    model: AiTypedStreamViewModel;
}

/** AI 打字机页面视图；这里只处理展示和用户输入映射。 */
export function AiTypedSseView({model}: AiTypedSseViewProps) {
    const {
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
    } = model;

    return (
        <main className={style.aiTypedPage}>
            <header className={style.header}>
                <div>
                    <p className={style.eyebrow}>SSE STREAM LAB</p>
                    <h1>AI 流式打字机</h1>
                    <p>序号校验、断点续传与自适应缓冲，让弱网输出保持连续。</p>
                </div>
                <div className={style.headerControls}>
                    <Segmented
                        size="large"
                        options={transportOptions}
                        value={transport}
                        disabled={configurationLocked}
                        onChange={(value) => setTransport(value as StreamTransport)}
                    />
                    <div className={`${style.status} ${style[status]}`}>
                        {status === 'failed' || status === 'reconnecting' ? <DisconnectOutlined /> : <WifiOutlined />}
                        {statusText[status]}
                    </div>
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
                    <button
                        type="button"
                        className={style.secondary}
                        onClick={togglePause}
                        disabled={!hasMessage || status === 'done'}
                    >
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
                        <span>{streamMeta?.transport === 'better-sse' ? 'better-sse' : '原生 SSE'}</span>
                        {streamMeta && <span>连接 #{streamMeta.connection}</span>}
                        <span>收到 {metrics.received}{streamMeta ? `/${streamMeta.totalCharacters}` : ''}</span>
                        <span>显示 {metrics.displayed}</span>
                        <span>SEQ {metrics.lastSeq}{streamMeta ? `/${streamMeta.totalChunks}` : ''}</span>
                    </div>
                </div>
                <StreamMarkdown
                    displayed={displayed}
                    showTypingCursor={showTypingCursor}
                    enableCodeHighlight={enableCodeHighlight}
                />
            </section>
        </main>
    );
}
