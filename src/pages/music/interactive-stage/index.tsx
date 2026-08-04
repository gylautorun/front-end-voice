import {useCallback, useEffect, useRef, useState} from 'react';
import {ApiOutlined, ControlOutlined, DashboardOutlined, UsbOutlined} from '@ant-design/icons';
import {Button, Segmented, Tag} from 'antd';
import {AudioCanvas, CreativeCanvasFrame} from '../creative-shared/audio-canvas';
import {NOTE_NAMES} from '../creative-shared/music-math';
import {useMidiInput} from '../creative-shared/use-midi-input';
import labStyle from '../creative-shared/style.module.scss';
import {useMusicAudio} from '../shared/music-audio-context';
import {MusicAudioProvider} from '../shared/music-audio-provider';
import {MusicLabShell} from '../shared/music-lab-shell';
import style from './style.module.scss';

/** 互动页面的三类体验。 */
type InteractiveMode = 'rhythm' | 'midi' | 'devices';

/** 节奏游戏中一枚向判定线移动的目标。 */
interface RhythmTarget {
    id: number;
    lane: number;
    spawnedAt: number;
    hit: boolean;
}

/** 设备能力连接状态。 */
type DeviceState = 'idle' | 'checking' | 'connected' | 'unsupported' | 'denied';

/** TypeScript DOM 尚未统一提供的最小 WebHID/WebSerial Navigator 扩展。 */
type HardwareNavigator = Navigator & {
    hid?: {requestDevice: (options: {filters: unknown[]}) => Promise<Array<{productName?: string}>>};
    serial?: {requestPort: () => Promise<{getInfo: () => unknown}>};
};

