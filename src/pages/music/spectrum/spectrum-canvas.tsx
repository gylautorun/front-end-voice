import {RefObject, useEffect, useRef} from 'react';
import {getFrequencyBand} from '../audio-visualizer/frequency-bands';
import {AudioFrameReader, sampleLogFrequency} from '../shared/audio-frame';
import style from './style.module.scss';

/**
 * `mirror-bars`：以中间基线向上下绘制发光窄柱。
 * `radial`：围绕黑胶唱片绘制环形频谱。
 * `oscilloscope`：使用时域数据绘制示波器线条。
 */
export type SpectrumMode = 'mirror-bars' | 'radial' | 'oscilloscope';

/** 经典频谱 Canvas 的受控参数。 */
interface SpectrumCanvasProps {
    /** 页面共享的 Web Audio 分析节点。 */
    analyserRef: RefObject<AnalyserNode | null>;
    /** 动画时间倍率，1 为默认速度。 */
    animationSpeed: number;
    /** 当前经典可视化模式。 */
    mode: SpectrumMode;
    /** 音频能量映射倍率，1 为原始响应。 */
    responseGain: number;
}

/**
 * 给 Canvas 配置高 DPI 缓冲区，并返回后续绘图使用的 CSS 像素尺寸。
 *
 * @param canvas 需要调整内部像素缓冲区的 Canvas 元素。
 * @param context Canvas 对应的 2D 绘图上下文。
 * @returns 不含设备像素倍率的宽高，绘图方法统一使用这组尺寸。
 */
const resizeCanvas = (canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) => {
    // 第一步：读取 Canvas 在当前响应式布局中的 CSS 尺寸。
    const bounds = canvas.getBoundingClientRect();
    // 第二步：最多使用 2 倍像素，兼顾高 DPI 清晰度和每帧绘制开销。
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    // 第三步：确保宽高至少为 1，避免隐藏或初始化阶段创建无效缓冲区。
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);

    // 第四步：内部缓冲区使用“CSS 尺寸 x 像素倍率”，避免高分屏模糊。
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    // 第五步：把坐标系缩回 CSS 像素，后续方法无需重复乘 ratio。
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    // 最后返回逻辑尺寸，动画循环用它清屏并计算布局。
    return {width, height};
};

/**
 * 绘制弱网格与中心基线，帮助观察幅度变化。
 *
 * @param context 当前 Canvas 的 2D 上下文。
 * @param width Canvas 的 CSS 像素宽度。
 * @param height Canvas 的 CSS 像素高度。
 */
const drawGrid = (context: CanvasRenderingContext2D, width: number, height: number) => {
    // 保存调用方样式，防止网格颜色和线宽污染后续频谱绘制。
    context.save();
    // 使用低透明度网格，只提供坐标参照而不抢夺波形视觉重点。
    context.strokeStyle = 'rgba(150, 180, 170, 0.08)';
    context.lineWidth = 1;

    // 从左到右每隔 56px 绘制一条竖线。
    for (let x = 0; x <= width; x += 56) {
        // 每条线使用独立路径，避免把相邻网格错误连接。
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
    }
    // 从顶部预留 48px 后每隔 56px 绘制一条横线。
    for (let y = 48; y <= height; y += 56) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
    }

    // 中心基线使用更亮的绿色，明确镜像频谱的上下分界。
    context.strokeStyle = 'rgba(112, 231, 190, 0.22)';
    context.beginPath();
    context.moveTo(0, height / 2);
    context.lineTo(width, height / 2);
    context.stroke();
    // 恢复进入方法前的绘图状态。
    context.restore();
};

/**
 * 绘制比普通柱图更窄、更平滑的上下镜像频谱。
 *
 * @param context 当前 Canvas 的 2D 上下文。
 * @param width Canvas 的 CSS 像素宽度。
 * @param height Canvas 的 CSS 像素高度。
 * @param frame 本帧读取到的时域、频域及能量数据。
 * @param smoothedLevels 跨帧保存的每根柱高度，用于上升/下降缓动。
 * @param timestamp 已乘动画速度的连续视觉时间，单位为毫秒。
 * @param responseGain 用户设置的音频响应倍率。
 */
