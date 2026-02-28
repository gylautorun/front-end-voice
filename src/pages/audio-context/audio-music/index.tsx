import React from 'react'
import musicLink from './春涧.mp3';
import style from './style.module.scss';
import { AudioContextManager } from './AudioContextManager';

interface AudioMusicState {
  cancelVisible: boolean;
  speaking: boolean;
  currentAudio: 'default' | 'uploaded' | 'mic';
  uploadedAudioPlaying: boolean;
}

export class AudioMusic extends React.Component<Record<string, never>, AudioMusicState> {
  private audioRef = React.createRef<HTMLAudioElement>();
  private canvasRef = React.createRef<HTMLCanvasElement>();
  private uploadRef = React.createRef<HTMLInputElement>();
  private audioContextManager: AudioContextManager;
  state: AudioMusicState = {
    cancelVisible: false,
    speaking: false,
    currentAudio: 'default',
    uploadedAudioPlaying: false,
  };
  stream: string = '';
  constructor(props: Record<string, never>) {
    super(props);
    this.audioContextManager = new AudioContextManager(this.canvasRef);
  }

  componentDidMount(): void {
  }

  componentWillUnmount(): void {
    // 销毁音频上下文管理器
    this.audioContextManager.destroy();
  }

  handlePlay = () => {
    // 播放默认音频
    const audio = this.audioRef.current;
    if (audio) {
      audio.crossOrigin = 'anonymous';
      try {
        // 停止麦克风并暂停上传音频
        this.audioContextManager.stopAudio('mic');
        this.audioContextManager.pauseAudio('uploaded');
        // 设置音频上下文并播放
        this.audioContextManager.setupAudioContextAndPlay(audio);
        // 更新当前音频状态
        this.setState({
          speaking: false,
          currentAudio: 'default',
          uploadedAudioPlaying: false,
        });
      } catch (error) {
        console.error('Error creating audio context:', error);
      }
    }
  }

  handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      this.stream = URL.createObjectURL(file);
      const audio = new Audio();
      audio.src = this.stream;
      // 暂停默认音频
      this.audioContextManager.pauseDefaultAudio(this.audioRef);
      
      audio.oncanplay = () => {
        try {
          // 停止麦克风并关闭音频上下文
          this.audioContextManager.stopAudio('mic');
          this.audioContextManager.closeAudioContext();
          // 保存上传的音频实例到 map
          this.audioContextManager.addAudioInstance('uploaded', audio);
          // 设置音频上下文并播放
          this.audioContextManager.setupAudioContextAndPlay(audio);
          // 更新当前音频状态
          this.setState({
            cancelVisible: true,
            speaking: false,
            currentAudio: 'uploaded',
            uploadedAudioPlaying: true,
          });
        } catch (error) {
          console.error('Error creating audio context:', error);
        }
      };
      // 监听上传音频结束事件
      audio.onended = () => {
        this.setState({ currentAudio: 'default', uploadedAudioPlaying: false });
      };
    }
  };

  /** 上传音频的播放/暂停（复用同一 context，避免暂停后再播报错） */
  handleUploadedAudioPlayPause = () => {
    const instance = this.audioContextManager.getAudioInstance('uploaded');
    const audio = instance?.getAudio();
    if (!audio || !(audio instanceof HTMLAudioElement)) return;
    if (this.state.uploadedAudioPlaying) {
      this.audioContextManager.pauseAudio('uploaded');
      this.setState({ uploadedAudioPlaying: false });
    } else {
      this.audioContextManager.stopAudio('mic');
      this.audioContextManager.pauseDefaultAudio(this.audioRef);
      this.audioContextManager.setupAudioContextAndPlay(audio);
      this.setState({
        uploadedAudioPlaying: true,
        currentAudio: 'uploaded',
        speaking: false,
      });
    }
  };

  onCancel = () => {
    if (this.uploadRef.current) {
      // 清理音频资源
      this.audioContextManager.cleanup();
      // 释放上传音频实例
      this.audioContextManager.deleteAudioInstance('uploaded');
      // 释放 URL 对象
      if (this.stream) {
        URL.revokeObjectURL(this.stream);
        this.stream = '';
      }
      this.uploadRef.current.value = '';
      this.setState({
        cancelVisible: false,
        currentAudio: 'default',
        uploadedAudioPlaying: false,
      });
    }
  };

  /**
   * 开始说话
   */
  startSpeaking = () => {
    // 先暂停默认音频和上传音频（同步执行，确保立即暂停）
    this.audioContextManager.pauseDefaultAudio(this.audioRef);
    this.audioContextManager.pauseAudio('uploaded');
    this.setState({ uploadedAudioPlaying: false });
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        try {
          // 再次暂停上传音频，避免 getUserMedia 等待期间未暂停
          this.audioContextManager.pauseAudio('uploaded');
          this.audioContextManager.closeAudioContext();
          this.audioContextManager.create();
          this.audioContextManager.addAudioInstance('mic', stream);
          this.audioContextManager.createMediaStreamSource(stream);
          this.setState({
            speaking: true,
            currentAudio: 'mic',
          });
        } catch (error) {
          console.error('Error creating audio context:', error);
          stream.getTracks().forEach(track => track.stop());
          this.setState({ speaking: false });
        }
      }).catch(error => {
        console.error('Error getting user media:', error);
        this.setState({ speaking: false });
      });
  };

  /**
   * 停止说话
   */
  stopSpeaking = () => {
    // 停止麦克风并关闭音频上下文
    this.audioContextManager.stopAudio('mic');
    this.audioContextManager.closeAudioContext();
    // 更新当前音频状态
    this.setState({
      speaking: false,
      currentAudio: 'default',
    });
  };

  /**
   * 处理说话按钮点击
   */
  handleSpeak = () => {
    if (!this.state.speaking) {
      this.startSpeaking();
    } else {
      this.stopSpeaking();
    }
  };

  render() {
    return (
      <div className={style.audioMusic}>
        <div className={style.analyser}>
          <canvas ref={this.canvasRef} className={style.canvas}></canvas>
        </div>
        <audio
          ref={this.audioRef}
          className={style.audio}
          controls={true}
          src={musicLink}
          crossOrigin={'anonymous'}
          onPlay={this.handlePlay}
        />
        <div>
          <span>{'上传音频: '}</span>
          <input ref={this.uploadRef} type="file" onChange={this.handleFileChange} />
          {this.state.cancelVisible && (
            <>
              <button onClick={this.onCancel}>{'取消'}</button>
              <button onClick={this.handleUploadedAudioPlayPause}>
                {this.state.uploadedAudioPlaying ? '暂停' : '播放'}
              </button>
            </>
          )}
        </div>
        <div>
          <span>{'点击说话: '}</span>
          <button
            onClick={this.handleSpeak}
            disabled={this.state.uploadedAudioPlaying}
            title={this.state.uploadedAudioPlaying ? '请先暂停上传音频' : undefined}
          >
            {this.state.speaking ? '静音' : '说话'}
          </button>
        </div>
      </div>
    )
  }
}
