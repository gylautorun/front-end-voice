import React from 'react'
import musicLink from './春涧.mp3';
import style from './style.module.scss';

export class AudioMusic extends React.Component {
  private audioRef = React.createRef<HTMLAudioElement>();
  private canvasRef = React.createRef<HTMLCanvasElement>();
  private uploadRef = React.createRef<HTMLInputElement>();
  audioContext!: AudioContext;
  analyser!: AnalyserNode;
  bufferLength!: number;
  dataArray!: Uint8Array;
  processor!: ScriptProcessorNode;
  audioSource!: MediaElementAudioSourceNode;
  streamSource!: MediaStreamAudioSourceNode;
  state: {
    cancelVisible: Boolean;
    speaking: Boolean;
  } = {
    cancelVisible: false,
    speaking: false,
  };
  stream: string = '';
  constructor(props: Record<string, any>) {
    super(props);
  }

  

  componentDidMount(): void {
  }

  create = () => {
    // 初始化音频上下文
    // 创建AudioContext实例, 音频处理程序运行的环境
    this.audioContext = new AudioContext();
    // 创建分析器，用于分析音频波形
    this.createAnalyser();
    this.createScriptProcessor();
    
    // 绑定绘制函数
    this.bindDraw();
  };

  /**
   * 创建分析器，用于分析音频波形
   */
  createAnalyser() {
    // 创建分析器, 分析音频波形
    this.analyser = this.audioContext.createAnalyser();
    //快速傅里叶变换参数
    this.analyser.fftSize = 256;
    // 频谱均衡器精度
    this.analyser.smoothingTimeConstant = 0.8;
    // bufferArray长度
    this.bufferLength = this.analyser.frequencyBinCount;
    // 创建bufferArray，用来装音频数据
    this.dataArray = new Uint8Array(this.bufferLength);

    // 分析器连接处理器，处理器连接扬声器
    this.analyser.connect(this.audioContext.destination);
  }
  createMediaElementSource = (audio: HTMLAudioElement) => {
    // 创建音频源节点 (音频源) => 可以对其操作(音色, 混响等)的节点
    this.audioSource = this.audioContext.createMediaElementSource(audio);
    // 分析器节点连接到输出设备
    this.audioSource.connect(this.analyser);
  };
  createMediaStreamSource = (audio: MediaStream) => {
    // 创建音频源节点 (音频源) => 可以对其操作(音色, 混响等)的节点
    this.streamSource = this.audioContext.createMediaStreamSource(audio);
    // 分析器节点连接到输出设备
    this.streamSource.connect(this.analyser);
  };
  /**
   * 处理器连接分析器, 波普分析
   */
  createScriptProcessor () {
    // 创建处理器，参数分别是缓存区大小、输入声道数、输出声道数
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    // 分析器连接处理器，处理器连接扬声器
    this.analyser.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }
  bindDraw () {
    this.processor.onaudioprocess = this.draw;
  }
  draw = () => {
    // requestAnimationFrame 也可以
    if (!this.canvasRef.current) {
        return;
    }
    const canvas = this.canvasRef.current;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const w = canvas.width;
    const h = canvas.height;
    const {bufferLength, dataArray} = this;
    const barWidth = parseInt((0.5 * w / bufferLength).toString());
    let barHeight;
    let x = 0;
    ctx.clearRect(0, 0, w, h);
    // 分析器获取音频数据“切片”
    this.analyser.getByteFrequencyData(dataArray);
    
    ctx.fillStyle = '#00ffdd';
    //把每个音频“切片”画在画布上
    for (let i = 0; i < bufferLength; i++) {
        barHeight = parseInt((0.4 * dataArray[i]).toString());
        ctx.fillRect(x, h - barHeight, barWidth, barHeight);
        x += barWidth + 2;
    }
};

  handlePlay = () => {
    const audio = this.audioRef.current;
    if (audio) {
      audio.crossOrigin='anonymous';
      if (!this.audioSource) {
        this.create();
        this.createMediaElementSource(audio);
      }
      audio.play();
    }
  }

  handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const file = event.target.files[0];
      this.stream = URL.createObjectURL(file);
      const audio = new Audio();
      audio.src = this.stream;
      audio.oncanplay = () => {
        this.create();
        this.createMediaElementSource(audio);
        audio.play();
      };
      // const reader = new FileReader();
      // reader.onload = (e: ProgressEvent<FileReader>) => {
      //   const content = e.target?.result;
      //   console.log(file, content);
      // };
      // reader.readAsText(file);
      this.setState({
        cancelVisible: true,
      });
    }
    
  };
  onCancel = () => {
    if (this.uploadRef.current) {
      this.audioContext.state != 'closed' && this.audioContext.close();
      URL.revokeObjectURL(this.stream);
      this.uploadRef.current.value = ''; 
      this.setState({
        cancelVisible: false,
      });
    }
  };

  mediaStream: MediaStream | null = null;
  handleSpeak = () => {
    if (!this.state.speaking) {
      navigator.mediaDevices.getUserMedia({audio: true}).then(stream => {
        this.create();
        this.mediaStream = stream;
        this.createMediaStreamSource(this.mediaStream);
      });
    }
    else {
      this.mediaStream?.getTracks().forEach(track => {
        track.stop();
      });
      this.mediaStream = null;
    }
    this.setState({
      speaking: !this.state.speaking,
    });
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
        >
        </audio>
        <div>
          <span>{'上传音频: '}</span>
          <input ref={this.uploadRef} type="file" onChange={this.handleFileChange}/>
          {this.state.cancelVisible && <button onClick={this.onCancel}>{'取消'}</button>}
        </div>
        <div>
          <span>{'点击说话: '}</span>
          <button onClick={this.handleSpeak}>{this.state.speaking ? '静音' : '说话'}</button>
        </div>
      </div>
    )
  }
}