const drawMirrorBars = (
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    frame: ReturnType<AudioFrameReader['read']>,
    smoothedLevels: number[],
    timestamp: number,
    responseGain: number,
) => {
    // 第一步：根据画布宽度动态决定柱数，小屏不少于 48 根，大屏不超过 128 根。
    const barCount = Math.max(48, Math.min(128, Math.floor(width / 10)));
    // 第二步：间距约占单柱槽位的 46%，且至少保留 3px，保持窄柱呼吸感。
    const gap = Math.max(3, width / barCount * 0.46);
    // 第三步：用剩余宽度计算柱宽，并限制在 2-5px 之间。
    const barWidth = Math.max(2, Math.min(5, (width - gap * (barCount - 1)) / barCount));
    // 第四步：计算整组柱子的实际占用宽度，用于整体水平居中。
    const contentWidth = barCount * barWidth + (barCount - 1) * gap;
    const startX = (width - contentWidth) / 2;
    // 第五步：上下柱共享画布正中间的基线。
    const baseline = height / 2;
    // 第六步：顶部和底部各保留 54px，避免最高柱贴住 Canvas 边缘。
    const maximumHeight = Math.max(20, baseline - 54);

    // 逐根柱采样频谱并绘制上下镜像。
    for (let index = 0; index < barCount; index += 1) {
        // 把柱序号归一化到 0-1，0 对应低频，1 对应最高频。
        const progress = index / Math.max(1, barCount - 1);
        // 使用对数频率采样，让人耳更敏感的低频区域获得更多可见柱子。
        const audioLevel = sampleLogFrequency(
            frame.frequencyData,
            progress,
            frame.sampleRate,
            frame.frequencyData.length * 2,
        );
        // 尚未播放时用极弱三角函数呼吸，避免页面只剩一条完全静止的基线。
        const idleLevel = 0.035
            + (Math.sin(progress * Math.PI * 5 + timestamp * 0.0006) + 1) * 0.014;
        // 有有效音频时应用响应倍率并限制到 1；静音时改用上面的待机振幅。
        const rawLevel = frame.energy.overall > 0.002
            ? Math.min(1, audioLevel * responseGain)
            : idleLevel;
        // 读取该柱上一帧的高度，首次出现时从 0 开始。
        const previousLevel = smoothedLevels[index] || 0;
        // 上升用 0.42 快速跟随鼓点，下降用 0.12 保留平滑拖尾。
        const easing = rawLevel > previousLevel ? 0.42 : 0.12;
        // 线性插值出本帧高度并写回数组，供下一帧继续缓动。
        const level = previousLevel + (rawLevel - previousLevel) * easing;
        smoothedLevels[index] = level;

        // 把归一化位置映射到 20Hz-20kHz，取得对应七段频率颜色。
        const frequency = 20 * Math.pow(1000, progress);
        const color = getFrequencyBand(frequency).color;
        // 0.72 次幂抬高较弱信号的可见度，同时保留 maximumHeight 上限。
        const barHeight = Math.max(2, Math.pow(level, 0.72) * maximumHeight);
        // 根据起点、柱宽和间距计算当前柱的水平坐标。
        const x = startX + index * (barWidth + gap);

        // 每根柱独立保存状态，便于设置其频段颜色与发光强度。
        context.save();
        context.fillStyle = color;
        context.shadowColor = color;
        // 信号越强，发光半径越大。
        context.shadowBlur = 10 + level * 18;
        // 上半部分使用更高不透明度，形成主视图层级。
        context.globalAlpha = 0.92;
        // 从基线向上绘制主柱，并在基线处留 2px 缝隙。
        context.fillRect(x, baseline - barHeight - 2, barWidth, barHeight);
        // 下半部分稍微变淡，形成镜像而不是完全重复的两组柱。
        context.globalAlpha = 0.62;
        context.fillRect(x, baseline + 2, barWidth, barHeight);
        // 恢复全局透明度和阴影，避免影响下一根柱。
        context.restore();
    }
};

/**
 * 绘制黑胶唱片与围绕唱片向外跳动的环形频谱。
 *
 * @param context 当前 Canvas 的 2D 上下文。
 * @param width Canvas 的 CSS 像素宽度。
 * @param height Canvas 的 CSS 像素高度。
 * @param frame 本帧的频谱和能量数据。
 * @param timestamp 已按用户倍率累计的连续视觉时间，单位为毫秒。
 * @param responseGain 用户设置的音频响应倍率。
 */
