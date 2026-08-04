import React from 'react';

/** 管理一个可播放音频元素或麦克风媒体流。 */
export class AudioInstance {
  private audio: HTMLAudioElement | MediaStream;
  private key: string;

  constructor(key: string, audio: HTMLAudioElement | MediaStream) {
    this.key = key;
    this.audio = audio;
  }

  /** 播放音频元素；MediaStream 启用后会自动产生数据。 */
  play(): Promise<void> {
    if (this.audio instanceof HTMLAudioElement) {
      return this.audio.play();
    }
    return Promise.resolve();
  }

  /** 暂停音频元素。 */
  pause(): void {
    if (this.audio instanceof HTMLAudioElement) {
      this.audio.pause();
    }
  }

  /** 停止并重置音频元素，或关闭媒体流的全部轨道。 */
  stop(): void {
    if (this.audio instanceof HTMLAudioElement) {
      this.audio.pause();
      this.audio.currentTime = 0;
      return;
    }
    this.audio.getTracks().forEach(track => track.stop());
  }

  /** 返回底层音频对象。 */
  getAudio(): HTMLAudioElement | MediaStream {
    return this.audio;
  }

  /** 返回实例在管理器中的唯一键。 */
  getKey(): string {
    return this.key;
  }
}

/**
 * 在默认音乐、上传音频和麦克风之间提供互斥的 Web Audio 输入。
 * AudioContext、AnalyserNode 和绘制循环在切换时复用，仅组件卸载时销毁。
 */
export class AudioContextManager {
  /** 当前页面唯一的音频上下文。 */
  private audioContext: AudioContext | null = null;
  /** 三种音源共用的频谱分析器。 */
  private analyser: AnalyserNode | null = null;
  /** 以近乎静音的非零增益保持麦克风分析支路被浏览器持续处理。 */
  private analysisSink: GainNode | null = null;
  /** 当前连接到分析器的媒体元素节点。 */
  private currentElementSource: MediaElementAudioSourceNode | null = null;
  /** 当前连接到分析器的麦克风节点。 */
  private streamSource: MediaStreamAudioSourceNode | null = null;
  /** 当前真正生效的音源 key。 */
  private activeSourceKey: string | null = null;
  /** 页面内唯一的 Canvas 动画帧。 */
  private animationFrameId: number | null = null;
  /** 复用的时域采样缓冲，用于判断真实麦克风是否有输入。 */
  private timeDomainData = new Float32Array(0);
  /** 默认、上传和麦克风对应的底层实例。 */
  private audioInstances = new Map<string, AudioInstance>();
  /** 同一 audio 元素只能创建一次 MediaElementAudioSourceNode。 */
  private elementSourceCache = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();
  /** Canvas DOM 引用。 */
  private canvasRef: React.RefObject<HTMLCanvasElement>;

  constructor(canvasRef: React.RefObject<HTMLCanvasElement>) {
    this.canvasRef = canvasRef;
  }

  /** 创建或恢复唯一 AudioContext，并确保绘制循环正在运行。 */
  private ensureContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      // 1024 点 FFT 在保持较低绘制成本的同时提供足够的频谱细节。
      analyser.fftSize = 1024;
      analyser.minDecibels = -92;
      analyser.maxDecibels = -12;
      analyser.smoothingTimeConstant = 0.72;

      // 某些浏览器不会持续处理无输出的麦克风图；非零的 -120 dB 增益可保持图活跃，
      // 同时远低于可听阈值，不会产生麦克风监听或啸叫。
      const analysisSink = context.createGain();
      analysisSink.gain.value = 0.000001;
      analyser.connect(analysisSink);
      analysisSink.connect(context.destination);

