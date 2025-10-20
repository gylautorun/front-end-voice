import {useCallback, useMemo, useRef, useState} from 'react';

type IAudioContext = {
    audioInstance: AudioContext;
    gainNode: GainNode;
}
const createAudioContext = (): IAudioContext => {
    // 创建AudioContext实例, 音频处理程序运行的环境
    const audioInstance = new AudioContext();
    // 创建增益节点(音量节点), 用来调节音量的变化
    const gainNode = audioInstance.createGain();
    return {audioInstance, gainNode};
};
export function useAudioMusic(canvas: HTMLCanvasElement | null) {
    const [started, setStarted] = useState(false);
    const ref = useRef<HTMLCanvasElement | null>(canvas);
    const audioContext = useMemo(() => {
        return createAudioContext();
    }, []);
    // 创建分析器
    const analyser = useMemo(() => {
        const analyser = audioContext.audioInstance.createAnalyser();
        // 快速傅里叶变换参数
        analyser.fftSize = 256;
        // bufferArray长度
        const bufferLength = analyser.frequencyBinCount;
        // 创建bufferArray，用来装音频数据
        const dataArray = new Uint8Array(bufferLength);
        return {
            instance: analyser,
            bufferLength,
            dataArray,
        };
    }, [audioContext]);
    
    const draw = useCallback(() => {
        if (!ref.current) {
            return;
        }
        const canvas = ref.current;
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        const w = canvas.width;
        const h = canvas.height;
        const {bufferLength, dataArray} = analyser;
        const barWidth = parseInt((0.5 * w / bufferLength).toString());
        let barHeight;
        let x = 0;
        ctx.clearRect(0, 0, w, h);
        // 分析器获取音频数据“切片”
        analyser.instance.getByteFrequencyData(dataArray);
        
        //把每个音频“切片”画在画布上
        for (let i = 0; i < bufferLength; i++) {
            barHeight = parseInt((0.4 * dataArray[i]).toString());
            ctx.fillRect(x, h - barHeight, barWidth, barHeight);
            x += barWidth + 3;
        }
    }, [audioContext, analyser, ref]);
    const start = useCallback(() => {
        // 创建处理器，参数分别是缓存区大小、输入声道数、输出声道数
        const processor = audioContext.audioInstance.createScriptProcessor(2048, 1, 1);
        // 分析器连接处理器，处理器连接扬声器
        analyser.instance.connect(processor);
        processor.connect(audioContext.audioInstance.destination);
        processor.onaudioprocess = draw;

    }, [audioContext]);
    return {audioContext, analyser, start, draw, started};
}