const drawRadialSpectrum = (
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    frame: ReturnType<AudioFrameReader['read']>,
    timestamp: number,
    responseGain: number,
) => {
    // 以 Canvas 中心作为唱片和所有环形柱的共同原点。
    const centerX = width / 2;
    const centerY = height / 2;
    // 唱片半径取短边的 19%，横竖屏都能完整显示外圈频谱。
    const radius = Math.min(width, height) * 0.19;
    // 柱数量随宽度增加，并限制在 96-180 根之间控制绘制成本。
    const barCount = Math.max(96, Math.min(180, Math.floor(width / 5)));
    // 环形柱最大长度使用短边计算，防止触碰 Canvas 边缘。
    const maximumBar = Math.min(width, height) * 0.16;

    // 第一步：保存状态并把坐标原点移动到唱片中心。
    context.save();
    context.translate(centerX, centerY);
    // 低频能量先乘响应倍率，再限制到 0-1。
    const bassEnergy = Math.min(1, frame.energy.bass * responseGain);
    // 低频越强，唱片外发光越亮、半径越大。
    context.shadowColor = `rgba(83, 224, 175, ${0.18 + bassEnergy * 0.5})`;
    context.shadowBlur = 34 + bassEnergy * 38;
    // 绘制黑色唱片主体。
    context.fillStyle = '#080a0b';
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fill();

    // 第二步：按视觉时间旋转局部坐标，让黑胶细槽持续缓慢转动。
    context.rotate(timestamp * 0.00025);
    // 绘制 12 圈透明度交替的同心细槽，强化唱片材质。
    for (let groove = 0; groove < 12; groove += 1) {
        context.strokeStyle = groove % 2 ? 'rgba(119, 143, 134, 0.13)' : 'rgba(255, 255, 255, 0.05)';
        context.beginPath();
        context.arc(0, 0, radius * (0.35 + groove * 0.052), 0, Math.PI * 2);
        context.stroke();
    }
    // 第三步：绘制粉色唱片标签。
    context.fillStyle = '#ef476f';
    context.beginPath();
    context.arc(0, 0, radius * 0.29, 0, Math.PI * 2);
    context.fill();
    // 第四步：绘制黄色中心孔并恢复进入方法前的坐标系。
    context.fillStyle = '#ffd166';
    context.beginPath();
    context.arc(0, 0, radius * 0.06, 0, Math.PI * 2);
    context.fill();
    context.restore();

    // 第五步：沿 360 度逐根绘制向外延伸的频谱柱。
    for (let index = 0; index < barCount; index += 1) {
        // progress 表示当前柱在整圆中的比例位置。
        const progress = index / barCount;
        // 减去 PI/2 让第一根柱从圆的正上方开始。
        const angle = progress * Math.PI * 2 - Math.PI / 2;
        // 左右两半镜像使用相同的低频到高频顺序，保持圆形视觉重量平衡。
        const mirroredProgress = progress <= 0.5 ? progress * 2 : (1 - progress) * 2;
        // 对数采样当前频率，乘响应倍率后限制到 1。
        const level = Math.min(1, sampleLogFrequency(
            frame.frequencyData,
            mirroredProgress,
            frame.sampleRate,
            frame.frequencyData.length * 2,
        ) * responseGain);
        // 保留 5px 最小高度，即使静音也能看到完整外圈结构。
        const barHeight = 5 + Math.pow(level, 0.72) * maximumBar;
        // 柱子从唱片边缘外 10px 处开始，避免与唱片主体粘连。
        const inner = radius + 10;
        // 根据当前镜像进度计算真实频率并取得频段颜色。
        const frequency = 20 * Math.pow(1000, mirroredProgress);
        const color = getFrequencyBand(frequency).color;

        // 保存状态后移到圆心，再把局部坐标旋转到当前柱角度。
        context.save();
        context.translate(centerX, centerY);
        context.rotate(angle);
        // 设置频段颜色和随能量变化的发光半径。
        context.fillStyle = color;
        context.shadowColor = color;
        context.shadowBlur = 6 + level * 14;
        // 使用 2.4px 窄柱，从唱片外缘沿局部 Y 轴向外绘制。
        context.fillRect(-1.2, -inner - barHeight, 2.4, barHeight);
        // 恢复全局坐标，下一根柱重新按自己的角度定位。
        context.restore();
    }
};

