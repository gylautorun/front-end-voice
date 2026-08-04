/** 一帧音频中用于驱动画面的六段能量，所有值都已归一化到 0-1。 */
export interface AudioEnergy {
    /** 20-60 Hz：底鼓下潜与最深的低频。 */
    sub: number;
    /** 60-250 Hz：鼓点、贝斯主体。 */
    bass: number;
    /** 250-500 Hz：乐器厚度和低沉人声。 */
    lowMid: number;
    /** 500-2000 Hz：人声与主要旋律。 */
    mid: number;
    /** 2-8 kHz：清晰度、军鼓与瞬态。 */
    high: number;
    /** 8-20 kHz：空气感、镲片与高频细节。 */
    air: number;
    /** 全频段平均能量，用于控制整体呼吸与亮度。 */
    overall: number;
}

/** Canvas、Three.js 与 Shader 每帧共用的音频数据快照。 */
export interface AudioAnalysisFrame {
    /** AnalyserNode 返回的频域字节数据。 */
    frequencyData: Uint8Array;
    /** AnalyserNode 返回的时域字节数据，128 表示零振幅基线。 */
    timeData: Uint8Array;
    /** 当前音频上下文采样率。 */
    sampleRate: number;
    /** 已按听觉频段汇总的能量。 */
    energy: AudioEnergy;
}

/** 计算某个 Hz 范围对应频率桶的平均能量。 */
const averageBand = (
    data: Uint8Array,
    sampleRate: number,
    fftSize: number,
    minimumHz: number,
    maximumHz: number,
) => {
    // 每个频率桶表示 sampleRate / fftSize Hz。
    const hzPerBin = sampleRate / fftSize;
    // 将 Hz 边界换算成有效数组索引。
    const start = Math.max(0, Math.floor(minimumHz / hzPerBin));
    const end = Math.min(data.length - 1, Math.ceil(maximumHz / hzPerBin));
    let total = 0;

    // 累加该频段内的所有频率桶。
    for (let index = start; index <= end; index += 1) {
        total += data[index];
    }

    // 字节振幅除以 255 后稳定落在 0-1。
    return end >= start ? total / (end - start + 1) / 255 : 0;
};

/**
 * 跨帧复用 TypedArray，避免 requestAnimationFrame 循环持续创建临时对象。
 * 每个可视化实例应持有一个独立 reader。
 */
export class AudioFrameReader {
    private frequencyData = new Uint8Array(0);
    private timeData = new Uint8Array(0);

    /** 从最新 AnalyserNode 读取频域、时域和分段能量。 */
    read(analyser: AnalyserNode | null): AudioAnalysisFrame {
        // 播放尚未开始时返回稳定的静音数据，让场景仍可绘制待机画面。
        if (!analyser) {
            if (!this.timeData.length) {
                this.frequencyData = new Uint8Array(4096);
                this.timeData = new Uint8Array(4096);
                this.timeData.fill(128);
            }
            return {
                frequencyData: this.frequencyData,
                timeData: this.timeData,
                sampleRate: 44100,
                energy: {sub: 0, bass: 0, lowMid: 0, mid: 0, high: 0, air: 0, overall: 0},
            };
        }

        // FFT 尺寸变化时才重建缓冲区，正常动画帧只覆写数据。
        if (this.frequencyData.length !== analyser.frequencyBinCount) {
            this.frequencyData = new Uint8Array(analyser.frequencyBinCount);
            this.timeData = new Uint8Array(analyser.frequencyBinCount);
        }

        analyser.getByteFrequencyData(this.frequencyData);
        analyser.getByteTimeDomainData(this.timeData);

        const sampleRate = analyser.context.sampleRate;
        const fftSize = analyser.fftSize;
        const sub = averageBand(this.frequencyData, sampleRate, fftSize, 20, 60);
        const bass = averageBand(this.frequencyData, sampleRate, fftSize, 60, 250);
        const lowMid = averageBand(this.frequencyData, sampleRate, fftSize, 250, 500);
        const mid = averageBand(this.frequencyData, sampleRate, fftSize, 500, 2000);
        const high = averageBand(this.frequencyData, sampleRate, fftSize, 2000, 8000);
        const air = averageBand(this.frequencyData, sampleRate, fftSize, 8000, 20000);

        return {
            frequencyData: this.frequencyData,
            timeData: this.timeData,
            sampleRate,
            energy: {
                sub,
                bass,
                lowMid,
                mid,
                high,
                air,
                // 低频和中频占音乐主体，因此整体能量采用有权重的平均值。
                overall: sub * 0.16 + bass * 0.24 + lowMid * 0.16 + mid * 0.2 + high * 0.16 + air * 0.08,
            },
        };
    }
}

/** 按对数坐标从频谱中取一个样本，保留低频区域的视觉宽度。 */
export const sampleLogFrequency = (
    data: Uint8Array,
    progress: number,
    sampleRate: number,
    fftSize: number,
) => {
    const minimumHz = 20;
    const maximumHz = Math.min(20000, sampleRate / 2);
    const frequency = minimumHz * Math.pow(maximumHz / minimumHz, Math.min(1, Math.max(0, progress)));
    const index = Math.min(data.length - 1, Math.round(frequency / (sampleRate / fftSize)));
    return (data[index] || 0) / 255;
};
