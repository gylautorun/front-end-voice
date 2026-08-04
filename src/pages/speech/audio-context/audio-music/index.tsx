import React from 'react';
import musicLink from './春涧.mp3';
import style from './style.module.scss';
import {AudioContextManager} from './AudioContextManager';

/**
 * 当前实际连接到分析器的音源。
 * - `default`：页面内置的默认 `<audio>` 音频。
 * - `uploaded`：用户通过文件选择器上传的音频。
 * - `mic`：用户授权后获取的实时麦克风输入。
 * - `null`：当前没有正在播放或采集的音源。
 */
type CurrentAudio = 'default' | 'uploaded' | 'mic' | null;

/**
 * 麦克风真实输入信号的检测状态。
 * - `idle`：麦克风尚未启动或已经停止，不执行电平判断。
 * - `checking`：麦克风已连接，正在收集初始采样判断是否有输入。
 * - `active`：检测到超过静音阈值的输入，Canvas 应显示动态频谱。
 * - `silent`：音轨处于活动状态，但连续一段时间未检测到有效输入。
 * - `muted`：浏览器或操作系统报告当前麦克风音轨已静音。
 */
type MicrophoneSignal = 'idle' | 'checking' | 'active' | 'silent' | 'muted';

interface MicrophoneOption {
  deviceId: string;
  label: string;
}

/** 页面交互层所需的最小状态。 */
interface AudioMusicState {
  /** 当前生效音源。 */
  currentAudio: CurrentAudio;
  /** 可以直接展示给用户的播放、上传或麦克风错误。 */
  error: string;
  /** 是否仍在等待麦克风授权。 */
  isRequestingMic: boolean;
  /** 当前上传文件的 Blob URL；空字符串表示未选择文件。 */
  uploadedAudioUrl: string;
  /** 授权后可用的音频输入设备。 */
  microphoneDevices: MicrophoneOption[];
  /** 当前选择或浏览器实际启用的麦克风 ID。 */
  selectedMicrophoneId: string;
  /** 当前麦克风是否真正产生了非零采样。 */
  microphoneSignal: MicrophoneSignal;
}

/** 三种音源互斥切换并共享同一频谱 Canvas。 */
export class AudioMusic extends React.Component<Record<string, never>, AudioMusicState> {
  /** 页面默认 audio 元素。 */
  private audioRef = React.createRef<HTMLAudioElement>();
  /** 实时频谱 Canvas。 */
  private canvasRef = React.createRef<HTMLCanvasElement>();
  /** 上传 input，用于取消后清空已选择文件。 */
  private uploadRef = React.createRef<HTMLInputElement>();
  /** Web Audio 节点、音源互斥和绘制循环管理器。 */
  private audioContextManager: AudioContextManager;
  /** 每次音源操作递增，使较旧的异步结果自动失效。 */
  private transitionId = 0;
  /** 每次上传递增，防止旧文件的媒体事件影响新文件。 */
  private uploadId = 0;
  /** 卸载后禁止异步回调继续更新 React 状态。 */
  private isUnmounted = false;
  /** 持续检测实际麦克风输入电平的定时器。 */
  private microphoneMonitorId: number | null = null;

  state: AudioMusicState = {
    currentAudio: null,
    error: '',
    isRequestingMic: false,
    uploadedAudioUrl: '',
    microphoneDevices: [],
    selectedMicrophoneId: '',
    microphoneSignal: 'idle',
  };

  constructor(props: Record<string, never>) {
    super(props);
    this.audioContextManager = new AudioContextManager(this.canvasRef);
  }

  /** 默认 audio 挂载后立即注册，但等用户播放时才创建 AudioContext。 */
  componentDidMount(): void {
    if (this.audioRef.current) {
      this.audioContextManager.addAudioInstance('default', this.audioRef.current);
    }
  }

  /** 释放媒体流、Blob URL、动画帧和 AudioContext。 */
  componentWillUnmount(): void {
    this.isUnmounted = true;
    this.transitionId += 1;
    this.uploadId += 1;
    this.stopMicrophoneSignalMonitor();
    this.releaseUploadedAudio();
    this.audioContextManager.destroy();
  }

  /** 统一写入当前音源，同时结束麦克风等待状态并清除旧错误。 */
  private setActiveAudio(currentAudio: CurrentAudio): void {
    if (this.isUnmounted) return;
    this.setState({currentAudio, error: '', isRequestingMic: false});
  }

