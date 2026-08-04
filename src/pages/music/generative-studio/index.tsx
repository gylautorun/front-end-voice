import {useCallback, useEffect, useRef, useState} from 'react';
import {BgColorsOutlined, BulbOutlined, PauseOutlined, PlayCircleOutlined} from '@ant-design/icons';
import {Button, Segmented} from 'antd';
import {AudioCanvas, CreativeCanvasFrame} from '../creative-shared/audio-canvas';
import {getSpectralCentroid, hashText, NOTE_NAMES, seededRandom} from '../creative-shared/music-math';
import labStyle from '../creative-shared/style.module.scss';
import {useMusicAudio} from '../shared/music-audio-context';
import {MusicAudioProvider} from '../shared/music-audio-provider';
import {MusicLabShell} from '../shared/music-lab-shell';

/** 本地生成式页面的三个运行模式。 */
type GenerativeMode = 'features' | 'cover' | 'melody';

/** 浏览器端规则旋律生成器。 */
const useGenerativeSequencer = () => {
    const contextRef = useRef<AudioContext | null>(null);
    const timerRef = useRef<number | null>(null);
    const sequenceIndexRef = useRef(0);
    const [isRunning, setIsRunning] = useState(false);
    const [currentNote, setCurrentNote] = useState(60);

    /** 停止调度并关闭生成器使用的 AudioContext。 */
    const stop = useCallback(() => {
        if (timerRef.current !== null) window.clearInterval(timerRef.current);
        timerRef.current = null;
        void contextRef.current?.close();
        contextRef.current = null;
        setIsRunning(false);
    }, []);

    /** 在用户手势内启动五声音阶生成器。 */
    const start = useCallback(() => {
        if (timerRef.current !== null) return;
        const context = new AudioContext();
        contextRef.current = context;
        const scale = [60, 62, 64, 67, 69, 72, 74, 76];
        const playNext = () => {
            const index = sequenceIndexRef.current;
            // 使用确定性跳步而不是完全随机，旋律会形成可重复动机。
            const midi = scale[(index * 3 + Math.floor(index / 4)) % scale.length];
            sequenceIndexRef.current += 1;
            setCurrentNote(midi);
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = index % 3 === 0 ? 'triangle' : 'sine';
            oscillator.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
            gain.gain.setValueAtTime(0.0001, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.09, context.currentTime + 0.025);
            gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.34);
            oscillator.connect(gain).connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + 0.36);
        };
        playNext();
        timerRef.current = window.setInterval(playNext, 380);
        setIsRunning(true);
    }, []);

    useEffect(() => stop, [stop]);
    return {currentNote, isRunning, start, stop};
};

