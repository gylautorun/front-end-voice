import {ChangeEvent, ReactNode, useRef} from 'react';
import {
    PauseCircleFilled,
    PlayCircleFilled,
    ReloadOutlined,
    SoundOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import {Alert, Button, Slider, Tooltip} from 'antd';
import {formatDuration, formatFileSize} from '../audio-visualizer/formatters';
import {useMusicAudio} from './music-audio-context';
import style from './style.module.scss';

/** 音乐实验页公共外壳参数。 */
interface MusicLabShellProps {
    /** 页面主标题。 */
    title: string;
    /** 标题上方的短分类名。 */
    eyebrow: string;
    /** 当前页面的模式控件。 */
    modeControl: ReactNode;
    /** Canvas 或 WebGL 可视化舞台。 */
    children: ReactNode;
}

/** 四个音乐路由共享的标题、音轨、上传和播放控制外壳。 */
export const MusicLabShell = ({children, eyebrow, modeControl, title}: MusicLabShellProps) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const {
        currentTime,
        duration,
        error,
        isParsing,
        isPlaying,
        loadUserFile,
        metadata,
        reset,
        seek,
        setVolume,
        togglePlayback,
        volume,
    } = useMusicAudio();

    /** 将原生文件选择事件收敛成单个 File。 */
    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) loadUserFile(file);
        // 清空 input，允许用户连续选择同一个文件。
        event.target.value = '';
    };

    return (
        <main className={style.page}>
            <header className={style.header}>
                <div>
                    <span className={style.eyebrow}>{eyebrow}</span>
                    <h1>{title}</h1>
                </div>
                <div className={style.status}>
                    <i className={isPlaying ? style.liveDot : style.idleDot} />
                    {isParsing ? '解析中' : isPlaying ? '实时响应' : '等待播放'}
                </div>
            </header>

            <section className={style.sourceBar} aria-label="音频来源和显示模式">
                <div className={style.trackIdentity}>
                    <div className={style.miniSpectrum} aria-hidden="true">
                        <i /><i /><i /><i /><i />
                    </div>
                    <div className={style.trackText}>
                        <strong title={metadata?.name}>{metadata?.name || '正在准备示例音频'}</strong>
                        <span>{metadata ? `${metadata.type} · ${formatFileSize(metadata.size)}` : 'MUSIC AUDIO'}</span>
                    </div>
                </div>

                <div className={style.sourceActions}>
                    {modeControl}
                    <Tooltip title="选择本地音频">
                        <Button
                            icon={<UploadOutlined />}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            上传音频
                        </Button>
                    </Tooltip>
                    <input
                        ref={fileInputRef}
                        className={style.fileInput}
                        type="file"
                        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
                        onChange={handleFileChange}
                    />
                </div>
            </section>

            {error && <Alert className={style.alert} type="error" message={error} showIcon />}

            <section className={style.stageBand} aria-busy={isParsing}>
                {children}
                {isParsing && <div className={style.parsing}>正在解析音频…</div>}
            </section>

            <section className={style.transport} aria-label="音频播放控制">
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
                <Tooltip title="回到开头">
                    <Button
                        type="text"
                        shape="circle"
                        disabled={!metadata}
                        icon={<ReloadOutlined />}
                        onClick={reset}
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
                <SoundOutlined className={style.soundIcon} />
                <Slider
                    className={style.volume}
                    min={0}
                    max={1}
                    step={0.01}
                    value={volume}
                    tooltip={{formatter: value => `${Math.round((value || 0) * 100)}%`}}
                    onChange={setVolume}
                />
            </section>
        </main>
    );
};
