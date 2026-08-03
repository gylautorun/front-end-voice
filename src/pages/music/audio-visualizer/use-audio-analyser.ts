import {useCallback, useEffect, useRef, useState} from 'react';

/** 上传音频解码后展示给页面的元数据。 */
export interface AudioMetadata {
    /** 原始文件名。 */
    name: string;
    /** 原始文件大小，单位为字节。 */
    size: number;
    /** 根据 MIME 或扩展名推导的音频格式。 */
    type: string;
    /** 解码后的总时长，单位为秒。 */
    duration: number;
    /** 解码后的采样率，单位为 Hz。 */
    sampleRate: number;
    /** 解码后的声道数。 */
    channels: number;
    /** 根据文件大小和时长估算的平均码率，单位为 kbps。 */
    bitRate: number;
}

/** 优先读取 MIME 子类型，缺失时回退到文件扩展名。 */
const getAudioType = (file: File) => {
    // audio/mpeg 取得 mpeg。
    const mimeType = file.type.split('/')[1];
    // MIME 为空时尝试从文件名取 mp3、wav 等扩展名。
    const extension = file.name.split('.').pop();
    // 统一转为大写，便于在界面作为格式徽标展示。
    return (mimeType || extension || '未知').toUpperCase();
};

/**
 * 管理音频文件解码、HTMLAudioElement 播放和 Web Audio 分析节点。
 * Canvas 只读取 analyserRef，不直接操作播放器内部状态。
 */