  /** 仅在组件仍挂载时展示错误。 */
  private setError(message: string): void {
    if (this.isUnmounted) return;
    this.setState({error: message, isRequestingMic: false});
  }

  /** 清除上传音频的事件、播放实例和 Blob URL。 */
  private releaseUploadedAudio(): void {
    const instance = this.audioContextManager.getAudioInstance('uploaded');
    const uploadedAudio = instance?.getAudio();
    if (uploadedAudio instanceof HTMLAudioElement) {
      uploadedAudio.oncanplay = null;
      uploadedAudio.onended = null;
      uploadedAudio.onerror = null;
      uploadedAudio.onpause = null;
    }
    this.audioContextManager.deleteAudioInstance('uploaded');
    if (this.state.uploadedAudioUrl) {
      URL.revokeObjectURL(this.state.uploadedAudioUrl);
    }
  }

  /** 默认网页 audio 开始播放时，将它设为唯一分析输入。 */
  handleDefaultPlay = async (): Promise<void> => {
    const audio = this.audioRef.current;
    if (!audio) return;
    // 用户新的播放操作会使尚未返回的麦克风请求失效。
    const currentTransitionId = ++this.transitionId;
    try {
      await this.audioContextManager.prepare();
      if (currentTransitionId !== this.transitionId || this.isUnmounted) return;
      this.audioContextManager.activateMediaElementSource('default', audio);
      this.setActiveAudio('default');
    } catch (error) {
      console.error('Failed to activate default audio:', error);
      audio.pause();
      this.setError('默认音频无法连接到分析器');
    }
  };

  /** 默认音频暂停或结束后同步清理界面活动状态。 */
  handleDefaultPause = (): void => {
    if (this.state.currentAudio === 'default') {
      this.setState({currentAudio: null});
    }
  };

  /** 创建上传音频；媒体就绪后仅在没有更新操作时自动播放。 */
  handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;

    const currentUploadId = ++this.uploadId;
    const currentTransitionId = ++this.transitionId;

    // 文件选择属于用户手势，立即发起 Context 恢复；播放前还会等待它完成。
    void this.audioContextManager.prepare().catch(error => {
      console.error('Failed to prepare audio context:', error);
      if (currentTransitionId === this.transitionId) {
        this.setError('当前浏览器无法启动音频分析器');
      }
    });
    this.releaseUploadedAudio();

    const uploadedAudioUrl = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = uploadedAudioUrl;
    this.audioContextManager.addAudioInstance('uploaded', audio);
    this.setState({
      currentAudio: this.state.currentAudio === 'uploaded' ? null : this.state.currentAudio,
      error: '',
      isRequestingMic: false,
      uploadedAudioUrl,
    });

