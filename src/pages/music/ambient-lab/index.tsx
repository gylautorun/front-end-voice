import {useCallback, useEffect, useRef, useState} from 'react';
import {CloudOutlined, CompassOutlined, PauseOutlined, PlayCircleOutlined, RiseOutlined} from '@ant-design/icons';
import {Button, Segmented, Slider} from 'antd';
import {AudioCanvas, CreativeCanvasFrame} from '../creative-shared/audio-canvas';
import labStyle from '../creative-shared/style.module.scss';
import {useMusicAudio} from '../shared/music-audio-context';
import {MusicAudioProvider} from '../shared/music-audio-provider';
import {MusicLabShell} from '../shared/music-lab-shell';
import style from './style.module.scss';

/** 氛围实验室的三个场景。 */
type AmbientMode = 'landscape' | 'drive' | 'noise';

/** 三层环境噪声的音量设置。 */
interface MixerLevels {
    rain: number;
    fire: number;
    white: number;
}

/** 创建可循环播放的两秒白噪声 AudioBuffer。 */
const createNoiseBuffer = (context: AudioContext) => {
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) channel[index] = Math.random() * 2 - 1;
    return buffer;
};

/** 管理雨声、篝火低频和白噪声三层浏览器合成器。 */
const useAmbientMixer = () => {
    const contextRef = useRef<AudioContext | null>(null);
    const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
    const gainsRef = useRef<Record<keyof MixerLevels, GainNode> | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [levels, setLevels] = useState<MixerLevels>({rain: 0.42, fire: 0.28, white: 0.12});

    /** 停止全部噪声源并释放 AudioContext。 */
    const stop = useCallback(() => {
        sourcesRef.current.forEach(source => {
            try { source.stop(); } catch { /* 音源可能已经自然停止。 */ }
        });
        sourcesRef.current = [];
        gainsRef.current = null;
        void contextRef.current?.close();
        contextRef.current = null;
        setIsRunning(false);
    }, []);

    /** 在用户手势中建立三条不同滤波的循环噪声链。 */
    const start = useCallback(() => {
        if (contextRef.current) return;
        const context = new AudioContext();
        const buffer = createNoiseBuffer(context);
        const master = context.createGain();
        master.gain.value = 0.36;
        master.connect(context.destination);

        const createLayer = (type: keyof MixerLevels, filterType: BiquadFilterType, frequency: number) => {
            const source = context.createBufferSource();
            const filter = context.createBiquadFilter();
            const gain = context.createGain();
            source.buffer = buffer;
            source.loop = true;
            filter.type = filterType;
            filter.frequency.value = frequency;
            gain.gain.value = levels[type];
            source.connect(filter).connect(gain).connect(master);
            source.start();
            sourcesRef.current.push(source);
            return gain;
        };

        gainsRef.current = {
            rain: createLayer('rain', 'highpass', 2800),
            fire: createLayer('fire', 'lowpass', 420),
            white: createLayer('white', 'bandpass', 1100),
        };
        contextRef.current = context;
        setIsRunning(true);
    }, [levels]);

    /** 修改某层音量，并同步到已经运行的 GainNode。 */
    const setLevel = useCallback((type: keyof MixerLevels, value: number) => {
        setLevels(current => ({...current, [type]: value}));
        const gain = gainsRef.current?.[type];
        if (gain && contextRef.current) {
            gain.gain.setTargetAtTime(value, contextRef.current.currentTime, 0.04);
        }
    }, []);

    useEffect(() => stop, [stop]);
    return {isRunning, levels, setLevel, start, stop};
};

