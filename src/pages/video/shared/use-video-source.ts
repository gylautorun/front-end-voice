import {RefObject, useCallback, useEffect, useRef, useState} from 'react';

/** 内置演示素材的画面类型。 */
export type DemoVideoVariant = 'editorial' | 'green-screen';
/** 当前视频来自浏览器演示、用户文件或摄像头。 */
export type VideoSourceKind = 'demo' | 'uploaded' | 'camera';

/** 视频效果页面共用的视频来源状态与操作。 */
export interface VideoSourceController {
    /** 所有效果读取的唯一 HTMLVideoElement。 */
    videoRef: RefObject<HTMLVideoElement>;
    /** 当前来源类型。 */
    kind: VideoSourceKind;
    /** 工具栏显示的来源名称。 */
    sourceName: string;
    /** 视频是否已经具备可绘制帧。 */
    isReady: boolean;
    /** 视频是否正在播放。 */
    isPlaying: boolean;
    /** 视频是否静音。 */
    isMuted: boolean;
    /** 有限媒体文件的当前秒数。 */
    currentTime: number;
    /** 有限媒体文件的总秒数；流媒体为 0。 */
    duration: number;
    /** 摄像头或文件解析错误。 */
    error: string | null;
    /** 从 File 对象加载用户视频。 */
    loadFile: (file: File) => void;
    /** 请求摄像头并切换到实时画面。 */
    startCamera: () => Promise<void>;
    /** 恢复浏览器生成的内置演示视频。 */
    loadDemo: () => void;
    /** 播放或暂停当前视频。 */
    togglePlayback: () => void;
    /** 切换视频声音。 */
    toggleMuted: () => void;
    /** 跳转有限视频的播放位置。 */
    seek: (time: number) => void;
}

/** 浏览器生成的演示流及其释放方法。 */
interface DemoStreamHandle {
    stream: MediaStream;
    stop: () => void;
}

/**
 * 在离屏 Canvas 中生成可被 VideoTexture、Canvas 和 CSS 效果共同读取的演示视频。
 * 不依赖远程视频，断网时四个页面仍有连续运动素材。
 */
