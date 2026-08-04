import {seededRandom} from '../creative-shared/music-math';
import {AudioAnalysisFrame, sampleLogFrequency} from '../shared/audio-frame';

/** 时间环每次保存的对数频率采样数量。 */
export const RING_SAMPLE_COUNT = 72;

/** 星座节点分别响应低频、中频和高频。 */
export type ConstellationBand = 'low' | 'mid' | 'high';

/** 节拍星座中一个可移动节点的数据。 */
export interface ConstellationNode {
    /** 画布内 0-1 的横向位置，缩放画布时仍保持相对位置。 */
    x: number;
    /** 画布内 0-1 的纵向位置。 */
    y: number;
    /** 每秒横向移动的归一化距离。 */
    velocityX: number;
    /** 每秒纵向移动的归一化距离。 */
    velocityY: number;
    /** 0-1 剩余生命值，用于控制节点淡出。 */
    life: number;
    /** 节点基础半径，单位为 CSS 像素。 */
    radius: number;
    /** 节点响应的频段，决定颜色和脉冲幅度。 */
    band: ConstellationBand;
}

/** 节拍星座三组频率使用的高对比颜色。 */
const BAND_COLORS: Record<ConstellationBand, string> = {
    low: '#ffd166',
    mid: '#42e2c0',
    high: '#ef5d8c',
};

/** 时间环按新旧顺序循环使用的颜色。 */
const RING_COLORS = ['#69f0c1', '#4f8cff', '#ef5d8c', '#ffd166'] as const;

/** 将任意数字约束到 0-1。 */
const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

/**
 * 保存一帧适合时间环使用的对数频谱。
 *
 * @param audio 当前音频分析帧。
 * @returns 过滤轻微底噪后的 72 个字节强度。
 */
export const createRingSnapshot = (audio: AudioAnalysisFrame) => {
    const snapshot = new Uint8Array(RING_SAMPLE_COUNT);
    for (let index = 0; index < RING_SAMPLE_COUNT; index += 1) {
        // 第一步：从 20Hz 到 20kHz 按对数位置读取，让低频拥有足够角度空间。
        const rawLevel = sampleLogFrequency(
            audio.frequencyData,
            index / (RING_SAMPLE_COUNT - 1),
            audio.sampleRate,
            audio.frequencyData.length * 2,
        );
        // 第二步：去掉静音底色并提升有效峰值，防止环线全部挤成同样半径。
        const normalizedLevel = Math.pow(clampUnit((rawLevel - 0.055) / 0.945), 1.22);
        snapshot[index] = Math.round(normalizedLevel * 255);
    }
    return snapshot;
};

/**
 * 把历史频谱绘制成从中心向外扩散的时间环雕塑。
 *
 * @param context Canvas 2D 绘图上下文。
 * @param width 画布 CSS 宽度。
 * @param height 画布 CSS 高度。
 * @param history 最新频谱位于首位的历史数组。
 * @param audio 当前音频分析帧。
 * @param intensity 用户设置的视觉强度。
 */
export const drawTimeRings = (
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    history: Uint8Array[],
    audio: AudioAnalysisFrame,
    intensity: number,
) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const shortestSide = Math.min(width, height);
    const innerRadius = Math.max(28, shortestSide * 0.09);
    const outerRadius = Math.max(innerRadius + 12, shortestSide * 0.46);
    // 环间距保持在 6px 以上，频谱位移再强也能看出独立的时间层。
    const ringGap = Math.max(6, shortestSide / 92);
    const visibleRingCount = Math.min(history.length, Math.floor((outerRadius - innerRadius) / ringGap));

    context.save();
    context.translate(centerX, centerY);

    // 先画少量基准圆，历史环之间仍能看出稳定空间关系。
    context.lineWidth = 1;
    for (let guide = 1; guide <= 4; guide += 1) {
        context.strokeStyle = `rgba(127, 156, 178, ${0.08 + guide * 0.015})`;
        context.beginPath();
        context.arc(0, 0, innerRadius + (outerRadius - innerRadius) * guide / 4, 0, Math.PI * 2);
        context.stroke();
    }

    // 从最旧的外环向最新的内环绘制，新的高亮线不会被旧数据覆盖。
    for (let historyIndex = visibleRingCount - 1; historyIndex >= 0; historyIndex -= 1) {
        const snapshot = history[historyIndex];
        const ageProgress = historyIndex / Math.max(1, visibleRingCount - 1);
        const baseRadius = innerRadius + historyIndex * ringGap;
        context.beginPath();

        for (let point = 0; point <= snapshot.length; point += 1) {
            const currentIndex = point % snapshot.length;
            const nextIndex = (currentIndex + 1) % snapshot.length;
            // 相邻两个采样取平均，让闭合曲线连续，但不改变历史环之间的清晰间隔。
            const level = (snapshot[currentIndex] + snapshot[nextIndex]) / 510;
            const angle = point / snapshot.length * Math.PI * 2 - Math.PI / 2;
            const displacement = level * (3 + intensity * 8) + audio.energy.bass * intensity * 2;
            const radius = baseRadius + displacement;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            if (point === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
        }

        context.globalAlpha = 0.14 + (1 - ageProgress) * 0.72;
        // 颜色按时间区域缓慢过渡，不会在每次新增快照时让全部环线快速变色。
        const colorIndex = Math.min(
            RING_COLORS.length - 1,
            Math.floor(ageProgress * RING_COLORS.length),
        );
        context.strokeStyle = RING_COLORS[colorIndex];
        context.lineWidth = historyIndex === 0 ? 1.8 : 0.85;
        context.stroke();
    }

    // 中心脉冲只响应低频，作为当前播放状态和历史环的视觉锚点。
    context.globalAlpha = 1;
    context.fillStyle = audio.energy.bass > 0.03 ? '#ffd166' : '#36534a';
    context.beginPath();
    context.arc(0, 0, 4 + audio.energy.bass * intensity * 24, 0, Math.PI * 2);
    context.fill();
    context.restore();
};

