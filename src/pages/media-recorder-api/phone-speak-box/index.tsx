import React from 'react';
import cx from 'classnames';
import {getId} from '../../../utils/util-get-id';
import style from './style.module.scss';

interface ISpeakItem {
  id: string;
  stream: string;
  duration: number;
  wink?: boolean;
}
export class PhoneSpeakBox extends React.Component {
  audioRef = React.createRef<HTMLAudioElement>();
  recorder!: MediaRecorder;
  chunks: Blob[] = [];
  chunkList: ISpeakItem[] = [];
  state: {chunkList: ISpeakItem[]; text: string;} = {
    chunkList: [],
    text: '按住说话',
  };

  get audio(): HTMLAudioElement | null {
    return this.audioRef.current;
  }

  componentDidMount(): void {
    this.mounted();
  }

  requestAudioAccess = () => {
      navigator.mediaDevices.getUserMedia({audio: true}).then(stream => {
          this.recorder = new window.MediaRecorder(stream);
          this.bindEvents();
      }, error => {
          alert('出错，请确保已允许浏览器获取录音权限');
      });
  }
  onMouseDown = () => {
      this.onStart();
      this.setState({text: '松开结束'});
  }
  onMouseUp = () => {
      this.onStop();
      this.setState({text: '按住说话'});
  }
  onStart = () => {
      this.recorder.start();
  }
  onStop = () => {
      this.recorder.stop();
  }
  onPlay(index: number) {
      if(!this.audio) return;
      this.chunkList.forEach(item => {
        item.wink = false;
      });
      const item = this.chunkList[index];
      this.audio.src = item.stream;
      this.audio.play();
      this.bindAudioEvent(index);
  }
  setChunkList() {
    this.setState({chunkList: this.chunkList});
  }
  bindAudioEvent(index: number) {
      if(!this.audio) return;
      let item = this.chunkList[index];
      this.audio.onplaying = () => {
          item.wink = true;
          this.setChunkList();
      }
      this.audio.onended = () => {
          item.wink = false;
          this.setChunkList();
      }
  }
  bindEvents = () => {
      this.recorder.ondataavailable = this.getRecordingData;
      this.recorder.onstop = this.saveRecordingData;
  }
  getRecordingData = (e: BlobEvent) => {
      this.chunks.push(e.data);
  }
  saveRecordingData = () => {
      const blob = new Blob(this.chunks, {'type' : 'audio/ogg; codecs=opus'});
      const audioStream = URL.createObjectURL(blob);
      // 估算时长
      let duration = parseInt((blob.size / 6600).toString());
      if(duration <= 0) {
          alert('说话时间太短');
          return;
      }
      if(duration > 60) {
          duration = 60;
      }
      this.chunkList.push({
        duration: duration,
        stream: audioStream,
        id: getId(),
      });
      this.chunks = [];
      this.setChunkList();
  }
  mounted = () => {
      if (!navigator.mediaDevices) {
          alert('您的浏览器不支持获取用户设备');
          return;
      }
      if (!window.MediaRecorder) {
          alert('您的浏览器不支持录音');
          return;
      }
      this.requestAudioAccess();
  }

  render() {
    const {chunkList, text} = this.state;
    return (
      <div className={style.recorderWrapper}>
        <div className={style.phone}>
          <div className={style.phoneBody}>
            <div className={style.phoneHeader}>{'header'}</div>
            <div className={style.phoneContent}>
              {chunkList.map((item, index) => {
                return (
                  <div
                    key={item.id}
                    className={style.msg}
                    onClick={() => this.onPlay(index)}
                    onTouchEnd={() => this.onPlay(index)}
                  >
                    <div className={style.avatar}></div>
                    <div
                      style={{
                        width: 20 * item.duration
                      }}
                      className={cx(style.audio, {'wink': item.wink})}
                    >
                      <span>(</span>
                      <span>(</span>
                      <span>(</span>
                    </div>
                    <div className={style.duration}>{item.duration}</div>
                  </div>
                )
              })}
            </div>
            <div
              className={style.phoneOperate}
              onMouseDown={this.onMouseDown}
              onMouseUp={this.onMouseUp}
              onTouchStart={this.onMouseDown}
              onTouchEnd={this.onMouseUp}
            >
              {text}
            </div>
          </div>
          <audio ref={this.audioRef}></audio>
        </div>
      </div>
    );
  }
}