/** 三条频段示波线跨帧保留的平滑振幅。 */
interface OscilloscopeState {
    /** 20-250 Hz 的平滑能量。 */
    low: number;
    /** 250 Hz-2 kHz 的平滑能量。 */
    mid: number;
    /** 2-20 kHz 的平滑能量。 */
    high: number;
}

/**
 * 绘制低、中、高三条相位连续的示波线。
 * 频域能量控制振幅，真实时域数据只提供少量细节，避免采样窗口每帧跳变导致移动过快。
 *
 * @param context 当前 Canvas 的 2D 上下文。
 * @param width Canvas 的 CSS 像素宽度。
 * @param height Canvas 的 CSS 像素高度。
 * @param frame 本帧的时域、频域和分段能量数据。
 * @param timestamp 已按动画速度累计的连续视觉时间，单位为毫秒。
 * @param state 跨帧保留的低、中、高频平滑能量。
 * @param responseGain 用户设置的音频响应倍率。
 */
const drawOscilloscope = (
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    frame: ReturnType<AudioFrameReader['read']>,
    timestamp: number,
    state: OscilloscopeState,
    responseGain: number,
) => {
    // 保存时域 PCM 快照，它只给合成正弦波增加少量真实音频纹理。
    const data = frame.timeData;
    // 次低频和低频按 35%/65% 混合成低频轨道，再应用响应倍率。
    const lowEnergy = Math.min(1, (frame.energy.sub * 0.35 + frame.energy.bass * 0.65) * responseGain);
    // 低中频和中频按 35%/65% 混合成中频轨道。
    const midEnergy = Math.min(1, (frame.energy.lowMid * 0.35 + frame.energy.mid * 0.65) * responseGain);
    // 高频和空气感按 70%/30% 混合成高频轨道。
    const highEnergy = Math.min(1, (frame.energy.high * 0.7 + frame.energy.air * 0.3) * responseGain);

    // 逐轨向目标能量靠近；较小缓动系数降低振幅闪烁，但不影响相位推进速度。
    state.low += (lowEnergy - state.low) * 0.09;
    state.mid += (midEnergy - state.mid) * 0.085;
    state.high += (highEnergy - state.high) * 0.075;

    // speed 是弧度/毫秒；2PI/speed 得到约 8.38s、6.61s、5.46s 的默认周期。
    const traces = [
        {label: '低频', range: '20-250 Hz', color: '#3b82f6', centerY: height * 0.29, cycles: 2.2, speed: 0.00075, level: state.low},
        {label: '中频', range: '250 Hz-2 kHz', color: '#2ccb7f', centerY: height * 0.5, cycles: 5.2, speed: 0.00095, level: state.mid},
        {label: '高频', range: '2-20 kHz', color: '#f04452', centerY: height * 0.71, cycles: 10.5, speed: 0.00115, level: state.high},
    ];
    // 左侧最多预留 96px 给轨道名称和频率范围，小屏按宽度的 20% 缩放。
    const startX = Math.min(96, width * 0.2);
    // 右侧保留 20px，防止发光线被 Canvas 裁切。
    const endX = width - 20;
    // 点数随宽度增长并保证至少 180 个，使曲线在手机上仍然平滑。
    const points = Math.max(180, Math.floor(width * 0.85));

    // 按低、中、高顺序分别绘制三条互不重叠的轨道。
    traces.forEach((trace, traceIndex) => {
        // 第一步：保存状态并绘制该轨道的虚线基线。
        context.save();
        context.strokeStyle = `${trace.color}38`;
        context.setLineDash([4, 7]);
        context.beginPath();
        context.moveTo(startX, trace.centerY);
        context.lineTo(endX, trace.centerY);
        context.stroke();
        // 第二步：关闭虚线并写入频段名称。
        context.setLineDash([]);
        context.fillStyle = trace.color;
        context.font = '600 11px sans-serif';
        context.fillText(trace.label, 20, trace.centerY - 3);
        // 第三步：用弱化颜色写入对应频率范围。
        context.fillStyle = 'rgba(210, 222, 217, 0.46)';
        context.font = '9px sans-serif';
        context.fillText(trace.range, 20, trace.centerY + 11);
        // 恢复调用前状态，防止文字字体影响后续路径。
        context.restore();

        // 静音时保留极小基础振幅，避免三条轨道退化为直线。
        const idleLevel = 0.025;
        // 当前平滑能量控制最大振幅，最低保证 3px 可见。
        const amplitude = Math.max(3, height * 0.065 * (idleLevel + trace.level * 1.9));
        // 连续视觉时间乘轨道角速度得到当前相位；调速改变推进量而不会重置相位。
        const phase = timestamp * trace.speed;

        // 第四步：同一路径绘制三遍，依次形成外发光、内发光和清晰主线。
        [
            {alpha: '35', lineWidth: 8},
            {alpha: '78', lineWidth: 3.5},
            {alpha: 'ff', lineWidth: 1.25},
        ].forEach(layer => {
            // 为当前发光层开启新路径并配置颜色、宽度及圆角。
            context.beginPath();
            context.strokeStyle = `${trace.color}${layer.alpha}`;
            context.lineWidth = layer.lineWidth;
            context.lineJoin = 'round';
            context.lineCap = 'round';

            // 第五步：从左到右计算合成三角波的所有采样点。
            for (let index = 0; index < points; index += 1) {
                // 把当前点的位置归一化到 0-1。
                const progress = index / Math.max(1, points - 1);
                // 将归一化位置映射到当前时域缓冲区索引。
                const dataIndex = Math.floor(progress * Math.max(0, data.length - 1));
                // 把 0-255 的时域样本换算为 -1 到 1。
                const realSignal = ((data[dataIndex] || 128) - 128) / 128;
                // 主正弦波决定轨道的基本形状和水平周期数。
                const primary = Math.sin(progress * Math.PI * 2 * trace.cycles - phase);
                // 较弱的次谐波打破完全规则的机械感，但保持整体连续。
                const harmonic = Math.sin(progress * Math.PI * 2 * trace.cycles * 0.48 + phase * 0.62 + traceIndex) * 0.24;
                // 两侧收窄、中间展开，减少曲线在画布边缘被裁切的感觉。
                const edgeEnvelope = Math.sin(progress * Math.PI) * 0.28 + 0.72;
                // 把归一化进度映射到实际横坐标。
                const x = startX + progress * (endX - startX);
                // 合并主波、次谐波和少量真实时域纹理，得到最终纵坐标。
                const y = trace.centerY + (primary + harmonic) * amplitude * edgeEnvelope
                    + realSignal * amplitude * trace.level * 0.16;
                // 第一个点移动画笔，后续点依次连线形成连续路径。
                if (index === 0) context.moveTo(x, y);
                else context.lineTo(x, y);
            }
            // 一次性描边当前发光层，随后进入下一层重复同一路径。
            context.stroke();
        });
    });
};