    // canplay 可能触发多次，首次就绪后移除处理器。
    audio.oncanplay = () => {
      audio.oncanplay = null;
      // 文件已被替换时只停止旧元素，不允许它抢占新音源。
      if (this.isUnmounted || currentUploadId !== this.uploadId) {
        audio.pause();
        audio.removeAttribute('src');
        return;
      }
      // 用户在加载期间选择了其他音源时，保留上传文件但不自动播放。
      if (currentTransitionId !== this.transitionId) return;
      void this.playUploadedAudio(currentTransitionId);
    };
    audio.onpause = () => {
      if (!audio.ended && this.state.currentAudio === 'uploaded') {
        this.setState({currentAudio: null});
      }
    };
    audio.onended = () => {
      if (this.state.currentAudio === 'uploaded') {
        this.setState({currentAudio: null});
      }
    };
    audio.onerror = () => {
      if (currentUploadId === this.uploadId) {
        this.setError('上传音频无法读取，请更换文件');
      }
    };
    audio.load();
  };

  /** 播放上传音频，并忽略已经被更新操作取代的异步结果。 */
  private async playUploadedAudio(transitionId: number): Promise<void> {
    try {
      await this.audioContextManager.prepare();
      if (transitionId !== this.transitionId || this.isUnmounted) return;
      await this.audioContextManager.playAudio('uploaded');
      if (transitionId !== this.transitionId || this.isUnmounted) return;
      this.setActiveAudio('uploaded');
    } catch (error) {
      console.error('Failed to play uploaded audio:', error);
      if (transitionId === this.transitionId) {
        this.setError('上传音频播放失败');
      }
    }
  }

  /** 在上传音频的播放和暂停之间切换。 */
  handleUploadedAudioPlayPause = (): void => {
    const instance = this.audioContextManager.getAudioInstance('uploaded');
    const audio = instance?.getAudio();
    if (!(audio instanceof HTMLAudioElement)) return;

    if (this.state.currentAudio === 'uploaded' && !audio.paused) {
      this.transitionId += 1;
      this.audioContextManager.pauseAudio('uploaded');
      this.setState({currentAudio: null, isRequestingMic: false});
      return;
    }

    const currentTransitionId = ++this.transitionId;
    this.setState({isRequestingMic: false});
    void this.playUploadedAudio(currentTransitionId);
  };

  /** 取消上传，只释放上传一路，不关闭共享分析器和 Canvas 循环。 */
  handleCancelUpload = (): void => {
    this.transitionId += 1;
    this.uploadId += 1;
    const wasUploaded = this.state.currentAudio === 'uploaded';
    this.releaseUploadedAudio();
    if (this.uploadRef.current) {
      this.uploadRef.current.value = '';
    }
    this.setState({
      currentAudio: wasUploaded ? null : this.state.currentAudio,
      error: '',
      isRequestingMic: false,
      uploadedAudioUrl: '',
    });
  };

  /** 为频谱读取请求尽量原始的输入；只添加浏览器声明支持的非强制约束。 */
  private getMicrophoneConstraints(deviceId = this.state.selectedMicrophoneId): MediaStreamConstraints {
    const supportedConstraints = navigator.mediaDevices.getSupportedConstraints?.() || {};
    const audio: MediaTrackConstraints = {};
    if (deviceId) {
      audio.deviceId = {exact: deviceId};
    }
    if (supportedConstraints.echoCancellation) {
      audio.echoCancellation = {ideal: false};
    }
    if (supportedConstraints.noiseSuppression) {
      audio.noiseSuppression = {ideal: false};
    }
    if (supportedConstraints.autoGainControl) {
      audio.autoGainControl = {ideal: false};
    }
    return Object.keys(audio).length > 0 ? {audio} : {audio: true};
  }

  /** 枚举授权后可见的设备名称，并保存浏览器实际启用的输入。 */
  private async refreshMicrophoneDevices(
    audioTrack: MediaStreamTrack,
    transitionId: number,
  ): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (transitionId !== this.transitionId || this.isUnmounted) return;
      const microphoneDevices = devices
        .filter(device => device.kind === 'audioinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `麦克风 ${index + 1}`,
        }));
      const activeDeviceId = audioTrack.getSettings().deviceId
        || this.state.selectedMicrophoneId
        || microphoneDevices[0]?.deviceId
        || '';
      this.setState({
        microphoneDevices,
        selectedMicrophoneId: activeDeviceId,
      });
    } catch (error) {
      console.error('Failed to enumerate microphone devices:', error);
    }
  }

  /** 清除麦克风电平检测，避免停止后继续读取旧流。 */
  private stopMicrophoneSignalMonitor(): void {
    if (this.microphoneMonitorId === null) return;
    window.clearInterval(this.microphoneMonitorId);
    this.microphoneMonitorId = null;
  }

  /** 持续读取 RMS；安静两秒后标记无输入，后续检测到声音仍可恢复。 */
  private startMicrophoneSignalMonitor(
    audioTrack: MediaStreamTrack,
    transitionId: number,
  ): void {
    this.stopMicrophoneSignalMonitor();
    let silentSamples = 0;
    this.setState({microphoneSignal: audioTrack.muted ? 'muted' : 'checking'});
    this.microphoneMonitorId = window.setInterval(() => {
      if (
        transitionId !== this.transitionId
        || audioTrack.readyState !== 'live'
        || this.isUnmounted
      ) {
        this.stopMicrophoneSignalMonitor();
        return;
      }
      if (audioTrack.muted) {
        if (this.state.microphoneSignal !== 'muted') {
          this.setState({microphoneSignal: 'muted'});
        }
        return;
      }

      const level = this.audioContextManager.getMicrophoneSignalLevel();
      if (level >= 0.00035) {
        silentSamples = 0;
        if (this.state.microphoneSignal !== 'active') {
          this.setState({microphoneSignal: 'active'});
        }
        return;
      }

      silentSamples += 1;
      if (silentSamples >= 20 && this.state.microphoneSignal !== 'silent') {
        this.setState({microphoneSignal: 'silent'});
      }
    }, 100);
  }

  /** 请求麦克风，并在授权返回时确认该请求仍是最新操作。 */
  startSpeaking = async (deviceId = this.state.selectedMicrophoneId): Promise<void> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.setError(
        window.isSecureContext
          ? '当前浏览器不支持麦克风采集'
          : '麦克风只能在 HTTPS 或 localhost 地址下使用',
      );
      return;
    }

    const currentTransitionId = ++this.transitionId;
    this.setState({error: '', isRequestingMic: true});
    let discardLateStream = false;
    // getUserMedia 必须在点击调用栈内立即执行，不能排在异步 resume 之后。
    const streamRequest = navigator.mediaDevices
      .getUserMedia(this.getMicrophoneConstraints(deviceId))
      .then(stream => {
        if (discardLateStream) {
          stream.getTracks().forEach(track => track.stop());
          throw new DOMException('Microphone request is no longer active', 'AbortError');
        }
        return stream;
      });

    try {
      // Context 恢复与设备授权并行，二者都成功后才允许接入分析器。
      const [, stream] = await Promise.all([
        this.audioContextManager.prepare(),
        streamRequest,
      ]);
      // 请求期间若用户切换了音源或取消请求，立即关闭迟到的媒体流。
      if (currentTransitionId !== this.transitionId || this.isUnmounted) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack || audioTrack.readyState !== 'live') {
        stream.getTracks().forEach(track => track.stop());
        throw new Error('The microphone did not provide a live audio track');
      }
      audioTrack.enabled = true;
      audioTrack.onended = this.handleMicrophoneEnded;
      audioTrack.onmute = this.handleMicrophoneMuted;
      audioTrack.onunmute = this.handleMicrophoneUnmuted;

      // 授权弹窗可能使 Context 再次暂停，连接 MediaStream 前重新确认运行状态。
      await this.audioContextManager.prepare();
      if (currentTransitionId !== this.transitionId || this.isUnmounted) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      this.audioContextManager.activateMediaStream('mic', stream);
      this.setActiveAudio('mic');
      this.startMicrophoneSignalMonitor(audioTrack, currentTransitionId);
      void this.refreshMicrophoneDevices(audioTrack, currentTransitionId);
    } catch (error) {
      discardLateStream = true;
      console.error('Failed to get microphone stream:', error);
      if (currentTransitionId === this.transitionId) {
        this.setError(this.getMicrophoneErrorMessage(error));
      }
    }
  };

  /** 把浏览器的麦克风异常转换成可操作的错误信息。 */
  private getMicrophoneErrorMessage(error: unknown): string {
    if (!(error instanceof DOMException)) return '麦克风启动失败，请重新尝试';
    switch (error.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return '麦克风权限被拒绝，请在浏览器地址栏中允许访问';
      case 'NotFoundError':
        return '没有检测到可用的麦克风设备';
      case 'NotReadableError':
      case 'AbortError':
        return '麦克风暂时无法读取，请检查是否被其他应用占用';
      case 'OverconstrainedError':
        return '当前麦克风不支持请求的采集配置';
      default:
        return `麦克风启动失败（${error.name}）`;
    }
  }

  /** 停止麦克风，绘制循环保持存活以供下一音源直接复用。 */
  stopSpeaking = (): void => {
    this.transitionId += 1;
    this.stopMicrophoneSignalMonitor();
    this.audioContextManager.stopMicrophone();
    this.setState({
      currentAudio: null,
      error: '',
      isRequestingMic: false,
      microphoneSignal: 'idle',
    });
  };

  /** 切换输入设备时立即停止旧流，并以明确 deviceId 重新请求。 */
  handleMicrophoneDeviceChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    const selectedMicrophoneId = event.target.value;
    const shouldRestart = this.state.currentAudio === 'mic' || this.state.isRequestingMic;
    this.transitionId += 1;
    this.stopMicrophoneSignalMonitor();
    this.audioContextManager.stopMicrophone();
    this.setState({
      currentAudio: null,
      error: '',
      isRequestingMic: false,
      microphoneSignal: 'idle',
      selectedMicrophoneId,
    });
    if (shouldRestart) {
      void this.startSpeaking(selectedMicrophoneId);
    }
  };

  /** 浏览器报告设备暂时静音时同步诊断状态。 */
  private handleMicrophoneMuted = (): void => {
    if (this.state.currentAudio === 'mic') {
      this.setState({microphoneSignal: 'muted'});
    }
  };

  /** 设备恢复数据后重新进入电平检测。 */
  private handleMicrophoneUnmuted = (): void => {
    if (this.state.currentAudio === 'mic') {
      this.setState({microphoneSignal: 'checking'});
    }
  };

  /** 浏览器或系统主动终止麦克风轨道时同步页面状态。 */
  private handleMicrophoneEnded = (): void => {
    if (this.state.currentAudio !== 'mic') return;
    this.stopMicrophoneSignalMonitor();
    this.audioContextManager.stopMicrophone();
    this.setState({currentAudio: null, microphoneSignal: 'idle'});
  };

  /** 说话按钮同时处理开始、停止和取消等待三种状态。 */
  handleSpeak = (): void => {
    if (this.state.isRequestingMic) {
      this.transitionId += 1;
      this.setState({isRequestingMic: false});
      return;
    }
    if (this.state.currentAudio === 'mic') {
      this.stopSpeaking();
      return;
    }
    void this.startSpeaking();
  };

  render() {
    const uploadedAudioPlaying = this.state.currentAudio === 'uploaded';
    const speaking = this.state.currentAudio === 'mic';
    const microphoneSignalLabel = this.state.microphoneSignal === 'checking'
      ? '检测输入'
      : this.state.microphoneSignal === 'active'
        ? '有输入'
        : this.state.microphoneSignal === 'silent'
          ? '无输入'
          : this.state.microphoneSignal === 'muted'
            ? '设备静音'
            : '';
    const activeSourceLabel = this.state.isRequestingMic
      ? '等待麦克风授权'
      : this.state.currentAudio === 'default'
        ? '网页默认音频'
        : this.state.currentAudio === 'uploaded'
          ? '上传音频'
          : speaking
            ? `麦克风${microphoneSignalLabel ? ` · ${microphoneSignalLabel}` : ''}`
            : '无';

    return (
      <section className={style.audioMusic}>
        <div className={style.analyser}>
          <canvas
            ref={this.canvasRef}
            className={style.canvas}
            aria-label="当前音源频谱"
          />
          <span className={style.sourceStatus} aria-live="polite">
            当前音源：{activeSourceLabel}
          </span>
        </div>

        <div className={style.sourceRow}>
          <span className={style.sourceLabel}>网页 audio</span>
          <audio
            ref={this.audioRef}
            className={style.audio}
            controls
            src={musicLink}
            crossOrigin="anonymous"
            onEnded={this.handleDefaultPause}
            onPause={this.handleDefaultPause}
            onPlay={this.handleDefaultPlay}
          />
        </div>

        <div className={style.sourceRow}>
          <label className={style.sourceLabel} htmlFor="audio-music-upload">上传音频</label>
          <input
            ref={this.uploadRef}
            id="audio-music-upload"
            type="file"
            accept="audio/*"
            onChange={this.handleFileChange}
          />
          {this.state.uploadedAudioUrl && (
            <div className={style.buttonGroup}>
              <button type="button" onClick={this.handleUploadedAudioPlayPause}>
                {uploadedAudioPlaying ? '暂停' : '播放'}
              </button>
              <button type="button" onClick={this.handleCancelUpload}>取消</button>
            </div>
          )}
        </div>

        <div className={style.sourceRow}>
          <span className={style.sourceLabel}>点击说话</span>
          <button type="button" onClick={this.handleSpeak}>
            {this.state.isRequestingMic ? '取消请求' : speaking ? '停止说话' : '开始说话'}
          </button>
          {this.state.microphoneDevices.length > 0 && (
            <select
              className={style.deviceSelect}
              aria-label="麦克风设备"
              value={this.state.selectedMicrophoneId}
              onChange={this.handleMicrophoneDeviceChange}
            >
              {this.state.microphoneDevices.map(device => (
                <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
              ))}
            </select>
          )}
        </div>

        {speaking && this.state.microphoneSignal === 'silent' && (
          <div className={style.warning} role="status">
            当前麦克风没有检测到输入，请切换麦克风设备或检查系统输入音量
          </div>
        )}

        {speaking && this.state.microphoneSignal === 'muted' && (
          <div className={style.warning} role="status">
            当前麦克风设备处于静音状态
          </div>
        )}

        {this.state.error && (
          <div className={style.error} role="alert">{this.state.error}</div>
        )}
      </section>
    );
  }
}
