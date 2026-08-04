import {RefObject, useEffect, useRef, useState} from 'react';
import * as bodyPix from '@tensorflow-models/body-pix';
import * as tf from '@tensorflow/tfjs';
import {drawVideoCover, getVideoCoverRect, resizeCanvasToDisplay} from '../shared/canvas-video';
import style from './style.module.scss';

/** 背景移除算法。 */
export type BackgroundKeyMode = 'chroma' | 'ai';
/** 可替换的三种虚拟背景。 */
export type VirtualBackground = 'studio' | 'city' | 'solid';
/** BodyPix 生命周期状态。 */
type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';

/** 绿幕与 AI 人像抠像舞台参数。 */
interface BackgroundStageProps {
    /** 当前视频来源。 */
    videoRef: RefObject<HTMLVideoElement>;
    /** 色度键或 AI 分割模式。 */
    mode: BackgroundKeyMode;
    /** 绿色判定门限，值越高保留的绿色越多。 */
    threshold: number;
    /** 主体后方的虚拟背景。 */
    background: VirtualBackground;
}

/** 绘制三种不依赖图片资源的虚拟摄影棚背景。 */
const drawVirtualBackground = (
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    background: VirtualBackground,
    timestamp: number,
) => {
    if (background === 'solid') {
        context.fillStyle = '#4f68d8';
        context.fillRect(0, 0, width, height);
        context.fillStyle = '#ffd166';
        context.fillRect(width * 0.08, height * 0.13, width * 0.015, height * 0.74);
        return;
    }

    if (background === 'city') {
        context.fillStyle = '#102340';
        context.fillRect(0, 0, width, height);
        context.fillStyle = '#e35f78';
        context.beginPath();
        context.arc(width * 0.78, height * 0.22, Math.min(width, height) * 0.11, 0, Math.PI * 2);
        context.fill();
        // 建筑高度使用固定公式，窗口随时间交替亮起。
        for (let index = 0; index < 18; index += 1) {
            const buildingWidth = width / 17;
            const buildingHeight = height * (0.22 + ((index * 37) % 48) / 100);
            const x = index * buildingWidth - buildingWidth * 0.2;
            const top = height - buildingHeight;
            context.fillStyle = index % 2 ? '#11171f' : '#19242f';
            context.fillRect(x, top, buildingWidth * 0.82, buildingHeight);
            context.fillStyle = (index + Math.floor(timestamp / 700)) % 3 ? '#ffd166' : '#49d7c3';
            for (let row = 0; row < 6; row += 1) {
                context.fillRect(x + buildingWidth * 0.2, top + 18 + row * 26, buildingWidth * 0.12, 8);
                context.fillRect(x + buildingWidth * 0.52, top + 18 + row * 26, buildingWidth * 0.12, 8);
            }
        }
        return;
    }

    // 摄影棚背景使用明确的平面色块和透视线，避免单一色背景缺少空间感。
    context.fillStyle = '#17191d';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#1d6f73';
    context.fillRect(0, 0, width * 0.27, height);
    context.fillStyle = '#d65371';
    context.fillRect(width * 0.78, 0, width * 0.22, height);
    context.fillStyle = '#d7dde0';
    context.beginPath();
    context.arc(width * 0.72, height * 0.2, Math.min(width, height) * 0.09, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    context.lineWidth = 1;
    for (let index = -6; index <= 6; index += 1) {
        context.beginPath();
        context.moveTo(width / 2, height * 0.55);
        context.lineTo(width / 2 + index * width * 0.15, height);
        context.stroke();
    }
};

/**
 * 使用 Canvas 色度键或 BodyPix 像素蒙版，把主体合成到虚拟背景。
 */
export const BackgroundStage = ({background, mode, threshold, videoRef}: BackgroundStageProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const workCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
    // 第一次渲染才建立离屏缓冲区，后续 React 更新复用相同 Canvas。
    if (!workCanvasRef.current) workCanvasRef.current = document.createElement('canvas');
    if (!maskCanvasRef.current) maskCanvasRef.current = document.createElement('canvas');
    const modelRef = useRef<bodyPix.BodyPix | null>(null);
    const modelPromiseRef = useRef<Promise<bodyPix.BodyPix> | null>(null);
    const isMountedRef = useRef(true);
    const segmentationRef = useRef<bodyPix.SemanticPersonSegmentation | null>(null);
    const inferencePendingRef = useRef(false);
    const lastInferenceAtRef = useRef(0);
    const settingsRef = useRef({background, mode, threshold});
    const [modelStatus, setModelStatus] = useState<ModelStatus>('idle');
    const [inferenceFps, setInferenceFps] = useState(0);
    const inferenceCounterRef = useRef({count: 0, startedAt: 0});
    settingsRef.current = {background, mode, threshold};

    // AI 模式首次打开时加载轻量 MobileNet BodyPix，之后切换模式复用同一个模型。
    useEffect(() => {
        if (mode !== 'ai' || modelRef.current || modelPromiseRef.current) return;
        setModelStatus('loading');
        modelPromiseRef.current = tf.ready()
            .then(() => bodyPix.load({
                architecture: 'MobileNetV1',
                outputStride: 16,
                multiplier: 0.5,
                quantBytes: 2,
            }))
            .then(model => {
                if (!isMountedRef.current) {
                    model.dispose();
                    throw new Error('页面已卸载');
                }
                modelRef.current = model;
                setModelStatus('ready');
                return model;
            })
            .catch(error => {
                if (isMountedRef.current) setModelStatus('error');
                throw error;
            });
        // Promise 自身有 catch，清空引用后允许用户重新进入页面再次加载。
        void modelPromiseRef.current.catch(() => {
            modelPromiseRef.current = null;
        });
    }, [mode]);

    // 页面真正卸载时释放模型中的 Tensor 和 WebGL 纹理。
    useEffect(() => {
        // React StrictMode 重挂载时恢复标记，模型异步结果仍可交给当前页面。
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            modelRef.current?.dispose();
            modelRef.current = null;
        };
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        const workCanvas = workCanvasRef.current!;
        const maskCanvas = maskCanvasRef.current!;
        const workContext = workCanvas.getContext('2d', {willReadFrequently: true});
        if (!canvas || !context || !workContext) return;
        let displaySize = resizeCanvasToDisplay(canvas, context);
        let animationFrameId = 0;
        let lastDrawAt = 0;

        /** 按舞台宽高比更新低分辨率处理缓冲区，控制逐像素工作量。 */
        const resizeWorkCanvas = () => {
            const processWidth = Math.max(240, Math.min(640, Math.round(displaySize.width)));
            const processHeight = Math.max(160, Math.min(420, Math.round(processWidth * displaySize.height / displaySize.width)));
            if (workCanvas.width !== processWidth || workCanvas.height !== processHeight) {
                workCanvas.width = processWidth;
                workCanvas.height = processHeight;
            }
        };
        resizeWorkCanvas();

        /** 把最新 BodyPix 二值结果转换成可模糊处理的 Alpha Canvas。 */
        const updateAiMaskCanvas = (segmentation: bodyPix.SemanticPersonSegmentation) => {
            maskCanvas.width = segmentation.width;
            maskCanvas.height = segmentation.height;
            const maskContext = maskCanvas.getContext('2d');
            if (!maskContext) return;
            const maskImage = maskContext.createImageData(segmentation.width, segmentation.height);
            for (let pixel = 0; pixel < segmentation.data.length; pixel += 1) {
                const offset = pixel * 4;
                maskImage.data[offset] = 255;
                maskImage.data[offset + 1] = 255;
                maskImage.data[offset + 2] = 255;
                maskImage.data[offset + 3] = segmentation.data[pixel] ? 255 : 0;
            }
            maskContext.putImageData(maskImage, 0, 0);
        };

        /** 在空闲时发起一轮 BodyPix 推理，最多约每秒 8 次。 */
        const requestSegmentation = (video: HTMLVideoElement, timestamp: number) => {
            const model = modelRef.current;
            if (!model || inferencePendingRef.current || timestamp - lastInferenceAtRef.current < 120) return;
            inferencePendingRef.current = true;
            lastInferenceAtRef.current = timestamp;
            void model.segmentPerson(video, {
                flipHorizontal: false,
                internalResolution: 'medium',
                segmentationThreshold: 0.68,
                maxDetections: 1,
                scoreThreshold: 0.3,
                nmsRadius: 20,
            }).then(segmentation => {
                segmentationRef.current = segmentation;
                updateAiMaskCanvas(segmentation);
                const counter = inferenceCounterRef.current;
                if (!counter.startedAt) counter.startedAt = performance.now();
                counter.count += 1;
                const elapsed = performance.now() - counter.startedAt;
                if (elapsed >= 1000) {
                    setInferenceFps(Math.round(counter.count * 1000 / elapsed));
                    inferenceCounterRef.current = {count: 0, startedAt: performance.now()};
                }
            }).catch(() => {
                if (isMountedRef.current) setModelStatus('error');
            }).finally(() => {
                inferencePendingRef.current = false;
            });
        };

        /** 对当前低分辨率视频帧执行绿色判定，并降低边缘绿溢色。 */
        const applyChromaKey = () => {
            const image = workContext.getImageData(0, 0, workCanvas.width, workCanvas.height);
            const pixels = image.data;
            const thresholdValue = settingsRef.current.threshold;
            for (let offset = 0; offset < pixels.length; offset += 4) {
                const red = pixels[offset];
                const green = pixels[offset + 1];
                const blue = pixels[offset + 2];
                const dominance = (green - Math.max(red, blue)) / 255;
                const brightness = green / 255;
                const keyAmount = Math.max(0, Math.min(1, (dominance - thresholdValue + 0.1) / 0.1))
                    * Math.max(0, Math.min(1, (brightness - 0.18) / 0.32));
                pixels[offset + 3] = Math.round(255 * (1 - keyAmount));
                if (keyAmount > 0.05) pixels[offset + 1] = Math.min(green, Math.max(red, blue) * 1.08);
            }
            workContext.putImageData(image, 0, 0);
        };

        /** 每秒最多处理 30 张 Canvas 帧，AI 推理独立以更低频率运行。 */
        const draw = (timestamp: number) => {
            animationFrameId = requestAnimationFrame(draw);
            if (timestamp - lastDrawAt < 33) return;
            lastDrawAt = timestamp;
            const video = videoRef.current;
            const settings = settingsRef.current;
            if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

            // 第一步：在主画布绘制当前虚拟背景。
            context.clearRect(0, 0, displaySize.width, displaySize.height);
            drawVirtualBackground(context, displaySize.width, displaySize.height, settings.background, timestamp);
            // 第二步：把视频 cover 绘制到低分辨率工作区。
            workContext.clearRect(0, 0, workCanvas.width, workCanvas.height);
            drawVideoCover(workContext, video, 0, 0, workCanvas.width, workCanvas.height);

            if (settings.mode === 'chroma') {
                applyChromaKey();
            } else {
                requestSegmentation(video, timestamp);
                const segmentation = segmentationRef.current;
                if (segmentation) {
                    // 第三步：BodyPix 蒙版采用与视频相同的 cover 裁剪，并轻微模糊硬边缘。
                    const maskSource = getVideoCoverRect(
                        segmentation.width,
                        segmentation.height,
                        workCanvas.width,
                        workCanvas.height,
                    );
                    workContext.save();
                    workContext.globalCompositeOperation = 'destination-in';
                    workContext.filter = 'blur(2px)';
                    workContext.drawImage(
                        maskCanvas,
                        maskSource.sourceX,
                        maskSource.sourceY,
                        maskSource.sourceWidth,
                        maskSource.sourceHeight,
                        0,
                        0,
                        workCanvas.width,
                        workCanvas.height,
                    );
                    workContext.restore();
                }
            }

            // 第四步：把已带透明通道的主体放大合成到主画布。
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
            context.drawImage(workCanvas, 0, 0, displaySize.width, displaySize.height);
        };

        const resizeObserver = new ResizeObserver(() => {
            displaySize = resizeCanvasToDisplay(canvas, context);
            resizeWorkCanvas();
        });
        resizeObserver.observe(canvas);
        animationFrameId = requestAnimationFrame(draw);
        return () => {
            cancelAnimationFrame(animationFrameId);
            resizeObserver.disconnect();
            inferencePendingRef.current = false;
        };
    }, [videoRef]);

    return (
        <div className={style.stage}>
            <canvas ref={canvasRef} aria-label="绿幕抠像与 BodyPix 人像虚拟背景" />
            <div className={style.modelBadge} data-status={modelStatus}>
                {mode === 'chroma'
                    ? 'CHROMA KEY / CANVAS PIXELS'
                    : modelStatus === 'ready'
                        ? `BODYPIX / ${inferenceFps || '--'} FPS`
                        : modelStatus === 'loading'
                            ? 'BODYPIX / LOADING MODEL'
                            : modelStatus === 'error'
                                ? 'BODYPIX / MODEL ERROR'
                                : 'BODYPIX / STANDBY'}
            </div>
        </div>
    );
};