export const useAudioAnalyser = () => {
    // 隐藏 audio 元素，负责实际的解码播放、进度和音量。
    const audioRef = useRef<HTMLAudioElement>(null);
    // 对外暴露频域数据节点，画布每帧从该节点读数。
    const analyserRef = useRef<AnalyserNode | null>(null);
    // 缓存播放使用的 AudioContext，避免每次播放重建音频图。
    const audioContextRef = useRef<AudioContext | null>(null);
    // 同一 HTMLAudioElement 只能创建一次 MediaElementSource，因此持久缓存。
    const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
    // 保存当前 Blob URL，替换文件或卸载时及时释放内存。
    const objectUrlRef = useRef('');
    // 每次加载递增，用于忽略较旧文件的异步解码结果。
    const loadIdRef = useRef(0);

    // 当前音频的已解析信息。
    const [metadata, setMetadata] = useState<AudioMetadata | null>(null);
    // 控制解析遮罩和播放按钮的禁用状态。
    const [isParsing, setIsParsing] = useState(false);
    // 与 audio 元素 play/pause 事件保持同步。
    const [isPlaying, setIsPlaying] = useState(false);
    // 当前播放秒数，用于进度条和时间文本。
    const [currentTime, setCurrentTime] = useState(0);
    // 总时长优先来自 AudioBuffer，也会被 audio metadata 事件校正。
    const [duration, setDuration] = useState(0);
    // 音量范围为 0–1，初始为 78%。
    const [volume, setVolumeState] = useState(0.78);
    // 保存可直接向用户展示的解析或播放错误。
    const [error, setError] = useState('');

    /** 在首次播放手势内创建并连接 Web Audio 节点，后续播放直接复用。 */
    const ensureAudioGraph = useCallback(async () => {
        // 取得页面中持续存在的 audio 元素。
        const audio = audioRef.current;
        // DOM 尚未挂载时无法创建媒体源，直接结束。
        if (!audio) return;

        // 只在第一次播放时建立音频图。
        if (!audioContextRef.current) {
            // 创建浏览器原生音频处理上下文。
            const audioContext = new AudioContext();
            // 创建同时提供频域与时域数据的分析节点。
            const analyser = audioContext.createAnalyser();
            // 8192 点 FFT 在 44.1 kHz 音频下约为 5.4 Hz/bin，能区分次低频柱高。
            analyser.fftSize = 8192;
            // 将小于 -92 dB 的微弱信号压到可视化底部。
            analyser.minDecibels = -92;
            // 将 -12 dB 附近映射到频谱最高值，保留顶部空间。
            analyser.maxDecibels = -12;
            // 用适中平滑抑制抖动，同时保留节拍的瞬时响应。
            analyser.smoothingTimeConstant = 0.72;

            // 将 HTMLAudioElement 转换为 Web Audio 可连接的媒体源。
            const source = audioContext.createMediaElementSource(audio);
            // 媒体源首先流入分析器，供 Canvas 读取。
            source.connect(analyser);
            // 分析后仍连接扬声器，保证用户能听到音频。
            analyser.connect(audioContext.destination);

            // 缓存所有节点，防止后续播放重复创建。
            audioContextRef.current = audioContext;
            analyserRef.current = analyser;
            sourceRef.current = source;
        }

        // 浏览器可能因页面后台或自动播放策略暂停 AudioContext。
        if (audioContextRef.current.state === 'suspended') {
            // 在用户点击播放的手势中恢复音频上下文。
            await audioContextRef.current.resume();
        }
    }, []);

    /** 替换当前音频，同时解码文件并生成可视化所需的元数据。 */
    const loadFile = useCallback(async (file: File) => {
        // 取得复用的 audio 播放元素。
        const audio = audioRef.current;
        // 元素未挂载时不启动异步解码。
        if (!audio) return;

        // 为本次解码分配唯一序号。
        const loadId = ++loadIdRef.current;
        // 替换文件前停止原音频。
        audio.pause();
        // 立即同步控件状态，避免界面继续显示播放中。
        setIsPlaying(false);
        // 新音频从零开始计时。
        setCurrentTime(0);
        // 解码完成前暂时清空时长。
        setDuration(0);
        // 新文件开始时清除上一次错误。
        setError('');
        // 开启解析状态和画布遮罩。
        setIsParsing(true);

        // 如果存在上一个本地 URL，先释放其 Blob 内存。
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
        }
        // 为当前 File 生成 audio 元素可播放的本地 URL。
        objectUrlRef.current = URL.createObjectURL(file);
        // 将新 URL 设为播放源。
        audio.src = objectUrlRef.current;
        // 通知浏览器立即重新读取媒体元数据。
        audio.load();

        // 先写入无需解码就能获取的文件信息，让页面立即更新。
        setMetadata({
            name: file.name,
            size: file.size,
            type: getAudioType(file),
            duration: 0,
            sampleRate: 0,
            channels: 0,
            bitRate: 0,
        });

        // 单独创建解码上下文，不影响播放使用的持久 AudioContext。
        const decodeContext = new AudioContext();
        try {
            // 读取文件字节并解码为未压缩 AudioBuffer。
            const audioBuffer = await decodeContext.decodeAudioData(await file.arrayBuffer());
            // 用户已选择更新文件时，丢弃这个过期结果。
            if (loadId !== loadIdRef.current) return;

            // AudioBuffer 提供精确时长。
            const parsedDuration = audioBuffer.duration;
            // 将时长同步给进度条上限。
            setDuration(parsedDuration);
            // 一次性写入所有解码结果，减少不必要的多次渲染。
            setMetadata({
                name: file.name,
                size: file.size,
                type: getAudioType(file),
                duration: parsedDuration,
                sampleRate: audioBuffer.sampleRate,
                channels: audioBuffer.numberOfChannels,
                // 码率 = 字节数 × 8 ÷ 时长 ÷ 1000，结果为平均 kbps。
                bitRate: parsedDuration ? Math.round(file.size * 8 / parsedDuration / 1000) : 0,
            });
        } catch {
            // 只有当本次仍是最新任务时才显示错误。
            if (loadId === loadIdRef.current) {
                setError('音频解析失败，请更换文件');
            }
        } finally {
            // 无论成功失败都关闭临时解码上下文。
            await decodeContext.close();
            // 过期任务不能关闭新任务的加载态。
            if (loadId === loadIdRef.current) {
                setIsParsing(false);
            }
        }
    }, []);

    /** 根据当前播放状态执行播放或暂停。 */
    const togglePlayback = useCallback(async () => {
        // 每次调用时读取最新 audio 元素。
        const audio = audioRef.current;
        // 文件未就绪时不执行播放命令。
        if (!audio || !metadata) return;

        // 已在播放时直接暂停，pause 事件会更新 React 状态。
        if (isPlaying) {
            audio.pause();
            return;
        }

        try {
            // 先创建或恢复音频分析图。
            await ensureAudioGraph();
            // 等待浏览器确认播放，便于捕获自动播放限制。
            await audio.play();
            // 播放成功后清除旧错误。
            setError('');
        } catch {
            // 播放被拒绝或媒体不可用时显示统一错误。
            setError('无法播放当前音频');
        }
    }, [ensureAudioGraph, isPlaying, metadata]);

    /** 将播放头移动到用户在进度条选择的秒数。 */
    const seek = useCallback((nextTime: number) => {
        // 读取当前 audio 元素。
        const audio = audioRef.current;
        // 元素不存在时无可调整的播放头。
        if (!audio) return;
        // 改变媒体元素的真实播放位置。
        audio.currentTime = nextTime;
        // 立即更新界面，不等待下一个 timeupdate 事件。
        setCurrentTime(nextTime);
    }, []);

    /** 将当前音频重置到起点，但不改变播放/暂停状态。 */
    const reset = useCallback(() => {
        // 取得真实播放元素。
        const audio = audioRef.current;
        // 元素不存在时直接结束。
        if (!audio) return;
        // 将播放头定位到 0 秒。
        audio.currentTime = 0;
        // 同步归零 React 进度状态。
        setCurrentTime(0);
    }, []);

    /** 将 0–1 的界面音量同步到 HTMLAudioElement。 */
    const setVolume = useCallback((nextVolume: number) => {
        // 对外部传入值做边界夹取，防止 DOM 抛出范围错误。
        const normalizedVolume = Math.min(1, Math.max(0, nextVolume));
        // 更新 Slider 所使用的受控状态。
        setVolumeState(normalizedVolume);
        // audio 元素已挂载时立即修改输出音量。
        if (audioRef.current) {
            audioRef.current.volume = normalizedVolume;
        }
    }, []);

    /** 在浏览器读到媒体头后，用元素时长校正解码结果。 */
    const handleLoadedMetadata = useCallback(() => {
        // 读取 audio 元素报告的实际时长。
        const audioDuration = audioRef.current?.duration;
        // 0、NaN 或 Infinity 都不能作为有效进度上限。
        if (!audioDuration || !Number.isFinite(audioDuration)) return;
        // 更新播放控件使用的总时长。
        setDuration(audioDuration);
        // 如果元数据已建立，只替换其 duration 字段。
        setMetadata(current => current ? {...current, duration: audioDuration} : current);
    }, []);

    // 确保初始音量和后续 Slider 变化始终写入 audio 元素。
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
        }
    }, [volume]);

    // 组件卸载时释放所有浏览器媒体与 Web Audio 资源。
    useEffect(() => {
        return () => {
            // 使尚未完成的解码任务全部过期。
            loadIdRef.current += 1;
            // 释放当前上传文件的 Blob URL。
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
            }
            // 从音频图中断开媒体源。
            sourceRef.current?.disconnect();
            // 断开分析器与扬声器输出。
            analyserRef.current?.disconnect();
            // 关闭持久 AudioContext，释放音频线程。
            audioContextRef.current?.close();
        };
    }, []);

    // 将状态、DOM/Analyser 引用和操作方法统一暴露给页面组件。
    return {
        analyserRef,
        audioRef,
        currentTime,
        duration,
        error,
        isParsing,
        isPlaying,
        metadata,
        volume,
        // 播放到结尾时恢复播放按钮状态。
        handleEnded: () => setIsPlaying(false),
        handleLoadedMetadata,
        // audio 的 pause 事件是播放状态的最终事实来源。
        handlePause: () => setIsPlaying(false),
        // audio 真正开始播放后才将界面设为播放中。
        handlePlay: () => setIsPlaying(true),
        // 每次 timeupdate 从媒体元素读取真实进度。
        handleTimeUpdate: () => setCurrentTime(audioRef.current?.currentTime || 0),
        loadFile,
        reset,
        seek,
        setVolume,
        togglePlayback,
    };
};
