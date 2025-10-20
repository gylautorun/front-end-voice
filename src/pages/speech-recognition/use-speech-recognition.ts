import {useRef, useMemo, useCallback} from 'react';

interface ExtendedWindow extends Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
}

declare const window: ExtendedWindow;

function getSpeechRecognition() {
    // return window.webkitSpeechRecognition;
    // window.SpeechRecognition firefox 需要开启相关配置
    return window.SpeechRecognition || window.webkitSpeechRecognition;
}

type INoop = () => void;
const noop = () => {};
export function useSpeechRecognition() {
    // 定义普通话 (中国大陆)
    const ref = useRef<{value: string; start: INoop; stop: INoop;}>({
        value: '',
        start: noop,
        stop: noop,
    });
    const recognition = useMemo(() => {
        try {
            const recognition = new (getSpeechRecognition())();
            recognition.lang = 'cmn-Hans-CN'; // 定义普通话 (中国大陆)
            recognition.interimResults = true;
            return recognition;
        }
        catch (e) {
            // 调用后端接口实例
            console.error(e);
            return {};
        }
    }, []);
    // 每次都会执行, 一句话 10 个字, 进行十次
    ref.current.start = useCallback(() => {
        recognition.start();
        recognition.onresult = (event: any) => {
            const value = event.results[0][0].transcript as string;
            ref.current.value = value;
        };
    }, [recognition]);
    ref.current.stop = useCallback(() => {
        recognition.stop();
        console.log(ref);
    }, [recognition]);

    return ref.current;
}

