import {CSSProperties, useRef, useState} from 'react';
import {AudioOutlined, FontColorsOutlined, FundProjectionScreenOutlined, RadarChartOutlined} from '@ant-design/icons';
import {Button, Segmented, Tooltip} from 'antd';
import {getLyricsSearchQuery} from '../audio-visualizer/lyrics/lrclib-client';
import {LyricLine} from '../audio-visualizer/lyrics/types';
import {useLyrics} from '../audio-visualizer/lyrics/use-lyrics';
import {AudioCanvas, CreativeCanvasFrame} from '../creative-shared/audio-canvas';
import {detectDominantNote, NOTE_NAMES} from '../creative-shared/music-math';
import {useMicrophonePitch} from '../creative-shared/use-microphone-pitch';
import labStyle from '../creative-shared/style.module.scss';
import {useMusicAudio} from '../shared/music-audio-context';
import {MusicAudioProvider} from '../shared/music-audio-provider';
import {MusicLabShell} from '../shared/music-lab-shell';
import style from './style.module.scss';

/** 歌词视觉路由的三种展示。 */
type LyricMotionMode = 'kinetic' | 'depth' | 'pitch';

/** 没有网络歌词时保持页面可预览的短句。 */
const FALLBACK_LINES: LyricLine[] = [
    {text: '让声音穿过时间', startTime: 0},
    {text: '让节奏变成光', startTime: 5},
    {text: '每一个字都跟随音乐呼吸', startTime: 10},
    {text: '此刻正在发生', startTime: 15},
];

/** 找到当前播放时间对应的最后一条歌词。 */
const findActiveLine = (lines: LyricLine[], currentTime: number) => {
    let activeIndex = 0;
    for (let index = 0; index < lines.length; index += 1) {
        if ((lines[index].startTime || 0) <= currentTime) activeIndex = index;
        else break;
    }
    return activeIndex;
};

