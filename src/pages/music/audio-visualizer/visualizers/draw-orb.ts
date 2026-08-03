import {getFrequencyBand, getLogFrequency} from '../frequency-bands';
import {drawGrid, getBandEnergy, getInterpolatedAmplitude} from './canvas-utils';
import {AudioFrame, CanvasScene, OrbState} from './types';

/** 水滴绘制所需的球体位置和当前低频能量。 */
interface DropletFrame {
    /** 当前低频归一化能量。 */
    bassEnergy: number;
    /** 球心水平坐标。 */
    centerX: number;
    /** 球心垂直坐标。 */
    centerY: number;
    /** 当前音频是否播放。 */
    isPlaying: boolean;
    /** 水滴发射位置使用的动态球半径。 */
    radius: number;
    /** 当前动画时间戳。 */
    timestamp: number;
}

/** 根据低频节拍生成、更新并绘制从球体向外飞散的水滴。 */
const drawDroplets = (
    {context}: CanvasScene,
    frame: DropletFrame,
    state: OrbState,
) => {
    const {bassEnergy, centerX, centerY, isPlaying, radius, timestamp} = frame;
    // 仅在播放中、低频达到阈值且距离上次生成超过 110ms 时创建水滴。
    if (isPlaying && bassEnergy > 0.2 && timestamp - state.lastDropTime > 110) {
        // 强低频拍点一次生成三滴，普通拍点生成一滴。
        const dropCount = bassEnergy > 0.54 ? 3 : 1;
        // 为本次拍点创建指定数量的粒子。
        for (let index = 0; index < dropCount; index += 1) {
            state.droplets.push({
                // 在整个球形边界上随机选择发射方向。
                angle: Math.random() * Math.PI * 2,
                // 从球面外侧少量偏移的位置开始。
                distance: radius * (1.02 + Math.random() * 0.12),
                // 新粒子从完整生命周期开始。
                life: 1,
                // 随机尺寸让水滴不呈现机械重复。
                size: 1.5 + Math.random() * 3.5,
                // 基础速度叠加低频能量，强拍时向外飞得更快。
                speed: 0.7 + Math.random() * 1.7 + bassEnergy * 2,
            });
        }
        // 记录本次生成时间，用于限制粒子密度。
        state.lastDropTime = timestamp;
    }

    // 隔离粒子绘制使用的透明度与颜色。
    context.save();
    // 倒序遍历便于安全删除生命结束的粒子。
    for (let index = state.droplets.length - 1; index >= 0; index -= 1) {
        // 取得当前需要更新的水滴。
        const droplet = state.droplets[index];
        // 每帧按速度增加它与球心的距离。
        droplet.distance += droplet.speed;
        // 每帧消耗固定生命值，产生渐隐效果。
        droplet.life -= 0.012;
        // 生命值耗尽时从活动数组移除并跳过绘制。
        if (droplet.life <= 0) {
            state.droplets.splice(index, 1);
            continue;
        }

        // 将极坐标的角度与距离转换为 Canvas 坐标。
        const x = centerX + Math.cos(droplet.angle) * droplet.distance;
        const y = centerY + Math.sin(droplet.angle) * droplet.distance;
        // 透明度跟随剩余生命值递减。
        context.fillStyle = `rgba(102, 222, 190, ${droplet.life * 0.72})`;
        context.beginPath();
        // 粒子半径也随生命值缩小。
        context.arc(x, y, droplet.size * droplet.life, 0, Math.PI * 2);
        context.fill();
    }
    // 恢复粒子绘制前的 Canvas 状态。
    context.restore();
};

