import {useState, useEffect, useRef, useMemo, useCallback} from 'react'
import {Button, Input} from 'antd';
import voiceSvg from '../../assets/voice.svg';
import {useSpeechRecognition} from './use-speech-recognition';
import style from './style.module.scss';

const {TextArea} = Input;
export function SpeechRecognition() {
  const [value, setValue] = useState('说出你的内容');
  const recognition = useSpeechRecognition();
  const handleStart = () => {
    recognition.start();
  };
  const handleEnd = () => {
    recognition.stop();
    setValue((state) => state + recognition.value);
  };
  return (
    <div className={style.voiceWrapper}>
      <TextArea
        value={value}
        autoSize={{minRows: 5, maxRows: 15}}
      />
      <img className={style.voice} src={voiceSvg} />
      <Button onClick={handleStart}>开始</Button>
      <Button onClick={handleEnd}>结束&转换</Button>
    </div>
  )
}

export default SpeechRecognition;