/** 动力字体、景深歌词和麦克风音准曲线页面。 */
const LyricMotionContent = () => {
    const {analyserRef, currentTime, duration, metadata} = useMusicAudio();
    const [mode, setMode] = useState<LyricMotionMode>('kinetic');
    const {frequency: micFrequency, level: micLevel, start, state: pitchState, stop} = useMicrophonePitch();
    const {result, status} = useLyrics(metadata);
    const pitchHistoryRef = useRef<Array<{mic: number; song: number}>>([]);
    const lastPitchSampleAtRef = useRef(0);
    const lines = result?.lines.length ? result.lines : FALLBACK_LINES;
    const activeIndex = result?.isSynced ? findActiveLine(lines, currentTime) : Math.floor(currentTime / 5) % lines.length;
    const activeLine = lines[activeIndex] || FALLBACK_LINES[0];
    const nextStart = lines[activeIndex + 1]?.startTime ?? duration ?? (activeLine.startTime || 0) + 5;
    const lineProgress = Math.min(1, Math.max(0, (currentTime - (activeLine.startTime || 0)) / Math.max(0.1, nextStart - (activeLine.startTime || 0))));

    /** 绘制歌曲主频与麦克风音高的滚动对比曲线。 */
    const drawPitch = ({audio, context, height, timestamp, width}: CreativeCanvasFrame) => {
        const songNote = detectDominantNote(audio, 70, 1000);
        if (timestamp - lastPitchSampleAtRef.current > 55) {
            pitchHistoryRef.current.push({mic: micFrequency, song: songNote?.frequency || 0});
            pitchHistoryRef.current = pitchHistoryRef.current.slice(-180);
            lastPitchSampleAtRef.current = timestamp;
        }
        context.clearRect(0, 0, width, height);
        context.fillStyle = '#050809';
        context.fillRect(0, 0, width, height);
        // 半音网格覆盖 C2-C6，便于直接观察音高差异。
        const minimumMidi = 36;
        const maximumMidi = 84;
        for (let midi = minimumMidi; midi <= maximumMidi; midi += 1) {
            const y = height - (midi - minimumMidi) / (maximumMidi - minimumMidi) * height;
            context.strokeStyle = midi % 12 === 0 ? '#294239' : '#101c19';
            context.beginPath();
            context.moveTo(0, y);
            context.lineTo(width, y);
            context.stroke();
            if (midi % 12 === 0) {
                context.fillStyle = '#6e8279';
                context.font = '9px sans-serif';
                context.fillText(`C${Math.floor(midi / 12) - 1}`, 12, y - 4);
            }
        }
        const drawLine = (key: 'mic' | 'song', color: string, lineWidth: number) => {
            context.beginPath();
            context.strokeStyle = color;
            context.lineWidth = lineWidth;
            let started = false;
            pitchHistoryRef.current.forEach((point, index) => {
                const frequency = point[key];
                if (!frequency) {
                    started = false;
                    return;
                }
                const midi = 69 + 12 * Math.log2(frequency / 440);
                const x = index / Math.max(1, pitchHistoryRef.current.length - 1) * width;
                const y = height - (midi - minimumMidi) / (maximumMidi - minimumMidi) * height;
                if (!started) context.moveTo(x, y);
                else context.lineTo(x, y);
                started = true;
            });
            context.stroke();
        };
        drawLine('song', '#58dfad', 4);
        drawLine('mic', '#ffd166', 2);
    };

    const songFrequency = pitchHistoryRef.current[pitchHistoryRef.current.length - 1]?.song || 0;
    const cents = micFrequency && songFrequency ? 1200 * Math.log2(micFrequency / songFrequency) : 0;
    const normalizedCents = cents ? ((cents + 600) % 1200 + 1200) % 1200 - 600 : 0;
    const pitchScore = micFrequency && songFrequency ? Math.max(0, Math.round(100 - Math.abs(normalizedCents) / 6)) : 0;

    const modeControl = (
        <>
            <Segmented
                value={mode}
                options={[
                    {label: <span><FontColorsOutlined /> 动力字体</span>, value: 'kinetic'},
                    {label: <span><FundProjectionScreenOutlined /> 3D 歌词</span>, value: 'depth'},
                    {label: <span><RadarChartOutlined /> 音准曲线</span>, value: 'pitch'},
                ]}
                onChange={value => setMode(value as LyricMotionMode)}
            />
            {mode === 'pitch' && (
                <Tooltip title={pitchState === 'denied' ? '麦克风权限未授予' : '检测演唱音高'}>
                    <Button
                        icon={<AudioOutlined />}
                        loading={pitchState === 'checking'}
                        onClick={pitchState === 'active' ? stop : () => void start()}
                    >
                        {pitchState === 'active' ? '停止收音' : '开始评分'}
                    </Button>
                </Tooltip>
            )}
        </>
    );

    return (
        <MusicLabShell eyebrow="LYRICS / PITCH" title="歌词与动态排版" modeControl={modeControl}>
            <div className={labStyle.stage}>
                {mode === 'pitch' ? (
                    <>
                        <AudioCanvas analyserRef={analyserRef} label="原唱与麦克风音高对比曲线" onDraw={drawPitch} />
                        <div className={labStyle.metrics}>
                            <div className={labStyle.metric}><span>原唱</span><strong>{songFrequency ? `${songFrequency.toFixed(0)} Hz` : '--'}</strong></div>
                            <div className={labStyle.metric}><span>演唱</span><strong>{micFrequency ? `${micFrequency.toFixed(0)} Hz` : '--'}</strong></div>
                            <div className={labStyle.metric}><span>音准</span><strong>{pitchScore || '--'}</strong></div>
                            <div className={labStyle.metric}><span>输入</span><strong>{micLevel > 0.012 ? 'VOICE' : 'SILENT'}</strong></div>
                        </div>
                    </>
                ) : mode === 'depth' ? (
                    <section className={style.depthStage} aria-label="景深歌词卡片">
                        {[-2, -1, 0, 1, 2].map(offset => {
                            const line = lines[(activeIndex + offset + lines.length) % lines.length];
                            return (
                                <div
                                    key={`${offset}-${line.text}`}
                                    className={offset === 0 ? style.activeDepthLine : style.depthLine}
                                    style={{
                                        '--depth-offset': offset,
                                        '--depth-absolute': Math.abs(offset),
                                    } as CSSProperties}
                                >
                                    {line.text}
                                </div>
                            );
                        })}
                    </section>
                ) : (
                    <section className={style.kineticStage} aria-label="随播放进度变化的动力歌词">
                        <span className={style.lyricSource}>{status === 'success' ? getLyricsSearchQuery(metadata?.name || '') : 'KINETIC TYPE'}</span>
                        <div className={style.kineticLine}>
                            {Array.from(activeLine.text || 'MUSIC').map((character, index, characters) => {
                                const active = index / Math.max(1, characters.length) <= lineProgress;
                                return (
                                    <span
                                        key={`${index}-${character}`}
                                        className={active ? style.activeCharacter : undefined}
                                        style={{'--char-shift': `${Math.sin(index) * -2}px`} as CSSProperties}
                                    >
                                        {character === ' ' ? '\u00a0' : character}
                                    </span>
                                );
                            })}
                        </div>
                        <div className={style.lineProgress}><i style={{width: `${lineProgress * 100}%`}} /></div>
                    </section>
                )}
                <div className={labStyle['stage-label']}><i />{result?.isSynced ? 'SYNCED LYRICS' : status === 'loading' ? 'SEARCHING LYRICS' : 'LYRIC MOTION'}</div>
            </div>
        </MusicLabShell>
    );
};

export default function LyricMotionPage() {
    return <MusicAudioProvider><LyricMotionContent /></MusicAudioProvider>;
}
