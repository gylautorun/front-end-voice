import {useRef, useState} from 'react';
import {BarChartOutlined, DashboardOutlined, HeatMapOutlined} from '@ant-design/icons';
import {Segmented} from 'antd';
import {AudioCanvas, CreativeCanvasFrame} from '../creative-shared/audio-canvas';
import {getSpectralCentroid} from '../creative-shared/music-math';
import labStyle from '../creative-shared/style.module.scss';
import {sampleLogFrequency} from '../shared/audio-frame';
import {useMusicAudio} from '../shared/music-audio-context';
import {MusicAudioProvider} from '../shared/music-audio-provider';
import {MusicLabShell} from '../shared/music-lab-shell';
import style from './style.module.scss';

/** 音乐分析路由的三种视图。 */
type AnalysisMode = 'spectrogram' | 'structure' | 'wrapped';

/** Wrapped 视图展示的累计特征。 */
interface TrackStatistics {
    averageEnergy: number;
    brightness: number;
    peakEnergy: number;
}

/** 结构时间轴使用的固定分析分区。 */
const STRUCTURE_SEGMENTS = [
    {label: 'INTRO', ratio: 0.09, color: '#4f7cff'},
    {label: 'VERSE', ratio: 0.22, color: '#35c995'},
    {label: 'CHORUS', ratio: 0.18, color: '#ef476f'},
    {label: 'VERSE', ratio: 0.19, color: '#35c995'},
    {label: 'BRIDGE', ratio: 0.13, color: '#b088ff'},
    {label: 'CHORUS', ratio: 0.19, color: '#ef476f'},
] as const;

/** 声纹每隔多少毫秒保存一条新的频谱切片。 */
const SPECTROGRAM_SAMPLE_INTERVAL = 50;
/** 相邻时间切片的纵向距离，包含色块和间隔。 */
const SPECTROGRAM_ROW_PITCH = 5;
/** 单条时间切片实际绘制高度，余下空间形成清晰分隔线。 */
const SPECTROGRAM_ROW_HEIGHT = 3.25;
/** 低于该值的底噪不绘制，防止安静区域糊成连续底色。 */
const SPECTROGRAM_NOISE_FLOOR = 0.08;
/** 声纹底部展示的对数频率刻度。 */
const SPECTROGRAM_FREQUENCY_TICKS = [20, 60, 250, 1000, 4000, 10000, 20000] as const;

/**
 * 把原始频率强度变成更容易辨认的声纹强度。
 *
 * @param rawLevel AnalyserNode 输出的 0-1 原始频率强度。
 * @returns 去除底噪并增强峰值对比后的 0-1 强度。
 */
const normalizeSpectrogramLevel = (rawLevel: number) => {
    // 第一步：减去底噪；弱于门限的信号直接归零。
    const gatedLevel = Math.max(0, rawLevel - SPECTROGRAM_NOISE_FLOOR)
        / (1 - SPECTROGRAM_NOISE_FLOOR);
    // 第二步：用幂函数压低残余弱信号，让有效声音和背景明确分开。
    return Math.pow(gatedLevel, 1.45);
};

/**
 * 根据归一化能量选择离散高对比色，避免连续 HSL 渐变糊成色带。
 *
 * @param level 已去除底噪的 0-1 声纹强度。
 * @returns Canvas 可以直接使用的十六进制颜色。
 */
const getSpectrogramColor = (level: number) => {
    if (level < 0.1) return '#173a9c';
    if (level < 0.24) return '#0878f9';
    if (level < 0.4) return '#00c6d7';
    if (level < 0.57) return '#32d36b';
    if (level < 0.73) return '#f3d52c';
    if (level < 0.88) return '#ff6b1c';
    return '#fff4df';
};

/**
 * 计算频率在对数横轴上的相对位置。
 *
 * @param frequency 需要定位的 Hz 值。
 * @param maximumFrequency 当前音频能够分析的最高频率。
 */
const getLogFrequencyProgress = (frequency: number, maximumFrequency: number) => {
    const minimumFrequency = 20;
    const safeFrequency = Math.min(maximumFrequency, Math.max(minimumFrequency, frequency));
    return Math.log(safeFrequency / minimumFrequency) / Math.log(maximumFrequency / minimumFrequency);
};

/** 把频率刻度转换成紧凑标签。 */
const formatFrequency = (frequency: number) => frequency >= 1000
    ? `${frequency / 1000}kHz`
    : `${frequency}Hz`;

