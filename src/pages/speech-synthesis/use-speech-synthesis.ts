import {useRef, useState, useMemo, useCallback} from 'react';
import { FieldType } from '.';

export function useSpeechSynthesis() {
    const [reading, setReading] = useState(false);
    const synthesis = useMemo(() => {
        return speechSynthesis;
    }, []);
    const langList = useMemo(() => {
        return synthesis.getVoices();
    }, [synthesis]);
    
    // 每次都会执行, 一句话 10 个字, 进行十次
    const speak = useCallback((params: FieldType) => {
        const speech = new SpeechSynthesisUtterance();
        Object.keys(params).forEach((key) => {
            (speech as any)[key] = params[key as keyof FieldType];
        });
        synthesis.speak(speech);

        speech.onend = e => {
            setReading(false);
        };
        speech.onstart= () => {
            setReading(true);
        }
    }, [synthesis, setReading]);

    const stop = useCallback(() => {
        synthesis.cancel();
        setReading(false);
    }, [synthesis]);

    return {synthesis, reading, langList, speak, stop};
}

