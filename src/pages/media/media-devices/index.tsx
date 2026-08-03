import {useState, useEffect, useMemo, useRef, useCallback} from 'react'
import {Button, Select} from 'antd';
import style from './style.module.scss';


interface SelectValue extends Partial<MediaDeviceInfo> {
  value: string;
}
function MediaDevices() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const selectChange = useCallback((option: SelectValue) => {
    const videoConstraints: {facingMode?: string, deviceId?: {exact: string}} = {};
    if (!option.value) {
        videoConstraints.facingMode = 'environment';
    }
    else {
        videoConstraints.deviceId = {exact: option.value};
    }
    navigator.mediaDevices.getUserMedia({ 
      audio: false, 
      video: videoConstraints,
    }).then(stream => {
      if (videoRef.current) {
        setStream(stream);
        videoRef.current.srcObject = stream;
      }
    }).catch(err => {
        console.error(err.message);
    });
  }, []);
  useEffect(() => {
    const getDevices = () => {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const list = devices.filter(device => device.kind === 'videoinput');
        setDevices(list);
        selectChange({value: ''});
      });
    };
    getDevices();
  }, [videoRef, selectChange]);

  useEffect(() => {
    /**
     * 销毁流 好像不行
     */
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => {
          track.stop();
      });
      }
    };
  }, [devices]);

  const handleSnap = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const cxt = canvas.getContext('2d');
      cxt?.drawImage(videoRef.current!, 0, 0, canvas.width, canvas.height);
      // canvas转图片保存
      canvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob as Blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = 'snap.png'; // 您可以设置任何文件名
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
      });
    }
  };

  return (
    <div className={style.mediaDevices}>
      <div className={style.videoWrapper}>
        <video ref={videoRef} autoPlay={true}></video>
        <canvas ref={canvasRef}></canvas>
      </div>
      <Button type="primary" onClick={handleSnap}>{'截图'}</Button>
      <Select
        placeholder="请选择摄像头"
        onChange={(value, option) => selectChange(option as SelectValue)}
        options={devices.map(device => ({
          ...device,
          value: device.deviceId,
          label: device.label,
        }))}
      />
    </div>
  )
}

export default MediaDevices;