/** 音频特征、生成式封面和浏览器旋律页面。 */
const GenerativeStudioContent = () => {
    const {analyserRef, metadata} = useMusicAudio();
    const [mode, setMode] = useState<GenerativeMode>('features');
    const [featureMetrics, setFeatureMetrics] = useState({brightness: 0, energy: 0});
    const {currentNote, isRunning, start, stop} = useGenerativeSequencer();
    const title = metadata?.name.replace(/\.[^.]+$/, '') || 'GENERATIVE TRACK';
    const seed = hashText(title);
    const featureRef = useRef({brightness: 0, energy: 0, motion: 0});
    const lastFeatureEmitRef = useRef(0);
    const melodyHistoryRef = useRef<Array<{note: number; time: number}>>([]);
    const lastMelodyNoteRef = useRef(-1);

    /** 根据当前模式把实时音频特征映射到不同生成图形。 */
    const draw = ({audio, context, height, timestamp, width}: CreativeCanvasFrame) => {
        const targetBrightness = getSpectralCentroid(audio);
        featureRef.current.brightness += (targetBrightness - featureRef.current.brightness) * 0.08;
        featureRef.current.energy += (audio.energy.overall - featureRef.current.energy) * 0.12;
        featureRef.current.motion += (audio.energy.bass * 0.65 + audio.energy.high * 0.35 - featureRef.current.motion) * 0.1;
        const features = featureRef.current;
        // 指标文字每 320ms 同步一次，Canvas 本身继续保持完整帧率。
        if (timestamp - lastFeatureEmitRef.current > 320) {
            setFeatureMetrics({brightness: features.brightness, energy: features.energy});
            lastFeatureEmitRef.current = timestamp;
        }

        context.clearRect(0, 0, width, height);
        context.fillStyle = mode === 'cover' ? '#f1f2ed' : '#050809';
        context.fillRect(0, 0, width, height);

        if (mode === 'cover') {
            const margin = Math.min(width, height) * 0.08;
            const coverSize = Math.min(width - margin * 2, height - margin * 2);
            const left = (width - coverSize) / 2;
            const top = (height - coverSize) / 2;
            const palette = ['#101718', '#ef476f', '#35c995', '#ffd166', '#4278ed'];
            context.save();
            context.beginPath();
            context.rect(left, top, coverSize, coverSize);
            context.clip();
            context.fillStyle = palette[seed % palette.length];
            context.fillRect(left, top, coverSize, coverSize);
            // 歌曲名种子决定几何数量和位置，音频特征只改变动态尺度。
            for (let index = 0; index < 22; index += 1) {
                const randomX = seededRandom(seed + index * 13);
                const randomY = seededRandom(seed + index * 29);
                const randomSize = seededRandom(seed + index * 47);
                const size = coverSize * (0.04 + randomSize * 0.19) * (1 + features.energy * 0.45);
                context.fillStyle = palette[(seed + index + 1) % palette.length];
                context.globalAlpha = 0.42 + (index % 3) * 0.18;
                context.save();
                context.translate(left + randomX * coverSize, top + randomY * coverSize);
                context.rotate(timestamp * 0.00005 * (index % 2 ? 1 : -1) + index);
                if (index % 3 === 0) {
                    context.beginPath();
                    context.arc(0, 0, size / 2, 0, Math.PI * 2);
                    context.fill();
                } else {
                    context.fillRect(-size / 2, -size * 0.12, size, size * 0.24);
                }
                context.restore();
            }
            context.globalAlpha = 1;
            context.fillStyle = 'rgba(5, 8, 9, 0.76)';
            context.fillRect(left, top + coverSize * 0.71, coverSize, coverSize * 0.29);
            context.fillStyle = '#fff';
            context.font = `700 ${Math.max(18, coverSize * 0.055)}px sans-serif`;
            context.textAlign = 'left';
            context.fillText(title.slice(0, 22), left + coverSize * 0.06, top + coverSize * 0.82, coverSize * 0.88);
            context.fillStyle = '#9ef0cf';
            context.font = `600 ${Math.max(9, coverSize * 0.02)}px sans-serif`;
            context.fillText(`ENERGY ${Math.round(features.energy * 100)} / BRIGHT ${Math.round(features.brightness * 100)}`, left + coverSize * 0.06, top + coverSize * 0.9);
            context.restore();
            return;
        }

        if (mode === 'melody') {
            if (isRunning && currentNote !== lastMelodyNoteRef.current) {
                melodyHistoryRef.current.push({note: currentNote, time: timestamp});
                melodyHistoryRef.current = melodyHistoryRef.current.slice(-28);
                lastMelodyNoteRef.current = currentNote;
            }
            const lanes = 8;
            for (let lane = 0; lane < lanes; lane += 1) {
                const y = (lane + 0.5) / lanes * height;
                context.strokeStyle = lane % 2 ? '#10201c' : '#183029';
                context.beginPath();
                context.moveTo(0, y);
                context.lineTo(width, y);
                context.stroke();
                context.fillStyle = '#627b70';
                context.font = '10px sans-serif';
                context.fillText(NOTE_NAMES[[0, 2, 4, 7, 9, 0, 2, 4][lane]], 16, y - 8);
            }
            melodyHistoryRef.current.forEach((event, index) => {
                const lane = [60, 62, 64, 67, 69, 72, 74, 76].indexOf(event.note);
                if (lane < 0) return;
                const age = timestamp - event.time;
                const x = width - 60 - age * 0.22;
                const y = (lane + 0.5) / lanes * height;
                context.fillStyle = index === melodyHistoryRef.current.length - 1 ? '#ffd166' : '#55dfad';
                context.shadowColor = context.fillStyle;
                context.shadowBlur = 12;
                context.fillRect(x, y - 7, 48, 14);
            });
            return;
        }

        // 特征场：低频控制粒子半径，中频控制漂移，高频和质心共同控制颜色。
        const centerX = width / 2;
        const centerY = height / 2;
        const particleCount = Math.min(360, Math.max(140, Math.floor(width / 3)));
        for (let index = 0; index < particleCount; index += 1) {
            const baseAngle = seededRandom(seed + index * 7) * Math.PI * 2;
            const baseRadius = seededRandom(seed + index * 17) * Math.min(width, height) * 0.48;
            const angle = baseAngle + timestamp * (0.00002 + features.motion * 0.00012) * (index % 2 ? 1 : -1);
            const radius = baseRadius * (0.66 + features.energy * 0.6);
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius * 0.72;
            const hue = 145 + features.brightness * 170 + index % 38;
            const size = 1 + seededRandom(seed + index * 31) * 2.4 + audio.energy.high * 4;
            context.fillStyle = `hsla(${hue}, 82%, 62%, ${0.28 + features.energy * 0.62})`;
            context.beginPath();
            context.arc(x, y, size, 0, Math.PI * 2);
            context.fill();
        }
        context.strokeStyle = `hsla(${150 + features.brightness * 160}, 80%, 62%, 0.45)`;
        context.lineWidth = 2 + features.energy * 8;
        context.beginPath();
        context.arc(centerX, centerY, 50 + features.energy * Math.min(width, height) * 0.2, 0, Math.PI * 2);
        context.stroke();
    };

    const modeControl = (
        <>
            <Segmented
                value={mode}
                options={[
                    {label: <span><BulbOutlined /> 特征场</span>, value: 'features'},
                    {label: <span><BgColorsOutlined /> 生成封面</span>, value: 'cover'},
                    {label: <span><PlayCircleOutlined /> 旋律生成</span>, value: 'melody'},
                ]}
                onChange={value => setMode(value as GenerativeMode)}
            />
            {mode === 'melody' && (
                <Button
                    icon={isRunning ? <PauseOutlined /> : <PlayCircleOutlined />}
                    onClick={isRunning ? stop : start}
                >
                    {isRunning ? '停止生成' : '开始生成'}
                </Button>
            )}
        </>
    );

    return (
        <MusicLabShell eyebrow="LOCAL GENERATIVE" title="特征与生成式视觉" modeControl={modeControl}>
            <div className={labStyle.stage}>
                <AudioCanvas analyserRef={analyserRef} label="音频特征驱动的生成式图形" onDraw={draw} />
                <div className={labStyle['stage-label']}><i />{mode === 'features' ? 'AUDIO FEATURE FIELD' : mode === 'cover' ? 'SEEDED COVER ENGINE' : 'BROWSER SEQUENCER'}</div>
                <div className={labStyle.metrics}>
                    <div className={labStyle.metric}><span>能量</span><strong>{Math.round(featureMetrics.energy * 100)}</strong></div>
                    <div className={labStyle.metric}><span>明亮度</span><strong>{Math.round(featureMetrics.brightness * 100)}</strong></div>
                    <div className={labStyle.metric}><span>生成音符</span><strong>{isRunning ? `${NOTE_NAMES[currentNote % 12]}${Math.floor(currentNote / 12) - 1}` : '--'}</strong></div>
                </div>
            </div>
        </MusicLabShell>
    );
};

export default function GenerativeStudioPage() {
    return <MusicAudioProvider><GenerativeStudioContent /></MusicAudioProvider>;
}
