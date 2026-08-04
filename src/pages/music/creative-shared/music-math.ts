import {AudioAnalysisFrame} from '../shared/audio-frame';

/** 十二平均律中的音名顺序，MIDI 音符编号可以直接对 12 取余。 */
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** 主频换算后的音符信息。 */
export interface DetectedNote {
    /** 主频 Hz。 */
    frequency: number;
    /** 0-127 MIDI 音符编号。 */
    midi: number;
    /** 不含八度的十二平均律音名。 */
    name: string;
    /** MIDI 标准八度编号。 */
    octave: number;
    /** 频谱桶归一化强度。 */
    strength: number;
}

/**
 * 从频谱中寻找给定范围内能量最高的频率桶，并换算为 MIDI 音符。
 */
export const detectDominantNote = (
    frame: AudioAnalysisFrame,
    minimumHz = 55,
    maximumHz = 1760,
): DetectedNote | null => {
    const {frequencyData, sampleRate} = frame;
    const fftSize = frequencyData.length * 2;
    const hzPerBin = sampleRate / Math.max(1, fftSize);
    const start = Math.max(1, Math.floor(minimumHz / hzPerBin));
    const end = Math.min(frequencyData.length - 1, Math.ceil(maximumHz / hzPerBin));
    let strongestIndex = start;
    let strongestValue = 0;

    // 遍历有效频率区间，记录振幅最大的桶。
    for (let index = start; index <= end; index += 1) {
        if (frequencyData[index] > strongestValue) {
            strongestValue = frequencyData[index];
            strongestIndex = index;
        }
    }

    // 过弱信号没有稳定音高，返回 null 避免音符抖动。
    if (strongestValue < 22) return null;
    const frequency = strongestIndex * hzPerBin;
    const midi = Math.max(0, Math.min(127, Math.round(69 + 12 * Math.log2(frequency / 440))));
    return {
        frequency,
        midi,
        name: NOTE_NAMES[midi % 12],
        octave: Math.floor(midi / 12) - 1,
        strength: strongestValue / 255,
    };
};

/** 计算频谱质心，用 0-1 表示声音从低沉到明亮的位置。 */
export const getSpectralCentroid = (frame: AudioAnalysisFrame) => {
    let weightedTotal = 0;
    let magnitudeTotal = 0;
    for (let index = 1; index < frame.frequencyData.length; index += 1) {
        const magnitude = frame.frequencyData[index];
        weightedTotal += index * magnitude;
        magnitudeTotal += magnitude;
    }
    const centroidIndex = magnitudeTotal ? weightedTotal / magnitudeTotal : 0;
    return Math.min(1, centroidIndex / Math.max(1, frame.frequencyData.length * 0.38));
};

/** 返回大三和弦的根音、三音和五音音级。 */
export const getMajorChordNotes = (root: number) => [root % 12, (root + 4) % 12, (root + 7) % 12];

/** 把歌曲名稳定转换为无符号整数，用于生成可复现的视觉种子。 */
export const hashText = (value: string) => {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

/** 使用整数种子生成 0-1 的稳定伪随机数。 */
export const seededRandom = (seed: number) => {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return value - Math.floor(value);
};
