import {useRef, useState} from 'react';
import {ApiOutlined, ApartmentOutlined, FundOutlined, RadarChartOutlined} from '@ant-design/icons';
import {Button, Segmented, Tooltip} from 'antd';
import {AudioCanvas, CreativeCanvasFrame} from '../creative-shared/audio-canvas';
import {detectDominantNote, getMajorChordNotes, NOTE_NAMES} from '../creative-shared/music-math';
import {MidiConnectionState, useMidiInput} from '../creative-shared/use-midi-input';
import labStyle from '../creative-shared/style.module.scss';
import {useMusicAudio} from '../shared/music-audio-context';
import {MusicAudioProvider} from '../shared/music-audio-provider';
import {MusicLabShell} from '../shared/music-lab-shell';

/** 音符实验室提供的三种表示方式。 */
type NoteStudioMode = 'rain' | 'roll' | 'chord';

/** 跨帧保存的一条可视音符。 */
interface VisualNote {
    midi: number;
    strength: number;
    startedAt: number;
    source: 'audio' | 'midi' | 'demo';
}

/** MIDI 状态对应的按钮文字。 */
const getMidiLabel = (state: MidiConnectionState) => {
    if (state === 'connecting') return '连接中';
    if (state === 'connected') return 'MIDI 已连接';
    if (state === 'unsupported') return '浏览器不支持 MIDI';
    if (state === 'error') return '未发现 MIDI 设备';
    return '连接 MIDI';
};

