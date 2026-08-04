/**
 * 振荡器支持的基础波形。
 * - `sine`：正弦波，声音最柔和，只有基频。
 * - `square`：方波，奇次谐波明显，声音较硬。
 * - `sawtooth`：锯齿波，包含丰富谐波，声音明亮。
 * - `triangle`：三角波，谐波少于方波，听感相对柔和。
 */
export type WaveformType = 'sine' | 'square' | 'sawtooth' | 'triangle';

/**
 * 停止声音时使用的音量自动化曲线。
 * - `linearRampToValueAtTime`：音量按固定速度线性降低。
 * - `exponentialRampToValueAtTime`：音量先快后慢地降低，更接近自然衰减。
 */
export type GainChangeType =
  | 'linearRampToValueAtTime'
  | 'exponentialRampToValueAtTime';

/** 振荡器表单中的完整可调参数。 */
export interface AudioSoundSettings {
  /** 停止播放时的音量衰减方式。 */
  gainChangeType: GainChangeType;
  /** 输出音量，范围为 0 到 1。 */
  gain: number;
  /** OscillatorNode 产生的基础波形。 */
  type: WaveformType;
  /** 振荡频率，单位为 Hz。 */
  frequency: number;
}

/**
 * 合成器的运行阶段。
 * - `idle`：没有活动振荡器，可以开始播放。
 * - `starting`：正在恢复 AudioContext 并创建振荡器。
 * - `playing`：振荡器已经连接输出并持续发声。
 * - `stopping`：正在执行短暂淡出，避免停止时产生爆音。
 */
export type PlaybackStatus = 'idle' | 'starting' | 'playing' | 'stopping';
