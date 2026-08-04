import {useCallback, useEffect, useRef, useState} from 'react';

/** Web MIDI API 的连接阶段。 */
export type MidiConnectionState = 'idle' | 'connecting' | 'connected' | 'unsupported' | 'error';

/** 当前按下的 MIDI 音符。 */
export interface MidiNoteEvent {
    /** MIDI 音符编号。 */
    note: number;
    /** 0-1 归一化力度。 */
    velocity: number;
    /** 浏览器收到 Note On 的时间。 */
    startedAt: number;
}

/** 管理 MIDI 授权、输入设备监听和当前按键集合。 */
export const useMidiInput = () => {
    const accessRef = useRef<MIDIAccess | null>(null);
    const [state, setState] = useState<MidiConnectionState>('idle');
    const [deviceName, setDeviceName] = useState('');
    const [notes, setNotes] = useState<MidiNoteEvent[]>([]);

    /** 为当前访问对象中的所有输入设备绑定 Note On/Off 事件。 */
    const bindInputs = useCallback((access: MIDIAccess) => {
        const inputs = Array.from(access.inputs.values());
        setDeviceName(inputs.map(input => input.name || 'MIDI 输入设备').join(' / '));
        inputs.forEach(input => {
            input.onmidimessage = event => {
                const [status = 0, note = 0, velocity = 0] = event.data || [];
                const command = status & 0xf0;
                const isNoteOn = command === 0x90 && velocity > 0;
                const isNoteOff = command === 0x80 || (command === 0x90 && velocity === 0);
                if (isNoteOn) {
                    setNotes(current => [
                        ...current.filter(item => item.note !== note),
                        {note, velocity: velocity / 127, startedAt: performance.now()},
                    ]);
                } else if (isNoteOff) {
                    setNotes(current => current.filter(item => item.note !== note));
                }
            };
        });
        setState(inputs.length ? 'connected' : 'error');
    }, []);

    /** 在用户点击后请求 Web MIDI 权限并监听全部可用输入。 */
    const connect = useCallback(async () => {
        if (!navigator.requestMIDIAccess) {
            setState('unsupported');
            return;
        }
        setState('connecting');
        try {
            const access = await navigator.requestMIDIAccess();
            accessRef.current = access;
            bindInputs(access);
        } catch {
            setState('error');
        }
    }, [bindInputs]);

    // 组件卸载时解除所有设备回调，避免页面切换后继续更新状态。
    useEffect(() => () => {
        accessRef.current?.inputs.forEach(input => {
            input.onmidimessage = null;
        });
    }, []);

    return {connect, deviceName, notes, state};
};