/** 音符级可视化页面内容。 */
const NoteStudioContent = () => {
    const {analyserRef, isPlaying} = useMusicAudio();
    const {connect, deviceName, notes: midiNotes, state: midiState} = useMidiInput();
    const [mode, setMode] = useState<NoteStudioMode>('rain');
    // 保存最近音符，Canvas 每帧读取但不触发 React 高频更新。
    const visualNotesRef = useRef<VisualNote[]>([]);
    const lastSpawnRef = useRef(0);
    const demoIndexRef = useRef(0);

    /** 从音频或 MIDI 收集音符，再按照当前模式绘制。 */
    const draw = (canvasFrame: CreativeCanvasFrame) => {
        const {audio, context, height, timestamp, width} = canvasFrame;
        const detected = detectDominantNote(audio);
        const activeMidi = midiNotes[midiNotes.length - 1];
        let source: VisualNote['source'] = activeMidi ? 'midi' : detected ? 'audio' : 'demo';
        let currentMidi = activeMidi?.note ?? detected?.midi ?? 60;
        let strength = activeMidi?.velocity ?? detected?.strength ?? 0.2;

        // 每 150ms 最多收集一个真实音符，避免主频轻微波动产生密集噪点。
        if ((activeMidi || detected) && timestamp - lastSpawnRef.current > 150) {
            visualNotesRef.current.push({midi: currentMidi, strength, startedAt: timestamp, source});
            lastSpawnRef.current = timestamp;
        }
        // 未播放且没有 MIDI 时生成低速五声音阶待机动画，确保页面结构可见。
        if (!activeMidi && !detected && timestamp - lastSpawnRef.current > 520) {
            const demoScale = [60, 62, 64, 67, 69, 72, 69, 67];
            currentMidi = demoScale[demoIndexRef.current % demoScale.length];
            demoIndexRef.current += 1;
            source = 'demo';
            strength = 0.24;
            visualNotesRef.current.push({midi: currentMidi, strength, startedAt: timestamp, source});
            lastSpawnRef.current = timestamp;
        }
        visualNotesRef.current = visualNotesRef.current.filter(note => timestamp - note.startedAt < 8000);

        context.clearRect(0, 0, width, height);
        context.fillStyle = '#050809';
        context.fillRect(0, 0, width, height);

        if (mode === 'chord') {
            const root = ((currentMidi % 12) + 12) % 12;
            const chordNotes = getMajorChordNotes(root);
            const centerX = width / 2;
            const centerY = height / 2;
            const radius = Math.min(width, height) * 0.31;
            // 绘制五度圈顺序，使相邻位置代表和声上更接近的调。
            for (let index = 0; index < 12; index += 1) {
                const pitchClass = index * 7 % 12;
                const angle = index / 12 * Math.PI * 2 - Math.PI / 2;
                const x = centerX + Math.cos(angle) * radius;
                const y = centerY + Math.sin(angle) * radius;
                const active = chordNotes.includes(pitchClass);
                context.beginPath();
                context.fillStyle = pitchClass === root ? '#ef476f' : active ? '#ffd166' : '#12201f';
                context.strokeStyle = active ? '#f7e4a8' : '#35504a';
                context.lineWidth = active ? 3 : 1;
                context.arc(x, y, active ? 24 : 18, 0, Math.PI * 2);
                context.fill();
                context.stroke();
                context.fillStyle = active ? '#08100d' : '#a5b8b0';
                context.font = active ? '700 13px sans-serif' : '600 11px sans-serif';
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                context.fillText(NOTE_NAMES[pitchClass], x, y);
            }
            context.fillStyle = '#eef7f3';
            context.font = '700 40px sans-serif';
            context.fillText(`${NOTE_NAMES[root]} MAJOR`, centerX, centerY - 8);
            context.fillStyle = '#78938a';
            context.font = '11px sans-serif';
            context.fillText(chordNotes.map(note => NOTE_NAMES[note]).join('  /  '), centerX, centerY + 26);
            return;
        }

        if (mode === 'roll') {
            const top = 34;
            const bottom = height - 34;
            // DAW 风格横向网格：每 4 个小节使用更亮的主线。
            for (let column = 0; column <= 16; column += 1) {
                const x = column / 16 * width;
                context.strokeStyle = column % 4 === 0 ? '#29433d' : '#14221f';
                context.beginPath();
                context.moveTo(x, top);
                context.lineTo(x, bottom);
                context.stroke();
            }
            for (let row = 0; row <= 24; row += 1) {
                const y = top + row / 24 * (bottom - top);
                context.strokeStyle = row % 12 === 0 ? '#29433d' : '#101b19';
                context.beginPath();
                context.moveTo(0, y);
                context.lineTo(width, y);
                context.stroke();
            }
            visualNotesRef.current.forEach(note => {
                const age = timestamp - note.startedAt;
                const x = width - age * 0.16;
                const pitch = Math.max(48, Math.min(84, note.midi));
                const y = bottom - (pitch - 48) / 36 * (bottom - top);
                const color = note.source === 'midi' ? '#ffd166' : note.source === 'audio' ? '#55dfad' : '#598bf7';
                context.fillStyle = color;
                context.shadowColor = color;
                context.shadowBlur = 9;
                context.fillRect(x, y - 5, 34 + note.strength * 80, 9);
            });
            return;
        }

        // Synthesia 风格音符雨：十二个半音轨道垂直下落到底部键盘。
        const laneWidth = width / 12;
        for (let lane = 0; lane < 12; lane += 1) {
            const x = lane * laneWidth;
            const blackKey = [1, 3, 6, 8, 10].includes(lane);
            context.fillStyle = blackKey ? '#080d0e' : '#0d1515';
            context.fillRect(x, 0, laneWidth - 1, height);
            context.fillStyle = blackKey ? '#111a1b' : '#dce9e3';
            context.fillRect(x + 1, height - 46, laneWidth - 3, 44);
            context.fillStyle = blackKey ? '#9cb0a7' : '#26352f';
            context.font = '10px sans-serif';
            context.textAlign = 'center';
            context.fillText(NOTE_NAMES[lane], x + laneWidth / 2, height - 18);
        }
        visualNotesRef.current.forEach(note => {
            const age = timestamp - note.startedAt;
            const lane = ((note.midi % 12) + 12) % 12;
            const x = lane * laneWidth + 4;
            const y = -60 + age * 0.11;
            const noteHeight = 28 + note.strength * 82;
            const color = note.source === 'midi' ? '#ffd166' : note.source === 'audio' ? '#5de0b0' : '#5b8ff9';
            context.fillStyle = color;
            context.shadowColor = color;
            context.shadowBlur = 15;
            context.fillRect(x, y - noteHeight, Math.max(4, laneWidth - 8), noteHeight);
        });
    };

    const modeControl = (
        <>
            <Segmented
                value={mode}
                options={[
                    {label: <span><FundOutlined /> 音符雨</span>, value: 'rain'},
                    {label: <span><ApartmentOutlined /> Piano Roll</span>, value: 'roll'},
                    {label: <span><RadarChartOutlined /> 和弦轮</span>, value: 'chord'},
                ]}
                onChange={value => setMode(value as NoteStudioMode)}
            />
            <Tooltip title={deviceName || '连接电子琴或 MIDI 控制器'}>
                <Button
                    icon={<ApiOutlined />}
                    loading={midiState === 'connecting'}
                    disabled={midiState === 'unsupported'}
                    onClick={() => void connect()}
                >
                    {getMidiLabel(midiState)}
                </Button>
            </Tooltip>
        </>
    );

    const latestMidi = midiNotes[midiNotes.length - 1];
    return (
        <MusicLabShell eyebrow="NOTE / MIDI" title="音符与和声实验室" modeControl={modeControl}>
            <div className={labStyle.stage}>
                <AudioCanvas analyserRef={analyserRef} label="实时音符与和弦可视化" onDraw={draw} />
                <div className={labStyle['stage-label']}><i />{isPlaying ? 'AUDIO NOTE TRACKING' : midiState === 'connected' ? 'WEB MIDI LIVE' : 'NOTE PREVIEW'}</div>
                <div className={labStyle.metrics}>
                    <div className={labStyle.metric}><span>输入</span><strong>{latestMidi ? 'MIDI' : isPlaying ? 'AUDIO' : 'DEMO'}</strong></div>
                    <div className={labStyle.metric}><span>活动音符</span><strong>{latestMidi ? `${NOTE_NAMES[latestMidi.note % 12]}${Math.floor(latestMidi.note / 12) - 1}` : '--'}</strong></div>
                    <div className={labStyle.metric}><span>设备</span><strong>{deviceName || '未连接'}</strong></div>
                </div>
            </div>
        </MusicLabShell>
    );
};

/** 为音符路由提供独立播放器和音频分析生命周期。 */
export default function NoteStudioPage() {
    return <MusicAudioProvider><NoteStudioContent /></MusicAudioProvider>;
}