      this.audioContext = context;
      this.analyser = analyser;
      this.analysisSink = analysisSink;
    }

    this.startDrawing();
    return this.audioContext;
  }

  /** 在用户手势内创建并恢复 Context；失败时由交互层显示原因。 */
  async prepare(): Promise<void> {
    const context = this.ensureContext();
    if (context.state === 'suspended') {
      await context.resume();
    }
    if (context.state !== 'running') {
      throw new Error(`AudioContext is ${context.state}`);
    }
  }

  /** 获取或创建指定 audio 元素的媒体源节点。 */
  private getOrCreateMediaElementSource(
    audio: HTMLAudioElement,
    context: AudioContext,
  ): MediaElementAudioSourceNode {
    const cachedSource = this.elementSourceCache.get(audio);
    if (cachedSource) return cachedSource;
    const source = context.createMediaElementSource(audio);
    this.elementSourceCache.set(audio, source);
    return source;
  }

  /** 安全断开一个音频节点的全部输出。 */
  private disconnectNode(node: AudioNode | null): void {
    if (!node) return;
    try {
      node.disconnect();
    } catch {
      // 节点可能已经在前一次切换中断开。
    }
  }

  /** 断开当前输入节点，但保留上下文、分析器和绘制循环。 */
  private disconnectActiveSource(): void {
    this.disconnectNode(this.currentElementSource);
    this.disconnectNode(this.streamSource);
    this.currentElementSource = null;
    this.streamSource = null;
    this.activeSourceKey = null;
  }

  /** 暂停除目标之外的所有 HTMLAudioElement，保证实际播放互斥。 */
  private pauseElementSourcesExcept(activeKey: string): void {
    this.audioInstances.forEach(instance => {
      const audio = instance.getAudio();
      if (instance.getKey() !== activeKey && audio instanceof HTMLAudioElement) {
        audio.pause();
      }
    });
  }

  /**
   * 将网页默认 audio 或上传 audio 设为唯一输入。
   * 音频一路直连扬声器，另一路进入近乎静音的分析器支路。
   */
  activateMediaElementSource(key: string, audio: HTMLAudioElement): void {
    const context = this.ensureContext();
    // 正常入口会先 await prepare；这里保留恢复调用以兼容 audio 原生 play 事件。
    if (context.state === 'suspended') {
      void context.resume().catch(() => undefined);
    }
    this.addAudioInstance(key, audio);
    this.pauseElementSourcesExcept(key);

    // 从麦克风切换回来时立即停止采集并释放权限指示。
    if (this.activeSourceKey === 'mic') {
      this.stopMicrophone();
    }
    // 已连接同一个元素时不重复 connect，避免重复输出和音量叠加。
    if (this.activeSourceKey === key && this.currentElementSource) {
      this.restartDrawing();
      return;
    }

    this.disconnectActiveSource();
    const source = this.getOrCreateMediaElementSource(audio, context);
    if (!this.analyser) return;
    source.connect(this.analyser);
    source.connect(context.destination);
    this.currentElementSource = source;
    this.activeSourceKey = key;
    this.clearCanvas();
    this.restartDrawing();
  }

  /** 激活并播放一个已经注册的网页或上传音频。 */
  async playAudio(key: string): Promise<void> {
    const instance = this.audioInstances.get(key);
    const audio = instance?.getAudio();
    if (!(audio instanceof HTMLAudioElement)) return;
    this.activateMediaElementSource(key, audio);
    await audio.play();
  }

  /**
   * 将麦克风流设为唯一输入。
   * 麦克风只经过 -120 dB 的分析输出，不会产生可听回授或啸叫。
   */
  activateMediaStream(key: string, stream: MediaStream): void {
    const context = this.ensureContext();
    if (context.state !== 'running') {
      throw new Error(`Cannot activate microphone while AudioContext is ${context.state}`);
    }
    this.pauseElementSourcesExcept(key);
    this.stopMicrophone();
    this.disconnectActiveSource();
    this.addAudioInstance(key, stream);
    this.streamSource = context.createMediaStreamSource(stream);
    if (!this.analyser) return;
    this.streamSource.connect(this.analyser);
    this.activeSourceKey = key;
    this.clearCanvas();
    // 权限弹窗可能暂停先前的动画帧，麦克风接入后强制恢复唯一绘制循环。
    this.restartDrawing();
  }

  /** 暂停指定音频元素，不终止全局绘制循环。 */
  pauseAudio(key: string): void {
    this.audioInstances.get(key)?.pause();
  }

  /** 停止并重置指定音源；当前输入会同时从图中断开。 */
  stopAudio(key: string): void {
    const instance = this.audioInstances.get(key);
    if (!instance) return;
    instance.stop();
    if (this.activeSourceKey === key) {
      this.disconnectActiveSource();
      this.clearCanvas();
    }
  }

  /** 停止麦克风、断开节点并删除已经结束的 MediaStream。 */
  stopMicrophone(): void {
    const microphone = this.audioInstances.get('mic');
    microphone?.stop();
    if (this.activeSourceKey === 'mic' || this.streamSource) {
      this.disconnectActiveSource();
      this.clearCanvas();
    }
    this.audioInstances.delete('mic');
  }

  /** 添加或替换一个音频实例。 */
  addAudioInstance(key: string, audio: HTMLAudioElement | MediaStream): AudioInstance {
    const currentInstance = this.audioInstances.get(key);
    if (currentInstance?.getAudio() === audio) return currentInstance;
    if (currentInstance) this.deleteAudioInstance(key);
    const audioInstance = new AudioInstance(key, audio);
    this.audioInstances.set(key, audioInstance);
    return audioInstance;
  }

  /** 获取已注册的音频实例。 */
  getAudioInstance(key: string): AudioInstance | undefined {
    return this.audioInstances.get(key);
  }

  /** 返回当前麦克风的 RMS 电平；0 表示没有活动流或采样为静音。 */
  getMicrophoneSignalLevel(): number {
    if (this.activeSourceKey !== 'mic' || !this.analyser) return 0;
    if (this.timeDomainData.length !== this.analyser.fftSize) {
      this.timeDomainData = new Float32Array(this.analyser.fftSize);
    }
    this.analyser.getFloatTimeDomainData(this.timeDomainData);
    let squareSum = 0;
    for (let index = 0; index < this.timeDomainData.length; index += 1) {
      squareSum += this.timeDomainData[index] ** 2;
    }
    return Math.sqrt(squareSum / Math.max(1, this.timeDomainData.length));
  }

  /** 删除指定实例，并释放它仍占用的播放或采集资源。 */
  deleteAudioInstance(key: string): void {
    const audioInstance = this.audioInstances.get(key);
    if (!audioInstance) return;
    audioInstance.stop();
    if (this.activeSourceKey === key) {
      this.disconnectActiveSource();
      this.clearCanvas();
    }
    this.audioInstances.delete(key);
  }

  /** 启动唯一的 requestAnimationFrame 频谱绘制循环。 */
  private startDrawing(): void {
    // 音源切换只替换输入，不重复创建动画循环。
    if (this.animationFrameId !== null) return;

    // 分析器固定复用，因此频域数组也跨帧复用，避免每秒创建大量临时对象。
    let frequencyData = new Uint8Array(this.analyser?.frequencyBinCount || 0);
    const draw = () => {
      try {
        const analyser = this.analyser;
        const canvas = this.canvasRef.current;
        if (analyser && canvas) {
          const cssWidth = Math.max(1, canvas.clientWidth);
          const cssHeight = Math.max(1, canvas.clientHeight);
          const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
          const bufferWidth = Math.round(cssWidth * pixelRatio);
          const bufferHeight = Math.round(cssHeight * pixelRatio);

          // 同步 Canvas 物理缓冲区，修复 CSS 拉伸导致的模糊和柱形比例错误。
          if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
            canvas.width = bufferWidth;
            canvas.height = bufferHeight;
          }

          const context = canvas.getContext('2d');
          if (context) {
            context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            context.clearRect(0, 0, cssWidth, cssHeight);

            if (frequencyData.length !== analyser.frequencyBinCount) {
              frequencyData = new Uint8Array(analyser.frequencyBinCount);
            }
            analyser.getByteFrequencyData(frequencyData);
            // 根据画布宽度控制柱数，使桌面与窄屏都能完整铺满。
            const barCount = Math.min(112, Math.max(32, Math.floor(cssWidth / 7)));
            const gap = 2;
            const barWidth = Math.max(1, (cssWidth - gap * (barCount - 1)) / barCount);
            const maxBarHeight = Math.max(1, cssHeight - 18);
            const gradient = context.createLinearGradient(0, cssHeight, 0, 0);
            gradient.addColorStop(0, '#26c995');
            gradient.addColorStop(0.58, '#54a8e8');
            gradient.addColorStop(1, '#f2c75c');
            context.fillStyle = gradient;

            // 人声集中在较低频段；麦克风使用 8 kHz 上限，让短促说话声铺开更多柱。
            const isMicrophone = this.activeSourceKey === 'mic';
            const maximumFrequency = isMicrophone ? 8000 : 18000;
            const frequencyPerBin = this.audioContext
              ? this.audioContext.sampleRate / analyser.fftSize
              : 1;
            const relevantBinCount = Math.min(
              frequencyData.length,
              Math.max(barCount, Math.ceil(maximumFrequency / frequencyPerBin)),
            );
            const expandableBins = Math.max(0, relevantBinCount - barCount);

            for (let index = 0; index < barCount; index += 1) {
              // 每根柱至少占一个独立 bin；多余 bin 按 1.65 次曲线向高频逐步合并。
              const startRatio = index / barCount;
              const endRatio = (index + 1) / barCount;
              const startBin = index + Math.floor(startRatio ** 1.65 * expandableBins);
              const endBin = index + 1 + Math.floor(endRatio ** 1.65 * expandableBins);
              let sum = 0;
              let peak = 0;
              for (let bin = startBin; bin < Math.min(endBin, relevantBinCount); bin += 1) {
                const value = frequencyData[bin];
                sum += value;
                peak = Math.max(peak, value);
              }
              const sampledBins = Math.max(1, Math.min(endBin, relevantBinCount) - startBin);
              const average = sum / sampledBins;
              // 峰值保留节拍冲击，平均值保持柱高连续。
              const rawValue = (peak * 0.58 + average * 0.42) / 255;
              // 麦克风电平通常远低于已母带处理的音乐，仅放大显示值，不改变录音声音。
              const normalizedValue = Math.min(1, rawValue * (isMicrophone ? 2.35 : 1));
              const barHeight = normalizedValue > 0.015
                ? Math.max(2, normalizedValue * maxBarHeight)
                : 1;
              const x = index * (barWidth + gap);
              context.fillRect(x, cssHeight - barHeight, barWidth, barHeight);
            }
          }
        }
      } finally {
        // 即使某一帧因 Canvas 状态变化失败，下一帧仍会继续更新。
        this.animationFrameId = requestAnimationFrame(draw);
      }
    };

    this.animationFrameId = requestAnimationFrame(draw);
  }

  /** 音源切换后重新安排唯一动画帧，避免权限弹窗留下失效的帧 ID。 */
  private restartDrawing(): void {
    this.stopDrawing();
    this.startDrawing();
  }

  /** 停止 Canvas 绘制，仅在组件销毁时调用。 */
  private stopDrawing(): void {
    if (this.animationFrameId === null) return;
    cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
  }

  /** 清空 Canvas，避免切换瞬间残留上一路频谱。 */
  private clearCanvas(): void {
    const canvas = this.canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
  }

  /** 组件卸载时释放所有音源、动画帧和 AudioContext。 */
  destroy(): void {
    this.stopDrawing();
    this.disconnectActiveSource();
    [...this.audioInstances.values()].forEach(instance => instance.stop());
    this.audioInstances.clear();
    this.disconnectNode(this.analyser);
    this.disconnectNode(this.analysisSink);
    this.analyser = null;
    this.analysisSink = null;
    this.timeDomainData = new Float32Array(0);
    if (this.audioContext && this.audioContext.state !== 'closed') {
      void this.audioContext.close().catch(() => undefined);
    }
    this.audioContext = null;
    this.clearCanvas();
  }
}