/**
 * 向星座追加一批由节拍或用户点击产生的节点。
 *
 * @param nodes 需要原地更新的节点数组。
 * @param audio 当前音频分析帧。
 * @param count 本次新增节点数量。
 * @param seed 用于生成稳定位置和速度的整数种子。
 * @param intensity 用户设置的视觉强度。
 * @param origin 可选的点击位置；未提供时从画布中心爆发。
 */
export const spawnConstellationNodes = (
    nodes: ConstellationNode[],
    audio: AudioAnalysisFrame,
    count: number,
    seed: number,
    intensity: number,
    origin = {x: 0.5, y: 0.5},
) => {
    const bands: ConstellationBand[] = ['low', 'mid', 'high'];
    for (let index = 0; index < count; index += 1) {
        const angle = seededRandom(seed + index * 17) * Math.PI * 2;
        const speed = 0.025 + seededRandom(seed + index * 29) * 0.075 * intensity;
        const band = bands[index % bands.length];
        const bandEnergy = band === 'low' ? audio.energy.bass : band === 'mid' ? audio.energy.mid : audio.energy.high;
        nodes.push({
            x: clampUnit(origin.x + Math.cos(angle) * seededRandom(seed + index * 37) * 0.035),
            y: clampUnit(origin.y + Math.sin(angle) * seededRandom(seed + index * 43) * 0.035),
            velocityX: Math.cos(angle) * speed,
            velocityY: Math.sin(angle) * speed,
            life: 1,
            radius: 2 + seededRandom(seed + index * 59) * 3 + bandEnergy * 5,
            band,
        });
    }
    // 星座节点设置上限，长时间播放和连续点击都不会无限增加计算量。
    if (nodes.length > 78) nodes.splice(0, nodes.length - 78);
};

/**
 * 更新星座节点位置、连接邻近节点并绘制频段脉冲。
 */
