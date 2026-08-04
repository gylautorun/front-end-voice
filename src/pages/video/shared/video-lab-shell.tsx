import {ChangeEvent, ReactNode, useRef} from 'react';
import {
    AudioMutedOutlined,
    CameraOutlined,
    PauseCircleFilled,
    PlayCircleFilled,
    ReloadOutlined,
    SoundOutlined,
    UploadOutlined,
    VideoCameraOutlined,
} from '@ant-design/icons';
import {Alert, Button, Slider, Tooltip} from 'antd';
import {VideoSourceController} from './use-video-source';
import style from './style.module.scss';

/** 视频效果共享页面外壳参数。 */
interface VideoLabShellProps {
    /** 页面顶端技术分类。 */
    eyebrow: string;
    /** 页面标题。 */
    title: string;
    /** 当前效果特有的参数控件。 */
    controls?: ReactNode;
    /** Canvas、WebGL 或滚动视频舞台。 */
    children: ReactNode;
    /** 页面的视频来源控制器。 */
    source: VideoSourceController;
    /** 滚动逐帧页面不需要摄像头入口。 */
    allowCamera?: boolean;
}

/** 把秒数格式化成视频控制栏使用的 mm:ss。 */
const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
};

/** 四个视频效果页面共享的视频来源、舞台和播放控制外壳。 */
export const VideoLabShell = ({
    allowCamera = true,
    children,
    controls,
    eyebrow,
    source,
    title,
}: VideoLabShellProps) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    /** 从文件选择事件读取首个视频并清空 input，允许重复选择同一文件。 */
    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) source.loadFile(file);
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
                    <i className={source.isPlaying ? style.liveDot : style.idleDot} />
                    {source.isPlaying ? '视频运行中' : source.isReady ? '画面已就绪' : '正在准备视频'}
                </div>
            </header>

            <section className={style.sourceBar} aria-label="视频来源与效果参数">
                <div className={style.sourceIdentity}>
                    <VideoCameraOutlined />
                    <div>
                        <strong title={source.sourceName}>{source.sourceName}</strong>
                        <span>{source.kind === 'camera' ? 'LIVE CAMERA' : source.kind === 'uploaded' ? 'LOCAL VIDEO' : 'GENERATED VIDEO'}</span>
                    </div>
                </div>
                <div className={style.sourceActions}>
                    {controls}
                    <Tooltip title="选择本地视频">
                        <Button icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>
                            上传视频
                        </Button>
                    </Tooltip>
                    {allowCamera && (
                        <Tooltip title="使用摄像头">
                            <Button
                                shape="circle"
                                aria-label="使用摄像头"
                                icon={<CameraOutlined />}
                                onClick={() => void source.startCamera()}
                            />
                        </Tooltip>
                    )}
                    <Tooltip title="恢复内置演示">
                        <Button
                            shape="circle"
                            aria-label="恢复内置演示"
                            icon={<ReloadOutlined />}
                            onClick={source.loadDemo}
                        />
                    </Tooltip>
                    <input
                        ref={fileInputRef}
                        className={style.fileInput}
                        type="file"
                        accept="video/*,.mp4,.webm,.mov,.m4v,.ogv"
                        onChange={handleFileChange}
                    />
                </div>
            </section>

            {source.error && <Alert className={style.alert} type="error" showIcon message={source.error} />}

            <section className={style.stage} aria-busy={!source.isReady}>
                {children}
                {!source.isReady && <div className={style.loading}>正在生成视频帧...</div>}
            </section>

            <section className={style.transport} aria-label="视频播放控制">
                <Tooltip title={source.isPlaying ? '暂停' : '播放'}>
                    <Button
                        type="text"
                        shape="circle"
                        className={style.playButton}
                        icon={source.isPlaying ? <PauseCircleFilled /> : <PlayCircleFilled />}
                        onClick={source.togglePlayback}
                    />
                </Tooltip>
                <time>{source.duration ? formatTime(source.currentTime) : 'LIVE'}</time>
                <Slider
                    className={style.progress}
                    min={0}
                    max={source.duration || 1}
                    step={0.01}
                    value={source.duration ? Math.min(source.currentTime, source.duration) : 0}
                    disabled={!source.duration}
                    tooltip={{formatter: value => formatTime(value || 0)}}
                    onChange={source.seek}
                />
                <time>{source.duration ? formatTime(source.duration) : '--:--'}</time>
                <Tooltip title={source.isMuted ? '打开声音' : '静音'}>
                    <Button
                        type="text"
                        shape="circle"
                        aria-label={source.isMuted ? '打开声音' : '静音'}
                        icon={source.isMuted ? <AudioMutedOutlined /> : <SoundOutlined />}
                        onClick={source.toggleMuted}
                    />
                </Tooltip>
            </section>

            <video ref={source.videoRef} className={style.hiddenVideo} playsInline />
        </main>
    );
};