/**
 * 经典 Canvas 音乐可视化器。
 *
 * @param props.analyserRef 当前音轨的分析节点引用。
 * @param props.animationSpeed 动画时间推进倍率。
 * @param props.mode 当前绘图模式。
 * @param props.responseGain 音频能量映射倍率。
 * @returns 包含响应式 Canvas 的绘图区域。
 */
export const SpectrumCanvas = ({
    analyserRef,
    animationSpeed,
    mode,
    responseGain,
}: SpectrumCanvasProps) => {
    // 保存真实 Canvas DOM，effect 挂载后从这里取得 2D 上下文。
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // 镜像柱的跨帧高度不进入 React state，避免每秒触发约 60 次组件渲染。
    const smoothedLevelsRef = useRef<number[]>([]);
    // 三条示波轨道分别保存平滑能量，同样只在动画循环内部更新。
    const oscilloscopeStateRef = useRef<OscilloscopeState>({low: 0, mid: 0, high: 0});
    // 动画速度存入 ref，拖动滑块时当前 requestAnimationFrame 不会被销毁。
    const animationSpeedRef = useRef(animationSpeed);
    // 音频响应也存入 ref，使新倍率从下一帧开始即时生效。
    const responseGainRef = useRef(responseGain);
    // 每次 React 渲染把最新 props 同步到 ref；此赋值不会重置累计视觉时间。
    animationSpeedRef.current = animationSpeed;
    responseGainRef.current = responseGain;

    // analyserRef 或 mode 变化时重建绘制循环；速度和响应变化不在依赖中。
    useEffect(() => {
        // 第一步：读取 Canvas DOM 和 2D 上下文。
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        // 浏览器不支持 2D 上下文或元素尚未挂载时不启动动画。
        if (!canvas || !context) return;

        // 第二步：创建复用 TypedArray 的音频帧读取器，减少逐帧内存分配。
        const reader = new AudioFrameReader();
        // 下面两个变量保存 ResizeObserver 最近一次计算出的 CSS 尺寸。
        let width = 1;
        let height = 1;
        // 保存 requestAnimationFrame id，卸载或切换模式时用于取消循环。
        let animationFrameId = 0;
        // 保存浏览器上一帧时间戳，用于计算真实帧间隔。
        let previousTimestamp = 0;
        // 保存已乘速度倍率的连续时间，用户调速时只改变增量，不回到 0。
        let visualTimestamp = 0;

        /** 重新计算高 DPI 缓冲区，并同步动画循环使用的逻辑宽高。 */
        const handleResize = () => {
            ({width, height} = resizeCanvas(canvas, context));
        };
        // 第三步：监听 Canvas 布局尺寸，而不是只监听 window，兼容侧栏和响应式变化。
        const resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(canvas);
        // 观察器回调是异步的，因此挂载后先主动初始化一次尺寸。
        handleResize();

        /**
         * 清空画布并按当前模式绘制下一帧。
         *
         * @param timestamp requestAnimationFrame 提供的页面运行时间，单位为毫秒。
         */
        const draw = (timestamp: number) => {
            // 第四步：从最新 AnalyserNode 读取本帧数据；节点为空时 reader 返回静音帧。
            const frame = reader.read(analyserRef.current);
            // 计算真实帧间隔并限制为 50ms，避免后台恢复后一次跳过过多动画。
            const delta = previousTimestamp ? Math.min(50, timestamp - previousTimestamp) : 0;
            // 保存当前浏览器时间戳，供下一帧计算 delta。
            previousTimestamp = timestamp;
            // 只对“本帧增量”乘速度倍率，调速前后的 visualTimestamp 始终连续。
            visualTimestamp += delta * animationSpeedRef.current;
            // 第五步：清除上一帧所有像素。
            context.clearRect(0, 0, width, height);
            // 填充统一深色背景，避免透明 Canvas 显示页面底色造成闪烁。
            context.fillStyle = '#050809';
            context.fillRect(0, 0, width, height);

            // 第六步：按当前模式选择唯一绘制分支。
            if (mode === 'mirror-bars') {
                // 镜像柱先绘制网格，再使用跨帧柱高数组生成上下柱。
                drawGrid(context, width, height);
                drawMirrorBars(
                    context,
                    width,
                    height,
                    frame,
                    smoothedLevelsRef.current,
                    visualTimestamp,
                    responseGainRef.current,
                );
            } else if (mode === 'radial') {
                // 环形模式不需要直角网格，直接绘制唱片和环形柱。
                drawRadialSpectrum(
                    context,
                    width,
                    height,
                    frame,
                    visualTimestamp,
                    responseGainRef.current,
                );
            } else {
                // 示波器先绘制网格，再绘制三条独立频段轨道。
                drawGrid(context, width, height);
                drawOscilloscope(
                    context,
                    width,
                    height,
                    frame,
                    visualTimestamp,
                    oscilloscopeStateRef.current,
                    responseGainRef.current,
                );
            }

            // 第七步：当前帧结束后登记下一帧，形成持续动画循环。
            animationFrameId = requestAnimationFrame(draw);
        };

        // 启动第一帧；第一帧 delta 为 0，只负责初始化画面。
        animationFrameId = requestAnimationFrame(draw);
        // effect 清理函数在组件卸载、模式或分析节点引用变化时执行。
        return () => {
            // 先停止动画，防止清理后继续访问 Canvas 上下文。
            cancelAnimationFrame(animationFrameId);
            // 再断开尺寸观察器，释放 Canvas 元素引用。
            resizeObserver.disconnect();
        };
    }, [analyserRef, mode]);

    return (
        // 包裹层提供稳定宽高，避免 Canvas 内部缓冲区变化带动页面布局。
        <div className={style.canvasWrap}>
            <canvas ref={canvasRef} aria-label="经典音乐频谱可视化" />
        </div>
    );
};