/** 节奏挑战、实时 MIDI 和浏览器硬件连接页面。 */
const InteractiveStageContent = () => {
    const {analyserRef, isPlaying} = useMusicAudio();
    const [mode, setMode] = useState<InteractiveMode>('rhythm');
    const [score, setScore] = useState(0);
    const [combo, setCombo] = useState(0);
    const [deviceStates, setDeviceStates] = useState<Record<'hid' | 'serial' | 'xr', DeviceState>>({hid: 'idle', serial: 'idle', xr: 'idle'});
    const {connect: connectMidi, deviceName, notes: midiNotes, state: midiState} = useMidiInput();
    const targetsRef = useRef<RhythmTarget[]>([]);
    const lastSpawnAtRef = useRef(0);
    const targetIdRef = useRef(0);
    const latestTimestampRef = useRef(0);

    /** 在判定线附近寻找最近目标并计算得分。 */
    const hitTarget = useCallback(() => {
        const timestamp = latestTimestampRef.current;
        let nearest: RhythmTarget | undefined;
        let nearestDistance = Number.POSITIVE_INFINITY;
        targetsRef.current.forEach(target => {
            if (target.hit) return;
            const age = timestamp - target.spawnedAt;
            const distance = Math.abs(3100 - age);
            if (distance < nearestDistance) {
                nearest = target;
                nearestDistance = distance;
            }
        });
        if (nearest && nearestDistance < 460) {
            nearest.hit = true;
            const points = nearestDistance < 130 ? 300 : nearestDistance < 260 ? 180 : 100;
            setScore(current => current + points);
            setCombo(current => current + 1);
        } else {
            setCombo(0);
        }
    }, []);

    // Rhythm 模式允许空格键触发判定，离开模式后立即移除监听。
    useEffect(() => {
        if (mode !== 'rhythm') return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code === 'Space') {
                event.preventDefault();
                hitTarget();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [hitTarget, mode]);

    /** 绘制节奏跑道或 MIDI 键盘。 */
    const draw = ({audio, context, height, timestamp, width}: CreativeCanvasFrame) => {
        latestTimestampRef.current = timestamp;
        context.clearRect(0, 0, width, height);
        context.fillStyle = '#050809';
        context.fillRect(0, 0, width, height);

        if (mode === 'midi') {
            const keyCount = 24;
            const keyWidth = width / keyCount;
            const baseMidi = 48;
            for (let index = 0; index < keyCount; index += 1) {
                const midi = baseMidi + index;
                const active = midiNotes.some(note => note.note === midi);
                const black = [1, 3, 6, 8, 10].includes(midi % 12);
                context.fillStyle = active ? '#ffd166' : black ? '#0b1112' : '#d9e5df';
                context.fillRect(index * keyWidth + 1, height * 0.38, keyWidth - 2, height * 0.58);
                context.fillStyle = active || !black ? '#20302a' : '#81928b';
                context.font = '9px sans-serif';
                context.textAlign = 'center';
                context.fillText(`${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`, index * keyWidth + keyWidth / 2, height * 0.91);
            }
            // 当前按键力度向上绘制独立光柱。
            midiNotes.forEach(note => {
                const index = note.note - baseMidi;
                if (index < 0 || index >= keyCount) return;
                const x = index * keyWidth + keyWidth * 0.22;
                const barHeight = note.velocity * height * 0.3;
                context.fillStyle = '#55dfad';
                context.shadowColor = '#55dfad';
                context.shadowBlur = 18;
                context.fillRect(x, height * 0.34 - barHeight, keyWidth * 0.56, barHeight);
            });
            return;
        }

        if (mode !== 'rhythm') return;
        // 有音乐时由低频瞬态生成目标；静音预览以较慢固定间隔生成。
        const spawnInterval = isPlaying ? Math.max(300, 680 - audio.energy.bass * 1200) : 900;
        if (timestamp - lastSpawnAtRef.current > spawnInterval) {
            const lane = Math.floor((audio.energy.mid * 7 + targetIdRef.current * 3) % 4);
            targetsRef.current.push({id: targetIdRef.current++, lane, spawnedAt: timestamp, hit: false});
            lastSpawnAtRef.current = timestamp;
        }
        targetsRef.current = targetsRef.current.filter(target => timestamp - target.spawnedAt < 3900 && !target.hit);
        const roadLeft = width * 0.16;
        const roadWidth = width * 0.68;
        const laneWidth = roadWidth / 4;
        // 四条垂直跑道使用稳定尺寸，目标动画不会推动布局。
        for (let lane = 0; lane < 4; lane += 1) {
            context.fillStyle = lane % 2 ? '#0b1514' : '#0e1917';
            context.fillRect(roadLeft + lane * laneWidth, 0, laneWidth - 2, height);
        }
        const hitY = height * 0.82;
        context.strokeStyle = '#f5f8f6';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(roadLeft, hitY);
        context.lineTo(roadLeft + roadWidth, hitY);
        context.stroke();
        targetsRef.current.forEach(target => {
            const progress = (timestamp - target.spawnedAt) / 3100;
            const y = progress * hitY;
            const x = roadLeft + target.lane * laneWidth + 7;
            const color = ['#55dfad', '#5b8ff9', '#ffd166', '#ef476f'][target.lane];
            context.fillStyle = color;
            context.shadowColor = color;
            context.shadowBlur = 16;
            context.fillRect(x, y - 12, laneWidth - 16, 24);
        });
    };

    /** 请求 WebHID、WebSerial 或检测沉浸式 WebXR。 */
    const connectDevice = async (type: 'hid' | 'serial' | 'xr') => {
        const hardware = navigator as HardwareNavigator;
        setDeviceStates(current => ({...current, [type]: 'checking'}));
        try {
            if (type === 'hid') {
                if (!hardware.hid) throw new Error('unsupported');
                const devices = await hardware.hid.requestDevice({filters: []});
                setDeviceStates(current => ({...current, hid: devices.length ? 'connected' : 'idle'}));
            } else if (type === 'serial') {
                if (!hardware.serial) throw new Error('unsupported');
                await hardware.serial.requestPort();
                setDeviceStates(current => ({...current, serial: 'connected'}));
            } else {
                if (!hardware.xr) throw new Error('unsupported');
                const supported = await hardware.xr.isSessionSupported('immersive-vr');
                setDeviceStates(current => ({...current, xr: supported ? 'connected' : 'unsupported'}));
            }
        } catch (error) {
            const unsupported = error instanceof Error && error.message === 'unsupported';
            setDeviceStates(current => ({...current, [type]: unsupported ? 'unsupported' : 'denied'}));
        }
    };

    const modeControl = (
        <>
            <Segmented
                value={mode}
                options={[
                    {label: <span><ControlOutlined /> 节奏挑战</span>, value: 'rhythm'},
                    {label: <span><ApiOutlined /> MIDI 键盘</span>, value: 'midi'},
                    {label: <span><UsbOutlined /> 设备联动</span>, value: 'devices'},
                ]}
                onChange={value => setMode(value as InteractiveMode)}
            />
            {mode === 'midi' && <Button icon={<ApiOutlined />} loading={midiState === 'connecting'} onClick={() => void connectMidi()}>连接 MIDI</Button>}
        </>
    );

    return (
        <MusicLabShell eyebrow="INTERACTION / DEVICES" title="音乐互动与设备控制" modeControl={modeControl}>
            <div className={labStyle.stage} onPointerDown={mode === 'rhythm' ? hitTarget : undefined}>
                {mode === 'devices' ? (
                    <section className={style.deviceWorkbench} aria-label="浏览器音乐硬件连接台">
                        <header><span>DEVICE BRIDGE</span><h2>浏览器设备连接</h2></header>
                        <div className={style.deviceGrid}>
                            <div><UsbOutlined /><strong>WebHID</strong><Tag>{deviceStates.hid}</Tag><Button onClick={() => void connectDevice('hid')}>选择设备</Button></div>
                            <div><DashboardOutlined /><strong>Web Serial</strong><Tag>{deviceStates.serial}</Tag><Button onClick={() => void connectDevice('serial')}>选择串口</Button></div>
                            <div><ApiOutlined /><strong>Web MIDI</strong><Tag>{midiState}</Tag><Button onClick={() => void connectMidi()}>连接键盘</Button></div>
                            <div><ControlOutlined /><strong>WebXR</strong><Tag>{deviceStates.xr}</Tag><Button onClick={() => void connectDevice('xr')}>检测头显</Button></div>
                        </div>
                    </section>
                ) : (
                    <AudioCanvas analyserRef={analyserRef} label="音乐节奏挑战与 MIDI 输入" onDraw={draw} />
                )}
                <div className={labStyle['stage-label']}><i />{mode === 'rhythm' ? 'TAP / SPACE' : mode === 'midi' ? 'LIVE MIDI INPUT' : 'HARDWARE CAPABILITIES'}</div>
                {mode === 'rhythm' && (
                    <div className={style.rhythmHud}>
                        <span>SCORE <b>{score}</b></span>
                        <span>COMBO <b>{combo}</b></span>
                    </div>
                )}
                {mode === 'midi' && (
                    <div className={labStyle.metrics}>
                        <div className={labStyle.metric}><span>状态</span><strong>{midiState}</strong></div>
                        <div className={labStyle.metric}><span>设备</span><strong>{deviceName || '--'}</strong></div>
                        <div className={labStyle.metric}><span>按键</span><strong>{midiNotes.length}</strong></div>
                    </div>
                )}
            </div>
        </MusicLabShell>
    );
};

export default function InteractiveStagePage() {
    return <MusicAudioProvider><InteractiveStageContent /></MusicAudioProvider>;
}
