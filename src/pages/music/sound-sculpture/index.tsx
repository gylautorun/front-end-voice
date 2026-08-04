import {PointerEventHandler, useCallback, useRef, useState} from 'react';
import {
    CaretRightOutlined,
    DeleteOutlined,
    DownloadOutlined,
    PauseOutlined,
    RadarChartOutlined,
    ShareAltOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import {Button, Segmented, Slider, Tooltip} from 'antd';
import {AudioCanvas, CreativeCanvasFrame} from '../creative-shared/audio-canvas';
import labStyle from '../creative-shared/style.module.scss';
import {AudioAnalysisFrame} from '../shared/audio-frame';
import {useMusicAudio} from '../shared/music-audio-context';
import {MusicAudioProvider} from '../shared/music-audio-provider';
import {MusicLabShell} from '../shared/music-lab-shell';
import {
    ConstellationNode,
    createRingSnapshot,
    drawBeatConstellation,
    drawGlitchTape,
    drawTimeRings,
    spawnConstellationNodes,
} from './sculpture-drawers';
import style from './style.module.scss';

/** 声音雕塑页面包含的三种实时视觉模式。 */
type SculptureMode = 'rings' | 'constellation' | 'glitch';

/** 页面底部实时指标。 */
interface SculptureMetrics {
    /** 0-1 平滑后的全频能量。 */
    energy: number;
    /** 0-1 相邻帧变化量，用于表示声音运动幅度。 */
    motion: number;
    /** 当前页面累计检测到的低频节拍数。 */
    beats: number;
}

/** 时间环最大保存数量，限制长期运行的内存使用。 */
const MAX_RING_HISTORY = 120;

/** 时间环、节拍星座和故障磁带页面内容。 */
const SoundSculptureContent = () => {
    const {analyserRef, metadata} = useMusicAudio();
    const [mode, setMode] = useState<SculptureMode>('rings');
    const [intensity, setIntensity] = useState(1);
    const [isFrozen, setIsFrozen] = useState(false);
    const [metrics, setMetrics] = useState<SculptureMetrics>({energy: 0, motion: 0, beats: 0});

    // Canvas 原生引用只用于导出当前作品，不参与 React 渲染。
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    // 冻结状态同时保存在 ref，动画回调可以在同一帧立即读取最新值。
    const frozenRef = useRef(false);
    // 时间环历史按“最新在前”保存，每个元素都是一帧对数频谱。
    const ringHistoryRef = useRef<Uint8Array[]>([]);
    const lastRingCaptureAtRef = useRef(0);
    // 星座节点原地更新，避免每个动画帧触发 React 数组渲染。
    const constellationNodesRef = useRef<ConstellationNode[]>([]);
    const latestAudioRef = useRef<AudioAnalysisFrame | null>(null);
    const spawnSeedRef = useRef(1);
    // 节拍检测使用低频移动平均线和冷却时间，避免一个鼓点被重复计数。
    const bassBaselineRef = useRef(0);
    const lastBeatAtRef = useRef(0);
    const beatCountRef = useRef(0);
    // 动态指标使用相邻帧能量差，并降低 React 文本更新频率。
    const previousEnergyRef = useRef(0);
    const smoothedEnergyRef = useRef(0);
    const smoothedMotionRef = useRef(0);
    const lastMetricEmitAtRef = useRef(0);

    /** 接收共享 Canvas 实例，卸载页面时由共享组件传回 null。 */
    const handleCanvasReady = useCallback((canvas: HTMLCanvasElement | null) => {
        canvasRef.current = canvas;
    }, []);

    /** 切换视觉模式时恢复动画，避免新模式打开后仍停留在旧画面。 */
    const handleModeChange = (value: string | number) => {
        frozenRef.current = false;
        setIsFrozen(false);
        setMode(value as SculptureMode);
    };

    /** 冻结或继续 Canvas，冻结期间保留当前完整像素画面。 */
    const toggleFreeze = () => {
        frozenRef.current = !frozenRef.current;
        setIsFrozen(frozenRef.current);
    };

    /** 清空可积累的数据；故障磁带是实时画面，不需要持久缓存。 */
    const clearSculpture = () => {
        ringHistoryRef.current = [];
        constellationNodesRef.current = [];
        beatCountRef.current = 0;
        setMetrics(current => ({...current, beats: 0}));
        // 冻结时动画循环不会重绘，因此直接清除原生像素缓冲区。
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (canvas && context && frozenRef.current) {
            context.save();
            context.setTransform(1, 0, 0, 1, 0, 0);
            context.fillStyle = '#050809';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.restore();
        }
    };

    /** 将当前高 DPI Canvas 内容导出成透明度安全的 PNG 文件。 */
    const exportSculpture = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.toBlob(blob => {
            if (!blob) return;
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const trackName = metadata?.name.replace(/\.[^.]+$/, '').replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
                || 'sound-sculpture';
            link.href = objectUrl;
            link.download = `${trackName}-${mode}.png`;
            link.click();
            // 等浏览器接收下载任务后再释放临时地址，兼容异步读取链接的实现。
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
        }, 'image/png');
    };

    /** 点击星座画布时，从点击位置主动生成一组低、中、高频节点。 */
    const handleCanvasPointerDown: PointerEventHandler<HTMLCanvasElement> = event => {
        if (mode !== 'constellation' || !latestAudioRef.current) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const origin = {
            x: (event.clientX - bounds.left) / Math.max(1, bounds.width),
            y: (event.clientY - bounds.top) / Math.max(1, bounds.height),
        };
        spawnSeedRef.current += 101;
        spawnConstellationNodes(
            constellationNodesRef.current,
            latestAudioRef.current,
            Math.round(8 + intensity * 5),
            spawnSeedRef.current,
            intensity,
            origin,
        );
    };

    /** 每帧检测节拍、更新指标，并调用当前模式对应的独立绘制函数。 */
    const draw = (frame: CreativeCanvasFrame) => {
        // 冻结后不清除 Canvas，浏览器会持续显示冻结瞬间的完整作品。
        if (frozenRef.current) return;
        const {audio, context, delta, height, timestamp, width} = frame;
        latestAudioRef.current = audio;

        // 第一步：更新能量、运动幅度和低频基准线。
        const energyDifference = Math.abs(audio.energy.overall - previousEnergyRef.current);
        previousEnergyRef.current = audio.energy.overall;
        smoothedEnergyRef.current += (audio.energy.overall - smoothedEnergyRef.current) * 0.12;
        smoothedMotionRef.current += (energyDifference - smoothedMotionRef.current) * 0.18;
        bassBaselineRef.current += (audio.energy.bass - bassBaselineRef.current) * 0.035;

        // 第二步：超过移动平均线且通过 150ms 冷却时间时，认定出现新的低频节拍。
        const hasBeat = audio.energy.bass > 0.1
            && audio.energy.bass > bassBaselineRef.current * 1.34 + 0.025
            && timestamp - lastBeatAtRef.current > 150;
        if (hasBeat) {
            lastBeatAtRef.current = timestamp;
            beatCountRef.current += 1;
            if (mode === 'constellation') {
                spawnSeedRef.current += 37;
                spawnConstellationNodes(
                    constellationNodesRef.current,
                    audio,
                    Math.round(3 + intensity * 4),
                    spawnSeedRef.current,
                    intensity,
                );
            }
        }

        // 第三步：指标最多每 240ms 进入一次 React，Canvas 仍维持完整刷新率。
        if (timestamp - lastMetricEmitAtRef.current >= 240) {
            setMetrics({
                energy: smoothedEnergyRef.current,
                motion: Math.min(1, smoothedMotionRef.current * 8),
                beats: beatCountRef.current,
            });
            lastMetricEmitAtRef.current = timestamp;
        }

        // 第四步：每个模式从相同音频帧开始，使用独立背景和绘制算法。
        context.clearRect(0, 0, width, height);
        context.fillStyle = mode === 'glitch' ? '#08080d' : '#050809';
        context.fillRect(0, 0, width, height);

        if (mode === 'rings') {
            // 每 72ms 保存一次历史，形成从中心向外推进、互不粘连的时间环。
            if (timestamp - lastRingCaptureAtRef.current >= 72) {
                ringHistoryRef.current.unshift(createRingSnapshot(audio));
                ringHistoryRef.current.length = Math.min(ringHistoryRef.current.length, MAX_RING_HISTORY);
                lastRingCaptureAtRef.current = timestamp;
            }
            drawTimeRings(context, width, height, ringHistoryRef.current, audio, intensity);
            return;
        }

        if (mode === 'constellation') {
            drawBeatConstellation(
                context,
                width,
                height,
                constellationNodesRef.current,
                audio,
                delta,
                intensity,
            );
            return;
        }

        drawGlitchTape(context, width, height, audio, timestamp, intensity);
    };

    const modeControl = (
        <>
            <Segmented
                value={mode}
                options={[
                    {label: <span><RadarChartOutlined /> 时间环</span>, value: 'rings'},
                    {label: <span><ShareAltOutlined /> 节拍星座</span>, value: 'constellation'},
                    {label: <span><ThunderboltOutlined /> 故障磁带</span>, value: 'glitch'},
                ]}
                onChange={handleModeChange}
            />
            <label className={style['intensity-control']}>
                <span>强度</span>
                <Slider
                    aria-label="视觉响应强度"
                    min={0.5}
                    max={1.8}
                    step={0.05}
                    value={intensity}
                    tooltip={{formatter: value => `${Math.round((value || 0) * 100)}%`}}
                    onChange={setIntensity}
                />
            </label>
            <Tooltip title={isFrozen ? '继续生成' : '冻结当前画面'}>
                <Button
                    shape="circle"
                    aria-label={isFrozen ? '继续生成' : '冻结当前画面'}
                    icon={isFrozen ? <CaretRightOutlined /> : <PauseOutlined />}
                    onClick={toggleFreeze}
                />
            </Tooltip>
            <Tooltip title="清空积累图形">
                <Button
                    shape="circle"
                    aria-label="清空积累图形"
                    disabled={mode === 'glitch'}
                    icon={<DeleteOutlined />}
                    onClick={clearSculpture}
                />
            </Tooltip>
            <Tooltip title="导出当前作品">
                <Button
                    shape="circle"
                    aria-label="导出当前作品"
                    icon={<DownloadOutlined />}
                    onClick={exportSculpture}
                />
            </Tooltip>
        </>
    );

    return (
        <MusicLabShell eyebrow="AUDIO SCULPTURE" title="声音雕塑实验室" modeControl={modeControl}>
            <div className={labStyle.stage}>
                <AudioCanvas
                    analyserRef={analyserRef}
                    label="时间环、节拍星座和故障磁带音乐可视化"
                    onCanvasReady={handleCanvasReady}
                    onDraw={draw}
                    onPointerDown={handleCanvasPointerDown}
                />
                <div className={labStyle['stage-label']}>
                    <i />
                    {isFrozen
                        ? 'SCULPTURE FROZEN'
                        : mode === 'rings'
                            ? 'CHRONO RINGS'
                            : mode === 'constellation'
                                ? 'BEAT CONSTELLATION'
                                : 'GLITCH TAPE'}
                </div>
                <div className={labStyle.metrics}>
                    <div className={labStyle.metric}><span>能量</span><strong>{Math.round(metrics.energy * 100)}</strong></div>
                    <div className={labStyle.metric}><span>动态</span><strong>{Math.round(metrics.motion * 100)}</strong></div>
                    <div className={labStyle.metric}><span>节拍</span><strong>{metrics.beats}</strong></div>
                </div>
            </div>
        </MusicLabShell>
    );
};

/** 为声音雕塑页面提供独立音频播放和分析上下文。 */
export default function SoundSculpturePage() {
    return <MusicAudioProvider><SoundSculptureContent /></MusicAudioProvider>;
}
