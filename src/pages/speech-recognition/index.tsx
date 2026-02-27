import {useState, useEffect, useRef} from 'react'
import {Button, Input, Alert, Space} from 'antd';
import voiceSvg from '../../assets/voice.svg';
import {useSpeechRecognition, SpeechRecognitionEvent, SpeechRecognitionInstance} from './use-speech-recognition';
import style from './style.module.scss';

const {TextArea} = Input;
export function SpeechRecognition() {
  const [value, setValue] = useState('说出你的内容');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interimResult, setInterimResult] = useState('');
  const recognition = useSpeechRecognition();
  const recognitionRef = useRef<typeof recognition>(recognition);

  // 保存最新的 recognition 实例
  useEffect(() => {
    recognitionRef.current = recognition;
  }, [recognition]);

  // 监听识别结果变化
  useEffect(() => {
    // 这里可以添加实时更新逻辑
  }, []);

  const handleStart = async () => {
    try {
      setError(null);
      setIsListening(true);
      setInterimResult('');
      // 请求麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      
      recognitionRef.current.start();
      
      // 重写 onresult 事件，添加实时更新
      const recognitionInstance = recognitionRef.current.recognition;
      if (recognitionInstance) {
        const originalOnResult = recognitionInstance.onresult;
        recognitionInstance.onresult = (event: SpeechRecognitionEvent) => {
          if (originalOnResult) originalOnResult(event);
          const transcript = event.results[0][0].transcript;
          setInterimResult(transcript);
        };
      }
    } catch (err) {
      setError('无法访问麦克风，请检查权限设置');
      setIsListening(false);
      console.error('Error starting speech recognition:', err);
    }
  };

  const handleEnd = () => {
    setIsListening(false);
    recognitionRef.current.stop();
    if (interimResult) {
      setValue((state) => state + interimResult);
      setInterimResult('');
    }
  };

  const handleReset = () => {
    setValue('');
    setInterimResult('');
    setError(null);
  };

  return (
    <div className={style.voiceWrapper}>
      <TextArea
        value={value}
        autoSize={{minRows: 5, maxRows: 15}}
        placeholder="说出你的内容"
      />
      {interimResult && (
        <div className={style.interimResult}>
          <strong>实时识别:</strong> {interimResult}
        </div>
      )}
      {error && (
        <Alert
          title="错误"
          description={error}
          type="error"
          showIcon
          style={{margin: '10px 0'}}
        />
      )}
      <div className={style.controls}>
        <img 
          className={`${style.voice} ${isListening ? style.listening : ''}`} 
          src={voiceSvg} 
        />
        <Space>
          <Button 
            type="primary" 
            onClick={handleStart} 
            disabled={isListening}
          >
            {isListening ? '识别中...' : '开始'}
          </Button>
          <Button 
            onClick={handleEnd} 
            disabled={!isListening}
          >
            结束&转换
          </Button>
          <Button onClick={handleReset}>
            清空
          </Button>
        </Space>
      </div>
    </div>
  )
}

export default SpeechRecognition;