const createDemoStream = (variant: DemoVideoVariant): DemoStreamHandle => {
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    const context = canvas.getContext('2d');
    let animationFrameId = 0;

    /** 绘制彩色编辑动态素材，保证扭曲和文字遮罩具有可辨认细节。 */
    const drawEditorialFrame = (timestamp: number) => {
        if (!context) return;
        const time = timestamp / 1000;
        context.fillStyle = '#071011';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // 固定网格提供形变参照，Shader 扭曲时能直接看出位移方向。
        context.strokeStyle = 'rgba(112, 151, 143, 0.22)';
        context.lineWidth = 1;
        for (let x = 0; x <= canvas.width; x += 48) {
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x, canvas.height);
            context.stroke();
        }
        for (let y = 0; y <= canvas.height; y += 48) {
            context.beginPath();
            context.moveTo(0, y);
            context.lineTo(canvas.width, y);
            context.stroke();
        }

        // 三个色块以不同周期横向运动，产生明确的前后层次和颜色边缘。
        const blockOffset = (time * 92) % (canvas.width + 260) - 260;
        context.fillStyle = '#ef476f';
        context.fillRect(blockOffset, 72, 250, 396);
        context.fillStyle = '#35c995';
        context.fillRect(canvas.width - blockOffset - 310, 116, 190, 310);
        context.fillStyle = '#4f7cff';
        context.fillRect(350 + Math.sin(time * 0.72) * 160, 0, 132, canvas.height);

        // 黄圆沿椭圆轨迹移动，为水波和色差提供高对比曲线轮廓。
        const circleX = canvas.width / 2 + Math.cos(time * 1.05) * 270;
        const circleY = canvas.height / 2 + Math.sin(time * 1.38) * 150;
        context.fillStyle = '#ffd166';
        context.beginPath();
        context.arc(circleX, circleY, 76, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = '#f5f8f6';
        context.font = '700 76px sans-serif';
        context.textAlign = 'center';
        context.fillText('MOTION', canvas.width / 2, canvas.height / 2 + 22);
        context.fillStyle = '#071011';
        context.font = '700 16px monospace';
        context.fillText(`FRAME ${String(Math.floor(time * 30) % 9999).padStart(4, '0')}`, canvas.width / 2, canvas.height / 2 + 62);
    };

    /** 绘制绿幕人物替身，色度键页面打开后能立即观察抠像边缘。 */
    const drawGreenScreenFrame = (timestamp: number) => {
        if (!context) return;
        const time = timestamp / 1000;
        const centerX = canvas.width / 2 + Math.sin(time * 0.8) * 115;
        const bounce = Math.sin(time * 1.6) * 8;
        context.fillStyle = '#12a84f';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#0f8f43';
        context.fillRect(0, 430, canvas.width, 110);

        // 头、身体和手臂刻意不使用绿色，模拟可被色度键保留的主体。
        context.fillStyle = '#ffd0a8';
        context.beginPath();
        context.arc(centerX, 150 + bounce, 58, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#222a36';
        context.beginPath();
        context.arc(centerX, 131 + bounce, 60, Math.PI, Math.PI * 2);
        context.fill();
        context.fillStyle = '#e44f78';
        context.fillRect(centerX - 92, 204 + bounce, 184, 226);
        context.strokeStyle = '#ffd0a8';
        context.lineWidth = 34;
        context.lineCap = 'round';
        context.beginPath();
        context.moveTo(centerX - 72, 230 + bounce);
        context.lineTo(centerX - 160 - Math.sin(time * 1.9) * 45, 330 + bounce);
        context.moveTo(centerX + 72, 230 + bounce);
        context.lineTo(centerX + 160 + Math.sin(time * 1.9) * 45, 330 + bounce);
        context.stroke();
        context.fillStyle = '#f7f3e8';
        context.font = '700 22px monospace';
        context.textAlign = 'center';
        context.fillText('GREEN SCREEN', centerX, 320 + bounce);
    };

    /** 每帧选择对应演示场景并继续动画。 */
    const render = (timestamp: number) => {
        if (variant === 'green-screen') drawGreenScreenFrame(timestamp);
        else drawEditorialFrame(timestamp);
        animationFrameId = requestAnimationFrame(render);
    };
    animationFrameId = requestAnimationFrame(render);
    const stream = canvas.captureStream(30);

    return {
        stream,
        stop: () => {
            cancelAnimationFrame(animationFrameId);
            stream.getTracks().forEach(track => track.stop());
        },
    };
};

/** 管理视频演示流、上传文件和摄像头三种互斥来源。 */
export const useVideoSource = (demoVariant: DemoVideoVariant = 'editorial'): VideoSourceController => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const isMountedRef = useRef(true);
    const demoStopRef = useRef<(() => void) | null>(null);
    const objectUrlRef = useRef<string | null>(null);
    const [kind, setKind] = useState<VideoSourceKind>('demo');
    const [sourceName, setSourceName] = useState('浏览器动态演示');
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [error, setError] = useState<string | null>(null);

    /** 停止当前流、动画和对象 URL，保证三种来源不会同时占用资源。 */
    const releaseCurrentSource = useCallback(() => {
        const video = videoRef.current;
        video?.pause();
        demoStopRef.current?.();
        demoStopRef.current = null;
        if (video?.srcObject instanceof MediaStream) {
            video.srcObject.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
        }
        if (video) {
            video.removeAttribute('src');
            video.load();
        }
    }, []);

    /** 建立内置 Canvas 流并立即静音播放。 */
    const loadDemo = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        releaseCurrentSource();
        const demo = createDemoStream(demoVariant);
        demoStopRef.current = demo.stop;
        video.srcObject = demo.stream;
        video.loop = false;
        video.muted = true;
        setKind('demo');
        setSourceName('浏览器动态演示');
        setIsMuted(true);
        setIsReady(false);
        setCurrentTime(0);
        setDuration(0);
        setError(null);
        void video.play().catch(() => setError('演示视频需要点击播放后才能启动'));
    }, [demoVariant, releaseCurrentSource]);

    /** 切换到用户选择的本地视频文件。 */
    const loadFile = useCallback((file: File) => {
        const video = videoRef.current;
        if (!video) return;
        if (!file.type.startsWith('video/')) {
            setError('请选择浏览器支持的视频文件');
            return;
        }
        releaseCurrentSource();
        const objectUrl = URL.createObjectURL(file);
        objectUrlRef.current = objectUrl;
        video.src = objectUrl;
        video.loop = true;
        video.muted = isMuted;
        setKind('uploaded');
        setSourceName(file.name);
        setIsReady(false);
        setCurrentTime(0);
        setDuration(0);
        setError(null);
        video.load();
        void video.play().catch(() => undefined);
    }, [isMuted, releaseCurrentSource]);

    /** 在用户手势内申请摄像头，并切换为无音频的实时视频流。 */
    const startCamera = useCallback(async () => {
        const video = videoRef.current;
        if (!video) return;
        if (!navigator.mediaDevices?.getUserMedia) {
            setError('当前浏览器不支持摄像头视频流');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {width: {ideal: 1280}, height: {ideal: 720}, facingMode: 'user'},
            });
            // 权限面板打开期间页面可能已经卸载，届时立即归还刚取得的摄像头轨道。
            if (!isMountedRef.current || videoRef.current !== video) {
                stream.getTracks().forEach(track => track.stop());
                return;
            }
            releaseCurrentSource();
            video.srcObject = stream;
            video.loop = false;
            video.muted = true;
            setKind('camera');
            setSourceName('实时摄像头');
            setIsMuted(true);
            setIsReady(false);
            setCurrentTime(0);
            setDuration(0);
            setError(null);
            await video.play();
        } catch (reason) {
            const message = reason instanceof Error ? reason.message : '摄像头启动失败';
            setError(`无法使用摄像头：${message}`);
        }
    }, [releaseCurrentSource]);

    /** 在同一个 HTMLVideoElement 上切换播放状态。 */
    const togglePlayback = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) void video.play().catch(() => setError('浏览器阻止了视频播放'));
        else video.pause();
    }, []);

    /** 切换静音并同步 React 工具栏状态。 */
    const toggleMuted = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        video.muted = !video.muted;
        setIsMuted(video.muted);
    }, []);

    /** 只有上传文件具有有限时长，流媒体不执行 seek。 */
    const seek = useCallback((time: number) => {
        const video = videoRef.current;
        if (!video || !Number.isFinite(video.duration)) return;
        video.currentTime = Math.max(0, Math.min(video.duration, time));
    }, []);

    // 监听原生媒体事件，把唯一 VideoElement 状态同步给所有页面控件。
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const handleReady = () => {
            setIsReady(video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
            setDuration(Number.isFinite(video.duration) ? video.duration : 0);
        };
        const handleTime = () => setCurrentTime(video.currentTime || 0);
        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);
        video.addEventListener('loadeddata', handleReady);
        video.addEventListener('loadedmetadata', handleReady);
        video.addEventListener('timeupdate', handleTime);
        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);
        return () => {
            video.removeEventListener('loadeddata', handleReady);
            video.removeEventListener('loadedmetadata', handleReady);
            video.removeEventListener('timeupdate', handleTime);
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
        };
    }, []);

    // 页面挂载后启动演示，卸载时释放文件 URL、摄像头和 Canvas 动画。
    useEffect(() => {
        // React 开发模式会执行一次 effect 清理后重新挂载，需要恢复存活标记。
        isMountedRef.current = true;
        loadDemo();
        return () => {
            isMountedRef.current = false;
            releaseCurrentSource();
        };
    }, [loadDemo, releaseCurrentSource]);

    return {
        videoRef,
        kind,
        sourceName,
        isReady,
        isPlaying,
        isMuted,
        currentTime,
        duration,
        error,
        loadFile,
        startCamera,
        loadDemo,
        togglePlayback,
        toggleMuted,
        seek,
    };
};