export const drawBeatConstellation = (
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    nodes: ConstellationNode[],
    audio: AudioAnalysisFrame,
    delta: number,
    intensity: number,
) => {
    // 第一步：推进节点；越过边界后从另一侧进入，保持星座连续存在。
    nodes.forEach(node => {
        const bandEnergy = node.band === 'low' ? audio.energy.bass : node.band === 'mid' ? audio.energy.mid : audio.energy.high;
        node.x = (node.x + node.velocityX * delta * (1 + bandEnergy * intensity * 2) + 1) % 1;
        node.y = (node.y + node.velocityY * delta * (1 + bandEnergy * intensity * 2) + 1) % 1;
        node.life -= delta * 0.07;
    });
    // 删除已经完全淡出的节点，后续连线循环无需处理无效项。
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
        if (nodes[index].life <= 0) nodes.splice(index, 1);
    }

    // 第二步：绘制三组频率轨道，帮助观察节点属于哪个能量层。
    const centerX = width / 2;
    const centerY = height / 2;
    [audio.energy.bass, audio.energy.mid, audio.energy.high].forEach((energy, index) => {
        context.strokeStyle = `rgba(100, 139, 154, ${0.08 + energy * 0.16})`;
        context.lineWidth = 1;
        context.beginPath();
        context.arc(centerX, centerY, Math.min(width, height) * (0.14 + index * 0.115), 0, Math.PI * 2);
        context.stroke();
    });

    // 第三步：只连接实际像素距离足够近的节点，形成会持续拆分和重组的星座。
    const connectionDistance = Math.min(132, width * 0.15);
    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
        const leftNode = nodes[leftIndex];
        for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
            const rightNode = nodes[rightIndex];
            const distanceX = (leftNode.x - rightNode.x) * width;
            const distanceY = (leftNode.y - rightNode.y) * height;
            const distance = Math.hypot(distanceX, distanceY);
            if (distance >= connectionDistance) continue;
            const alpha = (1 - distance / connectionDistance) * Math.min(leftNode.life, rightNode.life) * 0.34;
            context.strokeStyle = `rgba(122, 187, 199, ${alpha})`;
            context.beginPath();
            context.moveTo(leftNode.x * width, leftNode.y * height);
            context.lineTo(rightNode.x * width, rightNode.y * height);
            context.stroke();
        }
    }

    // 第四步：节点颜色明确区分低、中、高频，半径随各自频段能量脉冲。
    nodes.forEach(node => {
        const bandEnergy = node.band === 'low' ? audio.energy.bass : node.band === 'mid' ? audio.energy.mid : audio.energy.high;
        context.globalAlpha = Math.min(1, node.life * 1.4);
        context.fillStyle = BAND_COLORS[node.band];
        context.beginPath();
        context.arc(
            node.x * width,
            node.y * height,
            node.radius + bandEnergy * intensity * 9,
            0,
            Math.PI * 2,
        );
        context.fill();
    });
    context.globalAlpha = 1;
};

/**
 * 把时域数据拆成多条 RGB 错位磁带，低频控制切片偏移，高频控制细节抖动。
 */
export const drawGlitchTape = (
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    audio: AudioAnalysisFrame,
    timestamp: number,
    intensity: number,
) => {
    const stripCount = Math.max(14, Math.min(26, Math.floor(height / 24)));
    const stripHeight = height / stripCount;
    const pointCount = Math.min(180, Math.max(90, Math.floor(width / 6)));

    for (let stripIndex = 0; stripIndex < stripCount; stripIndex += 1) {
        const stripTop = stripIndex * stripHeight;
        const centerY = stripTop + stripHeight / 2;
        const alternatingDirection = stripIndex % 2 ? 1 : -1;
        const bassShift = audio.energy.bass * intensity * 34 * alternatingDirection;
        const temporalShift = Math.sin(timestamp * 0.0012 + stripIndex * 1.7) * intensity * 5;
        const amplitude = stripHeight * (0.18 + audio.energy.mid * intensity * 0.52);

        context.save();
        context.beginPath();
        context.rect(0, stripTop + 1, width, Math.max(1, stripHeight - 2));
        context.clip();
        context.globalCompositeOperation = 'screen';

        // RGB 三次描边共享同一时域波形，仅改变横向偏移，形成清楚的色差切片。
        const channels = [
            {color: 'rgba(255, 68, 107, 0.72)', offset: -3.5 * intensity},
            {color: 'rgba(55, 218, 255, 0.74)', offset: 3.5 * intensity},
            {color: 'rgba(235, 244, 240, 0.76)', offset: 0},
        ];
        channels.forEach(channel => {
            context.strokeStyle = channel.color;
            context.lineWidth = channel.offset === 0 ? 1 : 1.35;
            context.beginPath();
            for (let point = 0; point <= pointCount; point += 1) {
                const progress = point / pointCount;
                const dataIndex = Math.min(
                    audio.timeData.length - 1,
                    Math.floor(progress * Math.max(0, audio.timeData.length - 1)),
                );
                const sample = ((audio.timeData[dataIndex] || 128) - 128) / 128;
                const highFrequencyJitter = Math.sin(point * 0.63 + stripIndex + timestamp * 0.004)
                    * audio.energy.high * intensity * 2.4;
                const x = progress * width + bassShift + temporalShift + channel.offset;
                const y = centerY + sample * amplitude + highFrequencyJitter;
                if (point === 0) context.moveTo(x, y);
                else context.lineTo(x, y);
            }
            context.stroke();
        });
        context.restore();

        // 深色分割线保留每条“磁带”的边界，强烈抖动时仍不会糊在一起。
        context.fillStyle = 'rgba(2, 5, 7, 0.72)';
        context.fillRect(0, stripTop, width, 1);
    }

    // 移动的磁头线为连续动画提供方向感，高频越强越明亮。
    const playheadX = timestamp * (0.025 + intensity * 0.035) % Math.max(1, width);
    context.fillStyle = `rgba(255, 209, 102, ${0.2 + audio.energy.high * 0.65})`;
    context.fillRect(playheadX, 0, 2, height);
};
