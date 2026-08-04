import {useCallback, useEffect, useRef, useState} from 'react';

/** 麦克风音高检测的运行状态。 */
export type PitchInputState = 'idle' | 'checking' | 'active' | 'unsupported' | 'denied';

/** 使用自相关在一帧波形中估算基频。 */
const autoCorrelate = (buffer: Float32Array, sampleRate: number) => {
    let rms = 0;
    for (const sample of buffer) rms += sample * sample;
    rms = Math.sqrt(rms / buffer.length);
    if (rms < 0.012) return {frequency: 0, level: rms};

    const minimumOffset = Math.floor(sampleRate / 1000);
    const maximumOffset = Math.min(buffer.length - 1, Math.floor(sampleRate / 70));
    let bestOffset = 0;
    let bestCorrelation = 0;
    for (let offset = minimumOffset; offset <= maximumOffset; offset += 1) {
        let correlation = 0;
        for (let index = 0; index < buffer.length - offset; index += 1) {
            correlation += buffer[index] * buffer[index + offset];
        }
        if (correlation > bestCorrelation) {
            bestCorrelation = correlation;
            bestOffset = offset;
        }
    }
    return {
        frequency: bestOffset ? sampleRate / bestOffset : 0,
        level: rms,
    };
};

/** 管理麦克风授权、实时音高检测以及媒体资源释放。 */
export const useMicrophonePitch = () => {
    const streamRef = useRef<MediaStream | null>(null);
    const contextRef = useRef<AudioContext | null>(null);
    const animationFrameRef = useRef(0);
    const [state, setState] = useState<PitchInputState>('idle');
    const [frequency, setFrequency] = useState(0);
    const [level, setLevel] = useState(0);

    /** 停止检测并释放麦克风、AudioContext 和动画循环。 */
    const stop = useCallback(() => {
        cancelAnimationFrame(animationFrameRef.current);
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        void contextRef.current?.close();
        contextRef.current = null;
        setFrequency(0);
        setLevel(0);
        setState('idle');
    }, []);

    /** 在用户点击后申请麦克风权限并启动自相关检测。 */
    const start = useCallback(async () => {
        if (!navigator.mediaDevices?.getUserMedia) {
            setState('unsupported');
            return;
        }
        setState('checking');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {autoGainControl: false, echoCancellation: false, noiseSuppression: false},
            });
            const context = new AudioContext();
            const analyser = context.createAnalyser();
            analyser.fftSize = 2048;
            context.createMediaStreamSource(stream).connect(analyser);
            const buffer = new Float32Array(analyser.fftSize);
            streamRef.current = stream;
            contextRef.current = context;
            setState('active');
            let lastEmitAt = 0;

            const detect = (timestamp: number) => {
                analyser.getFloatTimeDomainData(buffer);
                const result = autoCorrelate(buffer, context.sampleRate);
                // React 指标以约 12fps 更新，音高计算无需让整个页面每帧重渲染。
                if (timestamp - lastEmitAt > 80) {
                    setFrequency(result.frequency);
                    setLevel(result.level);
                    lastEmitAt = timestamp;
                }
                animationFrameRef.current = requestAnimationFrame(detect);
            };
            animationFrameRef.current = requestAnimationFrame(detect);
        } catch {
            setState('denied');
        }
    }, []);

    useEffect(() => stop, [stop]);
    return {frequency, level, start, state, stop};
};
