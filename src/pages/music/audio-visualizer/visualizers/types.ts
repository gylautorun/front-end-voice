/** 用户可以切换的三种音乐可视化模式。 */
export type VisualizationMode = 'bars' | 'mirror' | 'orb';

/** 每种可视化模式在界面中的名称。 */
export const VISUALIZATION_MODE_LABELS: Record<VisualizationMode, string> = {
    bars: '频谱柱',
    mirror: '镜像波形',
    orb: '球形水滴波纹',
};

/** 每种 Canvas 图形提供给辅助技术的完整说明。 */
export const VISUALIZATION_MODE_ARIA_LABELS: Record<VisualizationMode, string> = {
    bars: '音乐频谱柱状图',
    mirror: '中间基线上下对称的窄柱音乐波形图',
    orb: '球形水滴波纹音乐可视化',
};

/** 单次绘制使用的 Canvas 上下文和 CSS 像素尺寸。 */
export interface CanvasScene {
    /** 当前 Canvas 的二维绘图上下文。 */
    context: CanvasRenderingContext2D;
    /** Canvas 的 CSS 像素高度。 */
    height: number;
    /** Canvas 的 CSS 像素宽度。 */
    width: number;
}

/** 从 AnalyserNode 读取并传给绘制器的当前音频帧。 */
export interface AudioFrame {
    /** FFT 每帧生成的 0-255 频域幅度。 */
    frequencyData: Uint8Array;
    /** AnalyserNode 当前使用的 FFT 点数。 */
    fftSize: number;
    /** 当前媒体是否正在播放。 */
    isPlaying: boolean;
    /** 音频上下文的实际采样率。 */
    sampleRate: number;
    /** 用户选择的可视化幅度倍率。 */
    sensitivity: number;
    /** requestAnimationFrame 提供的高精度时间戳。 */
    timestamp: number;
    /** 0-255 时域采样，128 表示零电平。 */
    timeData: Uint8Array;
}

/** 普通频谱柱需要跨动画帧保存的峰值。 */
export interface BarsState {
    /** 与当前柱数量一一对应的峰值高度。 */
    peaks: number[];
}

/** 镜像波形跨帧保存的平滑高度。 */
export interface MirrorState {
    /** 与当前窄柱数量一一对应的缓动高度。 */
    levels: number[];
}

/** 一个从球体边缘向外移动的水滴粒子。 */
export interface Droplet {
    /** 水滴围绕球心的弧度方向。 */
    angle: number;
    /** 水滴当前到球心的像素距离。 */
    distance: number;
    /** 从 1 递减到 0 的生命周期，同时控制透明度。 */
    life: number;
    /** 水滴初始半径。 */
    size: number;
    /** 水滴每帧向外移动的像素数。 */
    speed: number;
}

/** 球形波纹绘制器需要跨帧保存的粒子状态。 */
export interface OrbState {
    /** 当前仍处于生命周期内的水滴。 */
    droplets: Droplet[];
    /** 上一次生成水滴时的 requestAnimationFrame 时间戳。 */
    lastDropTime: number;
}
