import React from 'react'
import cx from 'classnames';
import {getId} from '../../../../utils/util-get-id';
import style from './style.module.scss';

interface ISpeakItem {
  id: string;
  stream: string;
  poster?: string;
  wink?: boolean;
}
export class PhoneVideoBox extends React.Component {
  videoRef = React.createRef<HTMLVideoElement>();
  canvasRef = React.createRef<HTMLCanvasElement>();
  recorder!: MediaRecorder;
  stream!: MediaStream;
  index: number = 0;
  chunks: Blob[] = [];
  chunkList: ISpeakItem[] = [];

  state: {chunkList: ISpeakItem[]; text: string;} = {
    chunkList: [],
    text: '按住拍视频',
  };

  get video() {
    return this.videoRef.current;
  }
  get canvas() {
    return this.canvasRef.current;
  }
  get ctx() {
    return this.canvas?.getContext('2d');
  }
  componentDidMount(): void {
    this.mounted();
  }
  requestAudioAccess = () => {
      if (!navigator.mediaDevices) {
          console.error('navigator.mediaDevices not available');
          alert('您的浏览器不支持获取用户设备');
          return;
      }
      if (!window.MediaRecorder) {
          console.error('MediaRecorder not available');
          alert('您的浏览器不支持录制视频');
          return;
      }
      navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
      }).then(stream => {
          this.recorder = new window.MediaRecorder(stream);
          this.stream = stream;
          this.bindEvents();
      }, error => {
          let errorMessage = '出错，请确保已允许浏览器获取录音权限';
          if (error.name === 'NotAllowedError') {
              errorMessage = '权限被拒绝，请在浏览器设置中允许摄像头和麦克风权限';
          } else if (error.name === 'NotFoundError') {
              errorMessage = '未找到摄像头或麦克风设备';
          } else if (error.name === 'NotReadableError') {
              errorMessage = '摄像头或麦克风被其他应用占用';
          }
          alert(errorMessage);
      });
  }
  onMouseDown = () => {
      if (!this.recorder || !this.stream) {
          alert('请先允许浏览器获取摄像头和麦克风权限');
          return;
      }
      this.showVideo(true);
      this.onPreview();
      this.setState({text: '松开结束'});
      this.onStart(); 
  }
  onMouseUp = () => {
      this.onStop();
      this.setState({text: '按住拍视频'});
  }
  onStart = () => {
      if (this.recorder) {
          this.recorder.start();
      } else {
          console.error('Recorder not initialized');
      }
  }
  onStop = () => {
      if (this.recorder) {
          this.recorder.stop();
      } else {
          console.error('Recorder not initialized');
      }
  }
  onPreview = () => {
      if (!this.video) return;
      this.video.srcObject = this.stream;
      this.video.muted = true;
      this.video.play();
  }
  showVideo = (visible: boolean) => {
      if (!this.video) return;
      if (visible) {
          this.video.style.display = 'block';
      }
      else {
          this.video.style.display = 'none';
          this.video.pause();
      }
  }
  onPlay(index: number) {
      if (!this.video) return;
      this.showVideo(true);
      const item = this.chunkList[index];
      this.video.src = item.stream;
      this.video.muted = false;
      this.video.play();

      this.bindAudioEvent();
  }
  bindAudioEvent = () => {
      if (!this.video) return;
      this.video.onended = () => {
          this.showVideo(false);
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
      const blob = new Blob(this.chunks, {'type' : 'video/webm'});
      const videoStream = URL.createObjectURL(blob);
      this.chunkList.push({
        stream: videoStream,
        id: getId(),
      });
      
      this.onCapture(this.index);
      this.chunks = [];
  }
  // 获取视频截图
  onCapture = (index: number) => {
      if (!this.ctx || !this.canvas || !this.video) {
        return;
      }
      const item = this.chunkList[index];
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
      this.canvas.toBlob((blob) => {
          item.poster = URL.createObjectURL(blob as Blob);
          this.setState({
            chunkList: this.chunkList,
          });
      });
      // 索引后移
      this.index ++;
      // 隐藏video
      this.showVideo(false);
      this.video.srcObject = null;
  }
  mounted = () => {
      console.log('mounted called');
      // 不依赖 canvas 元素，直接请求权限
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
              {chunkList.map(item => {
                return (
                  <li key={item.id} className={style.msg}>
                    <div className={style.avatar}></div>
                    <div
                      className={cx(style.video)}
                    >
                      <img alt="截图" src={item.poster} />
                      <i className={style.elIconCaretRight}></i>
                    </div>
                  </li>
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
              <video
                ref={this.videoRef}
                width="200"
                onClick={() => this.showVideo(false)}
                onTouchEnd={() => this.showVideo(false)}
              >
              </video>
          </div>
          <canvas ref={this.canvasRef}></canvas>
        </div>
      </div>
    );
  }
}
