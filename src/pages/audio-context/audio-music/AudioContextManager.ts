import React from 'react';

/**
 * 音频实例类
 * 负责单个音频实例的管理
 */
export class AudioInstance {
  private audio: HTMLAudioElement | MediaStream;
  private key: string;

  constructor(key: string, audio: HTMLAudioElement | MediaStream) {
    this.key = key;
    this.audio = audio;
  }

  /**
   * 播放音频
   */
  play(): Promise<void> {
    if (this.audio instanceof HTMLAudioElement) {
      return this.audio.play();
    }
    return Promise.resolve();
  }

  /**
   * 暂停音频
   */
  pause(): void {
    if (this.audio instanceof HTMLAudioElement) {
      this.audio.pause();
    }
  }

  /**
   * 停止音频
   */
  stop(): void {
    if (this.audio instanceof HTMLAudioElement) {
      this.audio.pause();
      this.audio.currentTime = 0;
    } else if (this.audio instanceof MediaStream) {
      this.audio.getTracks().forEach(track => track.stop());
    }
  }

  /**
   * 获取音频实例
   */
  getAudio(): HTMLAudioElement | MediaStream {
    return this.audio;
  }

  /**
   * 获取音频实例的键
   */
  getKey(): string {
    return this.key;
  }

  /**
   * 检查是否是媒体流
   */
  isMediaStream(): boolean {
    return this.audio instanceof MediaStream;
  }

  /**
   * 检查是否是音频元素
   */
  isAudioElement(): boolean {
    return this.audio instanceof HTMLAudioElement;
  }
}

/**
 * 音频上下文管理器
 * 负责音频上下文的创建、管理和销毁
 * 包含音频源的连接、音频波形的绘制等功能
 * 注意：同一 HTMLAudioElement 只能调用一次 createMediaElementSource，因此会缓存并复用 MediaElementAudioSourceNode
 */
export class AudioContextManager {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  /** 当前用于播放的媒体元素源（仅一个处于连接状态） */
  private currentElementSource: MediaElementAudioSourceNode | null = null;
  private streamSource: MediaStreamAudioSourceNode | null = null;
  private animationFrameId: number | null = null;
  private audioInstances: Map<string, AudioInstance> = new Map();
  private canvasRef: React.RefObject<HTMLCanvasElement>;
  /** 每个 audio 元素只能创建一次 MediaElementAudioSourceNode，按元素缓存 */
  private elementSourceCache: WeakMap<HTMLAudioElement, MediaElementAudioSourceNode> = new WeakMap();

  /**
   * 构造函数
   * @param canvasRef Canvas 引用，用于绘制音频波形
   */
  constructor(canvasRef: React.RefObject<HTMLCanvasElement>) {
    this.canvasRef = canvasRef;
  }

