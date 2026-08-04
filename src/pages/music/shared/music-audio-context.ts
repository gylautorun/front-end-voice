import {createContext, useContext} from 'react';
import {useAudioAnalyser} from '../audio-visualizer/use-audio-analyser';

/** 音乐页面共享的播放器、分析节点与文件切换能力。 */
export type MusicAudioController = ReturnType<typeof useAudioAnalyser> & {
    /** 用户选择本地文件时调用，优先级高于仍在加载的内置示例。 */
    loadUserFile: (file: File) => void;
};

/** Provider 与消费组件之间共享的音频上下文。 */
export const MusicAudioContext = createContext<MusicAudioController | null>(null);

/** 读取离当前页面最近的共享音频控制器。 */
export const useMusicAudio = () => {
    const value = useContext(MusicAudioContext);
    if (!value) {
        throw new Error('useMusicAudio 必须在 MusicAudioProvider 内使用');
    }
    return value;
};
