import React from 'react'
import musicLink from './春涧.mp3';
import style from './style.module.scss';
import { AudioContextManager } from './AudioContextManager';

type CurrentAudio = 'default' | 'uploaded' | 'mic';

interface AudioMusicState {
  speaking: boolean;
  currentAudio: CurrentAudio;
  uploadedAudioPlaying: boolean;
}

export class AudioMusic extends React.Component<Record<string, never>, AudioMusicState> {
  private audioRef = React.createRef<HTMLAudioElement>();
  private canvasRef = React.createRef<HTMLCanvasElement>();
  private uploadRef = React.createRef<HTMLInputElement>();
  private audioContextManager: AudioContextManager;
  state: AudioMusicState = {
    speaking: false,
    currentAudio: 'default',
    uploadedAudioPlaying: false,
  };
  /** 上传文件的 blob URL，有值即表示已选择上传音频，用于显示取消/播放按钮 */
  stream: string = '';

  constructor(props: Record<string, never>) {
    super(props);
    this.audioContextManager = new AudioContextManager(this.canvasRef);
  }

  componentWillUnmount(): void {
    this.audioContextManager.destroy();
  }

  /** 统一更新「当前音源」相关状态 */
  private setAudioState(current: CurrentAudio): void {
    this.setState({
      currentAudio: current,
      speaking: current === 'mic',
      uploadedAudioPlaying: current === 'uploaded',
    });
  }

  handlePlay = () => {
    const audio = this.audioRef.current;
    if (!audio) return;
    audio.crossOrigin = 'anonymous';
    try {
      this.audioContextManager.switchToElementAndPlay(audio);
      this.setAudioState('default');
    } catch (error) {
      console.error('Error creating audio context:', error);
    }
  };

  handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    this.stream = URL.createObjectURL(file);
    const audio = new Audio();
    audio.src = this.stream;
    audio.oncanplay = () => {
      try {
        this.audioContextManager.stopAudio('mic');
        this.audioContextManager.closeAudioContext();
        this.audioContextManager.addAudioInstance('uploaded', audio);
        this.audioContextManager.switchToElementAndPlay(audio, this.audioRef);
        this.setAudioState('uploaded');
      } catch (error) {
        console.error('Error creating audio context:', error);
      }
    };
    audio.onended = () => {
      this.setAudioState('default');
    };
  };

  handleUploadedAudioPlayPause = () => {
    const instance = this.audioContextManager.getAudioInstance('uploaded');
    const audio = instance?.getAudio();
    if (!audio || !(audio instanceof HTMLAudioElement)) return;
    if (this.state.uploadedAudioPlaying) {
      this.audioContextManager.pauseAudio('uploaded');
      this.setState({ uploadedAudioPlaying: false });
    } else {
      this.audioContextManager.switchToElementAndPlay(audio, this.audioRef);
      this.setAudioState('uploaded');
    }
  };

  onCancel = () => {
    if (!this.uploadRef.current) return;
    this.audioContextManager.cleanup();
    this.audioContextManager.deleteAudioInstance('uploaded');
    if (this.stream) {
      URL.revokeObjectURL(this.stream);
      this.stream = '';
    }
    this.uploadRef.current.value = '';
    this.setAudioState('default');
  };

  startSpeaking = () => {
    this.audioContextManager.pauseAllElementSources(this.audioRef);
    this.setState({ uploadedAudioPlaying: false });
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(stream => {
        try {
          this.audioContextManager.pauseAudio('uploaded');
          this.audioContextManager.closeAudioContext();
          this.audioContextManager.create();
          this.audioContextManager.addAudioInstance('mic', stream);
          this.audioContextManager.createMediaStreamSource(stream);
          this.setAudioState('mic');
        } catch (error) {
          console.error('Error creating audio context:', error);
          stream.getTracks().forEach(track => track.stop());
          this.setAudioState('default');
        }
      })
      .catch(error => {
        console.error('Error getting user media:', error);
        this.setAudioState('default');
      });
  };

  stopSpeaking = () => {
    this.audioContextManager.stopAudio('mic');
    this.audioContextManager.closeAudioContext();
    this.setAudioState('default');
  };

  handleSpeak = () => {
    this.state.speaking ? this.stopSpeaking() : this.startSpeaking();
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
          {this.stream && (
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
