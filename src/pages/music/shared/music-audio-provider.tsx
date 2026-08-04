import {ReactNode, useCallback, useEffect, useMemo, useRef} from 'react';
import demoTrackUrl from '../assets/audio/掌缘生灭.mp3';
import {useAudioAnalyser} from '../audio-visualizer/use-audio-analyser';
import {MusicAudioContext} from './music-audio-context';

/** 共享音频 Provider 的子节点。 */
interface MusicAudioProviderProps {
    children: ReactNode;
}

/**
 * 为每个音乐路由建立独立且唯一的 HTMLAudioElement / Web Audio 音频图。
 * 页面首次打开会加载内置曲目，用户上传后不再被异步示例覆盖。
 */
export const MusicAudioProvider = ({children}: MusicAudioProviderProps) => {
    const controller = useAudioAnalyser();
    // 单独提取稳定方法，Hook 依赖不再引用每次渲染都会重建的 controller 对象。
    const {loadFile} = controller;
    // 记录用户是否主动选过文件，阻止较慢的默认曲目请求覆盖它。
    const hasSelectedFileRef = useRef(false);

    useEffect(() => {
        let isMounted = true;

        // Vite 会把导入的 MP3 转成可请求的静态资源 URL。
        fetch(demoTrackUrl)
            .then(response => {
                if (!response.ok) throw new Error('默认音频加载失败');
                return response.blob();
            })
            .then(blob => {
                if (!isMounted || hasSelectedFileRef.current) return;
                return loadFile(new File(
                    [blob],
                    '掌缘生灭.mp3',
                    {type: blob.type || 'audio/mpeg'},
                ));
            })
            // 默认资源失败不影响用户之后上传本地音频。
            .catch(() => undefined);

        return () => {
            isMounted = false;
        };
    }, [loadFile]);

    /** 标记用户操作并复用现有文件解析链路。 */
    const loadUserFile = useCallback((file: File) => {
        hasSelectedFileRef.current = true;
        void loadFile(file);
    }, [loadFile]);

    // controller 内部方法均已 useCallback，组合对象只在状态变化时更新。
    const value = useMemo(() => ({...controller, loadUserFile}), [controller, loadUserFile]);

    return (
        <MusicAudioContext.Provider value={value}>
            {children}
            {/* 隐藏媒体元素是播放状态的事实来源，事件全部同步回 Hook。 */}
            <audio
                ref={controller.audioRef}
                hidden
                onEnded={controller.handleEnded}
                onLoadedMetadata={controller.handleLoadedMetadata}
                onPause={controller.handlePause}
                onPlay={controller.handlePlay}
                onTimeUpdate={controller.handleTimeUpdate}
            />
        </MusicAudioContext.Provider>
    );
};