/** 音频山景、节奏驾驶和环境声合成页面。 */
const AmbientLabContent = () => {
    const {analyserRef} = useMusicAudio();
    const [mode, setMode] = useState<AmbientMode>('landscape');
    const mixer = useAmbientMixer();
    const {isRunning: isMixerRunning, stop: stopMixer} = mixer;

    // 离开噪声模式时停止独立合成器，防止用户找不到仍在播放的声源。
    useEffect(() => {
        if (mode !== 'noise' && isMixerRunning) stopMixer();
    }, [isMixerRunning, mode, stopMixer]);

    /** 按当前模式绘制山景、道路或噪声层。 */
    const draw = ({audio, context, height, timestamp, width}: CreativeCanvasFrame) => {
        context.clearRect(0, 0, width, height);
        context.fillStyle = '#050809';
        context.fillRect(0, 0, width, height);

        if (mode === 'drive') {
            const horizon = height * 0.28;
            const centerX = width / 2;
            const roadBottom = width * 0.48;
            const roadTop = width * 0.045;
            const speed = 0.00035 + audio.energy.overall * 0.002;
            // 地平线和道路边界建立单点透视。
            context.fillStyle = '#0c1717';
            context.fillRect(0, horizon, width, height - horizon);
            context.fillStyle = '#111516';
            context.beginPath();
            context.moveTo(centerX - roadTop, horizon);
            context.lineTo(centerX + roadTop, horizon);
            context.lineTo(centerX + roadBottom, height);
            context.lineTo(centerX - roadBottom, height);
            context.closePath();
            context.fill();
            context.strokeStyle = '#5ee0ae';
            context.lineWidth = 3;
            context.stroke();
            // 车道虚线按指数透视间隔，并随音乐速度向镜头移动。
            for (let marker = 0; marker < 24; marker += 1) {
                const progress = (marker / 24 + timestamp * speed) % 1;
                const perspective = progress * progress;
                const y = horizon + perspective * (height - horizon);
                const halfWidth = roadTop + perspective * (roadBottom - roadTop);
                context.strokeStyle = `rgba(255, 209, 102, ${0.18 + progress * 0.78})`;
                context.lineWidth = 1 + perspective * 7;
                [-0.34, 0.34].forEach(lane => {
                    const x = centerX + halfWidth * lane;
                    context.beginPath();
                    context.moveTo(x, y);
                    context.lineTo(x, y + 4 + perspective * 34);
                    context.stroke();
                });
            }
            // 高频用路旁短柱表现，低频控制柱高。
            for (let index = 0; index < 28; index += 1) {
                const progress = (index / 28 + timestamp * speed * 0.72) % 1;
                const perspective = progress * progress;
                const side = index % 2 ? 1 : -1;
                const x = centerX + side * (roadTop + perspective * roadBottom * 1.35);
                const y = horizon + perspective * (height - horizon);
                const towerHeight = 10 + perspective * (42 + audio.energy.high * 110);
                context.fillStyle = side > 0 ? '#ef476f' : '#4f7cff';
                context.fillRect(x, y - towerHeight, 2 + perspective * 7, towerHeight);
            }
            return;
        }

        if (mode === 'noise') {
            const combined = mixer.levels.rain + mixer.levels.fire + mixer.levels.white;
            // 三种合成层用不同方向和颜色的连续线场表示。
            const layers = [
                {level: mixer.levels.rain, color: '#4f9cff', frequency: 0.13},
                {level: mixer.levels.fire, color: '#ef6b47', frequency: 0.065},
                {level: mixer.levels.white, color: '#d9e5df', frequency: 0.24},
            ];
            layers.forEach((layer, layerIndex) => {
                for (let line = 0; line < 12; line += 1) {
                    context.beginPath();
                    context.strokeStyle = `${layer.color}${Math.round((0.08 + layer.level * 0.34) * 255).toString(16).padStart(2, '0')}`;
                    context.lineWidth = 1 + layer.level * 5;
                    for (let point = 0; point <= 100; point += 1) {
                        const x = point / 100 * width;
                        const baseY = (line + 0.5) / 12 * height;
                        const y = baseY + Math.sin(point * layer.frequency + timestamp * 0.0004 * (layerIndex + 1) + line) * (8 + layer.level * 42);
                        if (point === 0) context.moveTo(x, y);
                        else context.lineTo(x, y);
                    }
                    context.stroke();
                }
            });
            context.fillStyle = `rgba(94, 224, 174, ${0.04 + combined * 0.045})`;
            context.fillRect(0, 0, width, height);
            return;
        }

        // 多层山脉从频谱桶取样，低频决定整体抬升，高频决定远景细节。
        const layers = [
            {baseline: 0.74, amplitude: 0.2, color: '#142a27', alpha: 1},
            {baseline: 0.62, amplitude: 0.16, color: '#1c4038', alpha: 0.92},
            {baseline: 0.49, amplitude: 0.11, color: '#286656', alpha: 0.74},
        ];
        layers.forEach((layer, layerIndex) => {
            context.beginPath();
            context.moveTo(0, height);
            for (let point = 0; point <= 180; point += 1) {
                const progress = point / 180;
                const dataIndex = Math.min(audio.frequencyData.length - 1, Math.floor(progress * 900));
                const level = (audio.frequencyData[dataIndex] || 0) / 255;
                const x = progress * width;
                const terrain = Math.sin(progress * Math.PI * (4 + layerIndex * 2) + timestamp * 0.00008 * (layerIndex + 1)) * 0.025;
                const y = height * (layer.baseline - terrain - level * layer.amplitude - audio.energy.bass * 0.08);
                context.lineTo(x, y);
            }
            context.lineTo(width, height);
            context.closePath();
            context.globalAlpha = layer.alpha;
            context.fillStyle = layer.color;
            context.fill();
        });
        context.globalAlpha = 1;
        // 高频粒子从山脉顶部向上生长，形成植物/城市般的竖向细节。
        for (let index = 0; index < 80; index += 1) {
            const x = index / 79 * width;
            const level = (audio.frequencyData[300 + index * 9] || 0) / 255;
            const barHeight = 4 + level * height * 0.18;
            context.fillStyle = index % 3 === 0 ? '#ffd166' : '#5ee0ae';
            context.fillRect(x, height * 0.49 - barHeight, Math.max(1, width / 420), barHeight);
        }
    };

    const modeControl = (
        <>
            <Segmented
                value={mode}
                options={[
                    {label: <span><RiseOutlined /> 音乐山景</span>, value: 'landscape'},
                    {label: <span><CompassOutlined /> 音频驾驶</span>, value: 'drive'},
                    {label: <span><CloudOutlined /> 氛围生成</span>, value: 'noise'},
                ]}
                onChange={value => setMode(value as AmbientMode)}
            />
            {mode === 'noise' && (
                <Button icon={mixer.isRunning ? <PauseOutlined /> : <PlayCircleOutlined />} onClick={mixer.isRunning ? mixer.stop : mixer.start}>
                    {mixer.isRunning ? '停止氛围' : '播放氛围'}
                </Button>
            )}
        </>
    );

    return (
        <MusicLabShell eyebrow="AMBIENT EXPERIMENTS" title="音乐氛围与世界生成" modeControl={modeControl}>
            <div className={labStyle.stage}>
                <AudioCanvas analyserRef={analyserRef} label="音乐驱动山景、道路和环境声图形" onDraw={draw} />
                <div className={labStyle['stage-label']}><i />{mode === 'landscape' ? 'AUDIO LANDSCAPE' : mode === 'drive' ? 'MUSIC DRIVE' : 'BROWSER NOISE MIXER'}</div>
                {mode === 'noise' && (
                    <section className={style.mixer} aria-label="环境声混音器">
                        <header><span>AMBIENT MIXER</span><strong>{mixer.isRunning ? 'LIVE' : 'READY'}</strong></header>
                        {([
                            ['rain', '雨声'],
                            ['fire', '篝火'],
                            ['white', '白噪声'],
                        ] as const).map(([key, label]) => (
                            <div className={style.mixerRow} key={key}>
                                <span>{label}</span>
                                <Slider min={0} max={0.8} step={0.01} value={mixer.levels[key]} onChange={value => mixer.setLevel(key, value)} />
                                <b>{Math.round(mixer.levels[key] * 100)}</b>
                            </div>
                        ))}
                    </section>
                )}
            </div>
        </MusicLabShell>
    );
};

export default function AmbientLabPage() {
    return <MusicAudioProvider><AmbientLabContent /></MusicAudioProvider>;
}
