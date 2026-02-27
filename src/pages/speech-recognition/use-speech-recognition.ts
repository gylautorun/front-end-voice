import {useRef, useMemo, useCallback} from 'react';

export type SpeechRecognitionEvent = {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    readonly [index: number]: {
      readonly isFinal: boolean;
      readonly length: number;
      readonly [index: number]: {
        readonly transcript: string;
        readonly confidence: number;
      };
    };
  };
};

function getSpeechRecognition() {
    // return window.webkitSpeechRecognition;
    // window.SpeechRecognition firefox 需要开启相关配置
    return window.SpeechRecognition || window.webkitSpeechRecognition;
}

type INoop = () => void;
const noop = () => {};

export type SpeechRecognitionInstance = {
  value: string;
  start: INoop;
  stop: INoop;
  recognition: {
    onresult?: (event: SpeechRecognitionEvent) => void;
    start: () => void;
    stop: () => void;
    lang: string;
    interimResults: boolean;
    onend?: () => void;
  } | null;
};

export function useSpeechRecognition() {
    // 定义普通话 (中国大陆)
    const ref = useRef<SpeechRecognitionInstance>({
        value: '',
        start: noop,
        stop: noop,
        recognition: null,
    });
    const isRunningRef = useRef<boolean>(false);
    const recognition = useMemo(() => {
        try {
            const SpeechRecognitionConstructor = getSpeechRecognition();
            if (!SpeechRecognitionConstructor) {
                console.error('SpeechRecognition not supported');
                return null;
            }
            const recognition = new SpeechRecognitionConstructor();
            recognition.lang = 'cmn-Hans-CN'; // 定义普通话 (中国大陆)
            recognition.interimResults = true;
            // 监听结束事件，重置运行状态
            recognition.onend = () => {
                isRunningRef.current = false;
            };
            return recognition;
        }
        catch (e) {
            // 调用后端接口实例
            console.error(e);
            return null;
        }
    }, []);
    
    // 保存 recognition 实例到 ref 中
    ref.current.recognition = recognition as SpeechRecognitionInstance['recognition'];  
    // 每次都会执行, 一句话 10 个字, 进行十次
    ref.current.start = useCallback(() => {
        if (recognition && !isRunningRef.current) {
            isRunningRef.current = true;
            recognition.start();
            recognition.onresult = (event: SpeechRecognitionEvent) => {
                const value = event.results[0][0].transcript as string;
                ref.current.value = value;
            };
        }
    }, [recognition]);
    ref.current.stop = useCallback(() => {
        if (recognition && isRunningRef.current) {
            recognition.stop();
            // 不要在这里直接设置 isRunningRef.current = false
            // 因为 recognition.stop() 会触发 onend 事件，在 onend 事件中会设置 isRunningRef.current = false
            console.log(ref);
        }
    }, [recognition]);

    return ref.current;
}

