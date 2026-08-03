import {useCallback, useEffect, useRef, useState} from 'react';
import {Alert} from 'antd';
import demoTrackUrl from '../../speech/audio-context/audio-music/春涧.mp3';
import {AudioInspector} from './components/audio-inspector';
import {PlayerControls} from './components/player-controls';
import {VisualizerStage} from './components/visualizer-stage';
import {VisualizerToolbar} from './components/visualizer-toolbar';
import style from './style.module.scss';
import {useAudioAnalyser} from './use-audio-analyser';
import {VisualizationMode} from './visualizers/types';

/** 音乐解析与可视化页面，负责协调音频状态与各个界面组件。 */
function MusicAudioVisualizer() {
    // 用户主动选择文件后，防止尚在下载的内置示例覆盖它。
    const hasSelectedFileRef = useRef(false);
    // 默认展示频谱柱，用户可切换为镜像波形或球形水滴波纹。
    const [mode, setMode] = useState<VisualizationMode>('bars');
    // 可视化默认使用 100% 幅度倍率。
    const [sensitivity, setSensitivity] = useState(1);
    // Hook 集中管理播放器、音频解码和 Web Audio 分析节点。
    const {
        analyserRef,
        audioRef,
        currentTime,
        duration,
        error,
        handleEnded,
        handleLoadedMetadata,
        handlePause,
        handlePlay,
        handleTimeUpdate,
        isParsing,
        isPlaying,
        loadFile,
        metadata,
        reset,
        seek,
        setVolume,
        togglePlayback,
        volume,
    } = useAudioAnalyser();

    // 页面首次挂载后加载内置示例，让路由打开后立即可用。
    useEffect(() => {
        // 卸载时设为 false，防止 fetch 结束后继续修改状态。
        let active = true;
        // 请求 Vite 处理后的示例 MP3 资源。
        fetch(demoTrackUrl)
            // 将响应转为本地 Blob。
            .then(response => response.blob())
            .then(blob => {
                // 页面已卸载或用户已选文件时丢弃示例。
                if (!active || hasSelectedFileRef.current) return;
                // 将 Blob 包装为 File，与上传文件共用同一条解析链路。
                const demoFile = new File([blob], '春涧.mp3', {type: blob.type || 'audio/mpeg'});
                // 返回解码 Promise，使异步链可正常等待。
                return loadFile(demoFile);
            })
            // 示例加载失败不阻止用户之后手动上传。
            .catch(() => undefined);

        // effect 清理时禁止后续异步结果生效。
        return () => {
            active = false;
        };
    }, [loadFile]);

    /** 标记用户主动选择并将文件交给音频 Hook 解码。 */
    const handleFileSelected = useCallback((file: File) => {
        // 防止仍在下载的内置示例覆盖用户文件。
        hasSelectedFileRef.current = true;
        // 解码状态和错误信息由 Hook 统一管理。
        void loadFile(file);
    }, [loadFile]);

    return (
        // 页面根节点提供独立背景和响应式内容容器。
        <main className={style.page}>
            {/* 页面标题与全局解析/播放状态。 */}
            <header className={style.pageHeader}>
                <div>
                    <div className={style.sectionLabel}>MUSIC LAB</div>
                    <h1>音乐解析与可视化</h1>
                </div>
                <div className={style.trackStatus}>
                    <span className={isPlaying ? style.liveDot : style.idleDot} />
                    <span>{isParsing ? '解析中' : isPlaying ? '正在播放' : '已就绪'}</span>
                </div>
            </header>

            <VisualizerToolbar
                metadata={metadata}
                mode={mode}
                onFileSelected={handleFileSelected}
                onModeChange={setMode}
            />

            {/* 解析或播放失败时显示可关闭的错误提示。 */}
            {error && <Alert className={style.alert} type="error" message={error} showIcon closable />}

            {/* 主工作区：左侧为画布与播放器，右侧为音频分析信息。 */}
            <section className={style.workspace}>
                <div className={style.visualColumn}>
                    <VisualizerStage
                        analyserRef={analyserRef}
                        isParsing={isParsing}
                        isPlaying={isPlaying}
                        mode={mode}
                        sensitivity={sensitivity}
                    />
                    <PlayerControls
                        currentTime={currentTime}
                        duration={duration}
                        hasAudio={Boolean(metadata)}
                        isParsing={isParsing}
                        isPlaying={isPlaying}
                        onReset={reset}
                        onSeek={seek}
                        onTogglePlayback={togglePlayback}
                        onVolumeChange={setVolume}
                        volume={volume}
                    />
                </div>

                <AudioInspector
                    duration={duration}
                    metadata={metadata}
                    onSensitivityChange={setSensitivity}
                    sensitivity={sensitivity}
                />
            </section>

            {/* 隐藏媒体元素负责真实播放，所有事件回传给分析 Hook。 */}
            <audio
                ref={audioRef}
                className={style.audioElement}
                onEnded={handleEnded}
                onLoadedMetadata={handleLoadedMetadata}
                onPause={handlePause}
                onPlay={handlePlay}
                onTimeUpdate={handleTimeUpdate}
            />
        </main>
    );
}

export default MusicAudioVisualizer;