/** 频谱瀑布、歌曲结构和音乐报告页面。 */
const AnalysisStudioContent = () => {
    const {analyserRef, currentTime, duration, metadata} = useMusicAudio();
    const [mode, setMode] = useState<AnalysisMode>('spectrogram');
    const [statistics, setStatistics] = useState<TrackStatistics>({averageEnergy: 0, brightness: 0, peakEnergy: 0});
    const historyRef = useRef<Uint8Array[]>([]);
    const historyColumnCountRef = useRef(0);
    const lastHistoryAtRef = useRef(0);
    const sampleCountRef = useRef(0);
    const energyTotalRef = useRef(0);
    const peakRef = useRef(0);
    const brightnessRef = useRef(0);
    const lastStatisticsAtRef = useRef(0);

    /** 每帧更新累计特征，并绘制当前分析模式。 */
    const draw = ({audio, context, height, timestamp, width}: CreativeCanvasFrame) => {
        const brightness = getSpectralCentroid(audio);
        sampleCountRef.current += 1;
        energyTotalRef.current += audio.energy.overall;
        peakRef.current = Math.max(peakRef.current, audio.energy.overall);
        brightnessRef.current += brightness;
        // React 指标最多每 500ms 更新一次，避免干扰 Canvas 帧率。
        if (timestamp - lastStatisticsAtRef.current > 500) {
            const count = Math.max(1, sampleCountRef.current);
            setStatistics({
                averageEnergy: energyTotalRef.current / count,
                brightness: brightnessRef.current / count,
                peakEnergy: peakRef.current,
            });
            lastStatisticsAtRef.current = timestamp;
        }

        context.clearRect(0, 0, width, height);
        context.fillStyle = '#050809';
        context.fillRect(0, 0, width, height);

        if (mode === 'spectrogram') {
            // 为最新切片、频率刻度和四周留白，图形不会贴住画布边缘。
            const chartLeft = 18;
            const chartRight = 18;
            const chartTop = 52;
            const chartBottom = 30;
            const chartWidth = Math.max(1, width - chartLeft - chartRight);
            const chartHeight = Math.max(1, height - chartTop - chartBottom);
            // 每格约 8px；列数受限后，小屏和宽屏都能保留清楚的频率间隔。
            const columnCount = Math.max(48, Math.min(160, Math.floor(chartWidth / 8)));

            // Canvas 改变宽度会改变列数，旧行无法与新网格对齐，因此先清空历史。
            if (historyColumnCountRef.current !== columnCount) {
                historyRef.current = [];
                historyColumnCountRef.current = columnCount;
            }

            // 按固定时间间隔采集一行对数频谱，使时间沿纵轴稳定向下滚动。
            if (timestamp - lastHistoryAtRef.current >= SPECTROGRAM_SAMPLE_INTERVAL) {
                const row = new Uint8Array(columnCount);
                for (let index = 0; index < columnCount; index += 1) {
                    // 从 20Hz 到 Nyquist 频率按对数位置读取当前频率能量。
                    const rawLevel = sampleLogFrequency(
                        audio.frequencyData,
                        index / Math.max(1, columnCount - 1),
                        audio.sampleRate,
                        audio.frequencyData.length * 2,
                    );
                    // 先过滤底噪，再保存 0-255 整数，减少历史缓存占用。
                    row[index] = Math.round(normalizeSpectrogramLevel(rawLevel) * 255);
                }
                // 新切片放在数组首位，对应画面最上方的“现在”。
                historyRef.current.unshift(row);
                // 只保留绘图区可见的行，避免页面长时间运行后缓存持续增长。
                historyRef.current.length = Math.min(
                    historyRef.current.length,
                    Math.ceil(chartHeight / SPECTROGRAM_ROW_PITCH),
                );
                lastHistoryAtRef.current = timestamp;
            }

            const cellPitch = chartWidth / columnCount;
            // 每个频率格至少留出 1px 左右间隔，不再让相邻色块互相覆盖。
            const cellGap = Math.min(1.4, Math.max(0.8, cellPitch * 0.18));
            const cellWidth = Math.max(1, cellPitch - cellGap);
            historyRef.current.forEach((row, rowIndex) => {
                const y = chartTop + rowIndex * SPECTROGRAM_ROW_PITCH;
                for (let index = 0; index < row.length; index += 1) {
                    const level = row[index] / 255;
                    // 零值保持深色背景，明确显示静音和无有效频率的区域。
                    if (level === 0) continue;
                    context.fillStyle = getSpectrogramColor(level);
                    context.fillRect(
                        chartLeft + index * cellPitch + cellGap / 2,
                        y,
                        cellWidth,
                        SPECTROGRAM_ROW_HEIGHT,
                    );
                }
            });

            // 最新时间线与画布顶部留出距离，避免视觉上贴边或被标题遮挡。
            context.fillStyle = 'rgba(255, 255, 255, 0.58)';
            context.fillRect(chartLeft, chartTop - 2, chartWidth, 1);
            context.fillStyle = '#91a59d';
            context.font = '600 9px sans-serif';
            context.textAlign = 'right';
            context.fillText('NOW', chartLeft + chartWidth, chartTop - 8);

            // 在底部绘制对数频率刻度，让每块颜色对应的频段可以直接读出。
            const maximumFrequency = Math.min(20000, audio.sampleRate / 2);
            context.textAlign = 'center';
            context.font = '9px sans-serif';
            SPECTROGRAM_FREQUENCY_TICKS.forEach(frequency => {
                if (frequency > maximumFrequency) return;
                const progress = getLogFrequencyProgress(frequency, maximumFrequency);
                const x = chartLeft + progress * chartWidth;
                context.fillStyle = 'rgba(155, 178, 169, 0.42)';
                context.fillRect(Math.round(x), chartTop, 1, chartHeight);
                context.fillStyle = '#82978e';
                context.fillText(formatFrequency(frequency), x, height - 10);
            });
            return;
        }

        if (mode === 'structure') {
            const left = Math.max(28, width * 0.05);
            const timelineWidth = width - left * 2;
            const centerY = height * 0.52;
            const trackHeight = Math.min(110, height * 0.22);
            let offset = 0;
            // 使用统一分段展示结构估计，并用当前音频能量调整区块高度。
            STRUCTURE_SEGMENTS.forEach((segment, index) => {
                const segmentWidth = timelineWidth * segment.ratio;
                const pulse = 0.72 + audio.energy.overall * 0.42 + Math.sin(timestamp * 0.0015 + index) * 0.06;
                context.fillStyle = segment.color;
                context.globalAlpha = 0.78;
                context.fillRect(left + offset, centerY - trackHeight * pulse / 2, Math.max(2, segmentWidth - 3), trackHeight * pulse);
                context.globalAlpha = 1;
                context.fillStyle = '#dce9e3';
                context.font = '600 9px sans-serif';
                context.textAlign = 'center';
                context.fillText(segment.label, left + offset + segmentWidth / 2, centerY + trackHeight * 0.75);
                offset += segmentWidth;
            });
            const progress = duration ? Math.min(1, currentTime / duration) : 0;
            const playheadX = left + timelineWidth * progress;
            context.strokeStyle = '#fff';
            context.lineWidth = 2;
            context.beginPath();
            context.moveTo(playheadX, centerY - trackHeight);
            context.lineTo(playheadX, centerY + trackHeight);
            context.stroke();
            context.fillStyle = '#71857c';
            context.font = '10px sans-serif';
            context.textAlign = 'left';
            context.fillText('HEURISTIC STRUCTURE', left, centerY - trackHeight - 28);
            return;
        }

        // Wrapped 模式保留缓慢移动的宽幅声纹背景，HTML 报告叠加在其上方。
        for (let line = 0; line < 18; line += 1) {
            const y = line / 17 * height;
            context.strokeStyle = `hsla(${150 + line * 8}, 72%, 56%, ${0.05 + audio.energy.overall * 0.1})`;
            context.beginPath();
            for (let point = 0; point <= 80; point += 1) {
                const x = point / 80 * width;
                const wave = Math.sin(point * 0.24 + timestamp * 0.0004 + line) * (12 + audio.energy.mid * 40);
                if (point === 0) context.moveTo(x, y + wave);
                else context.lineTo(x, y + wave);
            }
            context.stroke();
        }
    };

    const modeControl = (
        <Segmented
            value={mode}
            options={[
                {label: <span><HeatMapOutlined /> 声纹瀑布</span>, value: 'spectrogram'},
                {label: <span><BarChartOutlined /> 结构时间轴</span>, value: 'structure'},
                {label: <span><DashboardOutlined /> 音乐报告</span>, value: 'wrapped'},
            ]}
            onChange={value => setMode(value as AnalysisMode)}
        />
    );

    return (
        <MusicLabShell eyebrow="AUDIO ANALYSIS" title="音乐数据分析台" modeControl={modeControl}>
            <div className={labStyle.stage}>
                <AudioCanvas analyserRef={analyserRef} label="歌曲频谱瀑布和结构分析" onDraw={draw} />
                <div className={labStyle['stage-label']}><i />{mode === 'spectrogram' ? 'TIME / FREQUENCY' : mode === 'structure' ? 'SECTION MAP' : 'TRACK REPORT'}</div>
                {mode === 'wrapped' && (
                    <section className={style.report} aria-label="当前歌曲音乐报告">
                        <div className={style.reportTitle}>
                            <span>YOUR TRACK IN NUMBERS</span>
                            <h2>{metadata?.name.replace(/\.[^.]+$/, '') || 'MUSIC REPORT'}</h2>
                        </div>
                        <div className={style.reportGrid}>
                            <div><span>时长</span><strong>{Math.round((duration || 0) / 60)} min</strong></div>
                            <div><span>平均能量</span><strong>{Math.round(statistics.averageEnergy * 100)}</strong></div>
                            <div><span>峰值能量</span><strong>{Math.round(statistics.peakEnergy * 100)}</strong></div>
                            <div><span>明亮度</span><strong>{Math.round(statistics.brightness * 100)}</strong></div>
                            <div><span>采样率</span><strong>{metadata?.sampleRate ? `${(metadata.sampleRate / 1000).toFixed(1)}k` : '--'}</strong></div>
                            <div><span>声道</span><strong>{metadata?.channels || '--'}</strong></div>
                        </div>
                    </section>
                )}
            </div>
        </MusicLabShell>
    );
};

export default function AnalysisStudioPage() {
    return <MusicAudioProvider><AnalysisStudioContent /></MusicAudioProvider>;
}