/** 绘制受低频驱动的球体、内部水纹、频谱轮廓和外部水滴。 */
export const drawOrb = (
    scene: CanvasScene,
    frame: AudioFrame,
    state: OrbState,
) => {
    const {context, height, width} = scene;
    const {isPlaying, sampleRate, sensitivity, timeData, timestamp} = frame;
    // 球心始终位于 Canvas 中心。
    const centerX = width / 2;
    const centerY = height / 2;
    // 半径跟随画布短边变化，同时保证最小可见尺寸。
    const baseRadius = Math.max(58, Math.min(width, height) * 0.205);
    // 不同频率范围分别驱动球体脉冲、水纹透明度和水纹振幅。
    const bassEnergy = getBandEnergy(frame, {minimum: 20, maximum: 250}) * sensitivity;
    const midEnergy = getBandEnergy(frame, {minimum: 250, maximum: 4000}) * sensitivity;
    const highEnergy = getBandEnergy(frame, {minimum: 4000, maximum: 20000}) * sensitivity;
    // 将低频能量限制为最多 16% 的球体半径脉冲。
    const pulseRadius = baseRadius * (1 + Math.min(0.16, bassEnergy * 0.13));

    // 球体与粒子之前先绘制固定网格。
    drawGrid(scene);

    // 绘制球体外围的四层循环扩散波纹。
    context.save();
    for (let index = 0; index < 4; index += 1) {
        // 用时间戳与分层偏移产生 0-1 的循环进度。
        const cycle = ((timestamp * (0.022 + index * 0.003) + index * 31) % 120) / 120;
        // 波纹从球体外侧开始向外扩散。
        const rippleRadius = pulseRadius + 12 + cycle * baseRadius * 0.9;
        // 扩散越远越透明，低频越强初始亮度越高。
        context.globalAlpha = (1 - cycle) * (0.08 + bassEnergy * 0.18);
        context.strokeStyle = index % 2 ? '#f0c75e' : '#55d8ab';
        context.lineWidth = 1.2;
        context.beginPath();
        context.arc(centerX, centerY, rippleRadius, 0, Math.PI * 2);
        context.stroke();
    }
    context.restore();

    // 创建偏左上的径向渐变，产生水滴球体的体积感。
    const sphereGradient = context.createRadialGradient(
        centerX - pulseRadius * 0.34,
        centerY - pulseRadius * 0.42,
        pulseRadius * 0.08,
        centerX,
        centerY,
        pulseRadius,
    );
    sphereGradient.addColorStop(0, 'rgba(120, 236, 204, 0.72)');
    sphereGradient.addColorStop(0.46, 'rgba(38, 129, 112, 0.42)');
    sphereGradient.addColorStop(1, 'rgba(8, 29, 27, 0.82)');
    context.fillStyle = sphereGradient;
    context.beginPath();
    context.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
    context.fill();

    // 将后续内部水纹裁切在球形范围内。
    context.save();
    context.beginPath();
    context.arc(centerX, centerY, pulseRadius - 1, 0, Math.PI * 2);
    context.clip();
    // 绘制六条从上到下循环流动的椭圆水纹。
    for (let index = 0; index < 6; index += 1) {
        // 计算当前水纹在球体内的垂直偏移。
        const offset = ((timestamp * 0.018 + index * 34) % (pulseRadius * 2)) - pulseRadius;
        // 根据圆形截面方程计算该高度可用的水平半宽。
        const waveWidth = Math.sqrt(Math.max(0, pulseRadius * pulseRadius - offset * offset));
        context.globalAlpha = 0.08 + midEnergy * 0.12;
        context.strokeStyle = index % 2 ? '#f6d77e' : '#8ce9d0';
        context.lineWidth = 1;
        context.beginPath();
        // 高频越强，椭圆的竖向半径越大。
        context.ellipse(centerX, centerY + offset, waveWidth, 5 + highEnergy * 12, 0, 0, Math.PI * 2);
        context.stroke();
    }
    context.restore();

    // 用 196 个点构建平滑球形频谱轮廓。
    const pointCount = 196;
    const outlinePoints: Array<{color: string; x: number; y: number}> = [];
    context.save();
    context.fillStyle = 'rgba(87, 215, 174, 0.11)';
    context.lineWidth = 2;
    // 遍历整个圆周，生成每个受频率幅度控制的点。
    for (let index = 0; index <= pointCount; index += 1) {
        const progress = index / pointCount;
        // 将起点放在球体正上方，随后顺时针绕行。
        const angle = progress * Math.PI * 2 - Math.PI / 2;
        const frequency = getLogFrequency(progress, sampleRate);
        const frequencyValue = getInterpolatedAmplitude(frame, frequency);
        // 在时域数组中按圆周进度取样。
        const timeIndex = Math.min(timeData.length - 1, Math.floor(progress * timeData.length));
        // 将 0-255 时域样本以 128 为中心转换为 -1-1。
        const waveValue = timeData.length ? (timeData[timeIndex] - 128) / 128 : 0;
        // 频域决定主外扩，时域增加小尺度波形细节。
        const radialOffset = frequencyValue * baseRadius * 0.42 * sensitivity + waveValue * 8;
        const radius = pulseRadius + radialOffset;
        outlinePoints.push({
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius,
            color: getFrequencyBand(frequency).color,
        });
    }

    // 将全部坐标连成闭合路径，用于一次性填充轮廓内部。
    context.beginPath();
    outlinePoints.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
    });
    context.closePath();
    context.fill();

    // 逐段绘制轮廓，使线段使用当前 Hz 所属频段颜色。
    for (let index = 1; index < outlinePoints.length; index += 1) {
        const previousPoint = outlinePoints[index - 1];
        const point = outlinePoints[index];
        context.strokeStyle = point.color;
        context.beginPath();
        context.moveTo(previousPoint.x, previousPoint.y);
        context.lineTo(point.x, point.y);
        context.stroke();
    }
    context.restore();

    // 最后更新并绘制低频水滴粒子。
    drawDroplets(scene, {
        bassEnergy,
        centerX,
        centerY,
        isPlaying,
        radius: pulseRadius,
        timestamp,
    }, state);
};
