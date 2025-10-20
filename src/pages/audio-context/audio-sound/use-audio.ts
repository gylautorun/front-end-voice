import {useCallback, useMemo, useRef, useState} from 'react';
import { FieldType } from '.';

type IAudioContext = {
    audioInstance: AudioContext;
    oscillatorNode: OscillatorNode;
    gainNode: GainNode;
}
const createAudioContext = (): IAudioContext => {
    // 创建AudioContext实例, 音频处理程序运行的环境
    const audioInstance = new AudioContext();
    // 创建振荡器, 声音的源头
    const oscillatorNode = audioInstance.createOscillator();
    // 创建增益节点(音量节点), 用来调节音量的变化
    const gainNode = audioInstance.createGain();
    return {
        audioInstance,
        oscillatorNode,
        gainNode,
    };
};
export function useAudio() {
    const [started, setStarted] = useState(false);
    const ref = useRef<IAudioContext | null>(null);
    const audioContext = useMemo(() => {
        // 停止时候创建新的音频上下文
        if (!started) {
            const data = createAudioContext();
            ref.current = data;
            return data;
        }
        // 开始的时候使用上次创建的音频上下文
        return ref.current!;
    }, [started]);
    
    const start = useCallback((values: FieldType) => {
        const {audioInstance, oscillatorNode, gainNode} = audioContext;
        
        // 设置音量和振荡器参数
        gainNode.gain.value = values.gain;  // 音量 0~1
        oscillatorNode.type = values.type;   // 振荡器输出正弦波
        oscillatorNode.frequency.value = values.frequency;  // 振荡频率200Hz

        // 发生源振荡器连接音量
        oscillatorNode.connect(gainNode);
        // 音量连接扬声器
        gainNode.connect(audioInstance.destination);

        // 启动振荡器 - 开始发声
        oscillatorNode.start(audioInstance.currentTime);
        setStarted(true);
    }, [audioContext]);
    const stop = useCallback((values: FieldType) => {
        const {audioInstance, oscillatorNode, gainNode} = audioContext;
        // 先在0.5秒内变化到0.001，然后停止
        const FADING_TIME = 0.5;
        // 结束发声
        // 现在起FADING_TIME秒后结束发声, 没有FADING_TIME表示立刻结束
        gainNode.gain[values.gainChangeType](0.001, audioInstance.currentTime + FADING_TIME);
        oscillatorNode.stop(audioInstance.currentTime + FADING_TIME);
        setStarted(false);
    }, [audioContext]);
    return {start, stop, started};
}