  /**
   * 确保音频上下文和分析器存在（不关闭已有 context，避免同一 audio 重复 createMediaElementSource）
   */
  ensureContext(): void {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }
      return;
    }
    this.audioContext = new AudioContext();
    this.createAnalyser();
    this.startDrawing();
  }

  /**
   * 准备用于麦克风等流式输入（断开当前 element 源，复用同一 context）
   */
  create(): void {
    this.disconnectMediaElementSource();
    this.disconnectStreamSource();
    this.ensureContext();
    this.startDrawing();
  }

  /**
   * 创建分析器，用于分析音频波形
   */
  private createAnalyser(): void {
    if (!this.audioContext) return;
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;
    this.analyser.connect(this.audioContext.destination);
  }

  /**
   * 获取或创建媒体元素音频源（同一 audio 只创建一次，否则会 InvalidStateError）
   */
  private getOrCreateMediaElementSource(audio: HTMLAudioElement): MediaElementAudioSourceNode {
    let source = this.elementSourceCache.get(audio);
    if (source && this.audioContext && source.context === this.audioContext) {
      return source;
    }
    if (!this.audioContext) return null!;
    source = this.audioContext.createMediaElementSource(audio);
    this.elementSourceCache.set(audio, source);
    return source;
  }

  /**
   * 将指定音频元素连接到分析器并用于播放（会断开之前的 element 源）
   */
  connectMediaElementSource(audio: HTMLAudioElement): void {
    this.ensureContext();
    if (!this.analyser) return;
    this.stopDrawing();
    if (this.currentElementSource) {
      try {
        this.currentElementSource.disconnect();
      } catch {
        // ignore
      }
      this.currentElementSource = null;
    }
    const source = this.getOrCreateMediaElementSource(audio);
    source.connect(this.analyser);
    this.currentElementSource = source;
    this.startDrawing();
  }

  /**
   * 断开当前媒体元素源（不关闭 context）
   */
  disconnectMediaElementSource(): void {
    if (this.currentElementSource) {
      try {
        this.currentElementSource.disconnect();
      } catch {
        // ignore
      }
      this.currentElementSource = null;
    }
  }

  private disconnectStreamSource(): void {
    if (this.streamSource) {
      try {
        this.streamSource.disconnect();
      } catch {
        // ignore
      }
      this.streamSource = null;
    }
  }

  /**
   * 创建媒体流音频源
   * @param stream 媒体流
   */
  createMediaStreamSource(stream: MediaStream): void {
    this.ensureContext();
    if (!this.audioContext) return;
    this.disconnectMediaElementSource();
    this.streamSource = this.audioContext.createMediaStreamSource(stream);
    if (this.analyser) {
      this.streamSource.connect(this.analyser);
    }
  }

  /**
   * 开始绘制音频波形
   */
  startDrawing(): void {
    this.stopDrawing();
    
    if (!this.analyser) return;
    
    // 获取 bufferLength
    const bufferLength = this.analyser.frequencyBinCount;
    // 创建 dataArray
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      if (!this.canvasRef.current) {
        return;
      }
      const canvas = this.canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      const w = canvas.width;
      const h = canvas.height;
      const barWidth = Math.floor((0.5 * w / bufferLength));
      let barHeight: number;
      let x = 0;
      
      ctx.clearRect(0, 0, w, h);
      // 分析器获取音频数据“切片”
      if (this.analyser) {
        this.analyser.getByteFrequencyData(dataArray);
        
        ctx.fillStyle = '#00ffdd';
        //把每个音频“切片”画在画布上
        for (let i = 0; i < bufferLength; i++) {
          barHeight = Math.floor((0.4 * dataArray[i]));
          ctx.fillRect(x, h - barHeight, barWidth, barHeight);
          x += barWidth + 2;
        }
      }
      
      this.animationFrameId = requestAnimationFrame(draw);
    };
    
    this.animationFrameId = requestAnimationFrame(draw);
  }

  /**
   * 停止绘制音频波形
   */
  stopDrawing(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * 暂停指定音频
   * @param key 音频实例的键
   */
  pauseAudio(key: string): void {
    const audioInstance = this.audioInstances.get(key);
    if (audioInstance) {
      audioInstance.pause();
    }
  }

  /**
   * 停止指定音频
   * @param key 音频实例的键
   */
  stopAudio(key: string): void {
    const audioInstance = this.audioInstances.get(key);
    if (audioInstance) {
      audioInstance.stop();
    }
  }

  /**
   * 暂停默认音频
   * @param audioRef 音频元素引用
   */
  pauseDefaultAudio(audioRef: React.RefObject<HTMLAudioElement>): void {
    const defaultAudio = audioRef.current;
    if (defaultAudio) {
      defaultAudio.pause();
    }
  }

  /**
   * 断开所有源并停止绘制（不关闭 context，同一 HTMLAudioElement 只能关联一个 MediaElementAudioSourceNode，关闭后无法再播）
   */
  closeAudioContext(): void {
    this.disconnectMediaElementSource();
    this.disconnectStreamSource();
    this.stopDrawing();
    this.clearCanvas();
  }

  /**
   * 清空 canvas，避免切换音源时残留上一路波形
   */
  private clearCanvas(): void {
    if (!this.canvasRef.current) return;
    const ctx = this.canvasRef.current.getContext('2d');
    if (ctx) {
      const { width, height } = this.canvasRef.current;
      ctx.clearRect(0, 0, width, height);
    }
  }

  /**
   * 仅断开源与绘制，不关闭 context（用于切换源时）
   */
  disconnectAllSources(): void {
    this.disconnectMediaElementSource();
    this.disconnectStreamSource();
    this.stopDrawing();
  }

  /**
   * 清理并关闭音频上下文（仅在取消上传等需要完全释放时调用）
   */
  cleanup(): void {
    this.closeAudioContext();
  }

  /**
   * 设置音频上下文并播放音频（复用同一 context 与 element source，避免暂停后再播报错）
   * @param audio 音频元素
   */
  setupAudioContextAndPlay(audio: HTMLAudioElement): void {
    try {
      this.ensureContext();
      this.connectMediaElementSource(audio);
      audio.play().catch(error => {
        console.error('Error playing audio:', error);
      });
    } catch (error) {
      console.error('Error setting up audio context:', error);
    }
  }

  /**
   * 添加音频实例
   * @param key 键
   * @param audio 音频元素或媒体流
   * @returns 音频实例
   */
  addAudioInstance(key: string, audio: HTMLAudioElement | MediaStream): AudioInstance {
    const audioInstance = new AudioInstance(key, audio);
    this.audioInstances.set(key, audioInstance);
    return audioInstance;
  }

  /**
   * 获取音频实例
   * @param key 键
   * @returns 音频实例
   */
  getAudioInstance(key: string): AudioInstance | undefined {
    return this.audioInstances.get(key);
  }

  /**
   * 删除音频实例
   * @param key 键
   */
  deleteAudioInstance(key: string): void {
    const audioInstance = this.audioInstances.get(key);
    if (audioInstance) {
      audioInstance.stop();
      this.audioInstances.delete(key);
    }
  }

  /**
   * 清除所有音频实例
   */
  clearAllAudioInstances(): void {
    this.audioInstances.forEach(audioInstance => {
      audioInstance.stop();
    });
    this.audioInstances.clear();
  }

  /**
   * 销毁音频上下文管理器（仅此处真正关闭 context）
   */
  destroy(): void {
    this.disconnectMediaElementSource();
    this.disconnectStreamSource();
    this.stopDrawing();
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch {
        // ignore
      }
      this.analyser = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.clearAllAudioInstances();
  }
}
