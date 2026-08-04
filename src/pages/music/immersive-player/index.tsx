import {ChangeEvent, useEffect, useRef, useState} from 'react';
import {
    CompressOutlined,
    ExpandOutlined,
    PauseCircleFilled,
    PlayCircleFilled,
    SoundOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import {Button, Slider, Tooltip} from 'antd';
import {formatDuration} from '../audio-visualizer/formatters';
import {AudioFrameReader} from '../shared/audio-frame';
import {useMusicAudio} from '../shared/music-audio-context';
import {MusicAudioProvider} from '../shared/music-audio-provider';
import {AmbientCanvas} from './ambient-canvas';
import {KaraokeLyrics} from './karaoke-lyrics';
import style from './style.module.scss';

/** 去掉扩展名和文件名前的歌手部分，得到唱片中心可展示的歌曲名。 */
const getTrackTitle = (fileName = '') => {
    const withoutExtension = fileName.replace(/\.[^.]+$/, '');
    return withoutExtension.split(/\s+[-–—]\s+/).pop() || 'MUSIC';
};

/** 产品化播放器内容，依赖上层共享音频 Provider。 */
const ImmersivePlayerContent = () => {
    const playerRef = useRef<HTMLElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const vinylRef = useRef<HTMLDivElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const {
        analyserRef,
        currentTime,
        duration,
        isParsing,
        isPlaying,
        loadUserFile,
        metadata,
        seek,
        setVolume,
        togglePlayback,
        volume,
    } = useMusicAudio();

    // 读取全屏事件的真实状态，兼容用户按 Esc 退出。
    useEffect(() => {
        const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === playerRef.current);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // 低频驱动唱片尺度和阴影，通过 DOM 样式更新避免 React 每帧渲染。
    useEffect(() => {
        const reader = new AudioFrameReader();
        let animationFrameId = 0;
        const update = () => {
            const frame = reader.read(analyserRef.current);
            vinylRef.current?.style.setProperty('--beat-scale', String(1 + frame.energy.bass * 0.045));
            vinylRef.current?.style.setProperty('--beat-glow', String(20 + frame.energy.bass * 62));
            animationFrameId = requestAnimationFrame(update);
        };
        animationFrameId = requestAnimationFrame(update);
        return () => cancelAnimationFrame(animationFrameId);
    }, [analyserRef]);

    /** 切换当前播放器元素的浏览器全屏模式。 */
    const toggleFullscreen = async () => {
        if (document.fullscreenElement) {
            await document.exitFullscreen();
        } else {
            await playerRef.current?.requestFullscreen();
        }
    };

    /** 上传后立即交给共享解析链路并允许重复选择同一文件。 */
    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) loadUserFile(file);
        event.target.value = '';
    };

    const trackTitle = getTrackTitle(metadata?.name);

    return (
        <main ref={playerRef} className={style.playerPage}>
            <AmbientCanvas analyserRef={analyserRef} />
            <div className={style.backdropShade} />

            <header className={style.playerHeader}>
                <div className={style.brandBlock}>
                    <span>IMMERSIVE PLAYER</span>
                    <strong>{metadata?.name || '正在准备示例音频'}</strong>
                </div>
                <div className={style.headerActions}>
                    <Tooltip title="选择本地音频">
                        <Button icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>
                            上传音频
                        </Button>
                    </Tooltip>
                    <Tooltip title={isFullscreen ? '退出全屏' : '进入全屏'}>
                        <Button
                            aria-label={isFullscreen ? '退出全屏' : '进入全屏'}
                            icon={isFullscreen ? <CompressOutlined /> : <ExpandOutlined />}
                            onClick={() => void toggleFullscreen()}
                        />
                    </Tooltip>
                    <input
                        ref={fileInputRef}
                        className={style.fileInput}
                        type="file"
                        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
                        onChange={handleFileChange}
                    />
                </div>
            </header>

            <section className={style.playerWorkspace}>
                <div className={style.albumColumn}>
                    <div className={style.vinylStage}>
                        <div
                            ref={vinylRef}
                            className={`${style.vinyl} ${isPlaying ? style.vinylPlaying : ''}`}
                            aria-label="随音乐旋转的黑胶唱片"
                        >
                            <div className={style.vinylGrooves} />
                            <div className={style.recordLabel}>
                                <span>NOW PLAYING</span>
                                <strong>{trackTitle}</strong>
                            </div>
                        </div>
                        <div className={style.toneArm} aria-hidden="true"><i /></div>
                    </div>

                    <div className={style.trackInfo}>
                        <span>{isParsing ? 'ANALYSING' : isPlaying ? 'NOW PLAYING' : 'READY'}</span>
                        <h1>{trackTitle}</h1>
                        <p>{metadata?.name.replace(/\.[^.]+$/, '') || 'Music Visualizer'}</p>
                    </div>

                    <div className={style.playerControls}>
                        <Tooltip title={isPlaying ? '暂停' : '播放'}>
                            <Button
                                className={style.playButton}
                                type="text"
                                shape="circle"
                                disabled={!metadata || isParsing}
                                icon={isPlaying ? <PauseCircleFilled /> : <PlayCircleFilled />}
                                onClick={() => void togglePlayback()}
                            />
                        </Tooltip>
                        <time>{formatDuration(currentTime)}</time>
                        <Slider
                            className={style.progress}
                            min={0}
                            max={duration || 1}
                            step={0.01}
                            value={Math.min(currentTime, duration || 1)}
                            disabled={!metadata}
                            tooltip={{formatter: value => formatDuration(value || 0)}}
                            onChange={seek}
                        />
                        <time>{formatDuration(duration)}</time>
                        <SoundOutlined />
                        <Slider
                            className={style.volume}
                            min={0}
                            max={1}
                            step={0.01}
                            value={volume}
                            tooltip={{formatter: value => `${Math.round((value || 0) * 100)}%`}}
                            onChange={setVolume}
                        />
                    </div>
                </div>

                <KaraokeLyrics currentTime={currentTime} metadata={metadata} onSeek={seek} />
            </section>
        </main>
    );
};

/** 提供独立音频生命周期的沉浸式播放器路由。 */
export default function ImmersivePlayerPage() {
    return (
        <MusicAudioProvider>
            <ImmersivePlayerContent />
        </MusicAudioProvider>
    );
}
