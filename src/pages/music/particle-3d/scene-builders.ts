import * as THREE from 'three';
import {AudioAnalysisFrame} from '../shared/audio-frame';

/**
 * `particles`：低/中/高频分别驱动粒子半径、颜色和旋转。
 * `terrain`：频谱数据驱动网格地形起伏。
 * `orb`：各频率桶沿法线方向改变球体表面。
 * `tunnel`：整体能量推动星空隧道向镜头运动。
 */
export type ThreeSceneMode = 'particles' | 'terrain' | 'orb' | 'tunnel';

/** 单个 3D 模式向渲染层暴露的统一对象和逐帧更新方法。 */
export interface AudioSceneBundle {
    /** 当前模式的根容器，渲染层只需把它加入主 Scene。 */
    group: THREE.Group;
    /** 每帧根据音频、连续时间、帧间隔和响应倍率更新当前模式。 */
    update: (
        /** 已按响应倍率缩放过分段能量的当前音频帧。 */
        frame: AudioAnalysisFrame,
        /** 已按动画速度累计的连续视觉时间，单位为秒。 */
        elapsed: number,
        /** 已按动画速度缩放的本帧间隔，单位为秒。 */
        delta: number,
        /** 原始频谱桶需要额外使用的用户响应倍率。 */
        responseGain: number,
    ) => void;
}

/**
 * 让粒子颜色在青、粉、黄之间形成明确的频段分组。
 *
 * @param colors BufferGeometry 使用的连续 RGB 数组。
 * @param index 当前粒子的序号。
 * @param group 当前粒子所属的频段组：0 低频、1 中频、2 高频。
 */
const setParticleColor = (colors: Float32Array, index: number, group: number) => {
    // 创建和页面配色一致的低/中/高频颜色表。
    const palette = [new THREE.Color('#35d6ff'), new THREE.Color('#ef476f'), new THREE.Color('#ffd166')];
    // 根据频段组取出当前粒子颜色。
    const color = palette[group];
    // BufferAttribute 每个粒子连续占用三个位置，依次写入 R、G、B。
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
};

/**
 * 创建由低、中、高频分别驱动的音频响应粒子云。
 *
 * @returns 包含粒子 Group 和逐帧更新方法的场景包。
 */
const createParticles = (): AudioSceneBundle => {
    // 根 Group 让渲染层可以整体应用指针视差和资源清理。
    const group = new THREE.Group();
    // 固定 2200 个粒子，在视觉密度和移动端 GPU 开销之间取平衡。
    const count = 2200;
    // positions 和 colors 每个粒子各占三个 float，直接上传 GPU Buffer。
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    // 半径、角度、高度单独保存，逐帧更新时始终从稳定基准重新计算坐标。
    const radii = new Float32Array(count);
    const angles = new Float32Array(count);
    const heights = new Float32Array(count);

    // 第一步：生成所有粒子的初始圆柱坐标和频段颜色。
    for (let index = 0; index < count; index += 1) {
        // 平方根分布抵消圆面积增长，使中心和外围之间的视觉密度更均匀。
        radii[index] = 0.7 + Math.sqrt(Math.random()) * 5.7;
        // 在 0-2PI 范围内生成粒子绕 Y 轴的初始角度。
        angles[index] = Math.random() * Math.PI * 2;
        // 高度在 -2.1 到 2.1 之间随机分布，形成具有厚度的粒子云。
        heights[index] = (Math.random() - 0.5) * 4.2;
        // 将圆柱坐标转换为 X 坐标。
        positions[index * 3] = Math.cos(angles[index]) * radii[index];
        // Y 坐标直接使用随机高度。
        positions[index * 3 + 1] = heights[index];
        // 将圆柱坐标转换为 Z 坐标。
        positions[index * 3 + 2] = Math.sin(angles[index]) * radii[index];
        // 按序号循环分配低、中、高三种颜色。
        setParticleColor(colors, index, index % 3);
    }

    // 第二步：创建 BufferGeometry，并绑定位置和顶点颜色属性。
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // 第三步：创建支持顶点色和加法混合的透明点材质，产生发光叠加效果。
    const material = new THREE.PointsMaterial({
        // 初始点尺寸；逐帧会由高频能量继续调整。
        size: 0.055,
        // 使用 color BufferAttribute，而不是单一材质颜色。
        vertexColors: true,
        // 开启透明度才能配合 opacity 和加法混合。
        transparent: true,
        opacity: 0.88,
        // 粒子不写深度，避免大量半透明点互相遮挡成硬块。
        depthWrite: false,
        // 亮色相叠形成自然光晕。
        blending: THREE.AdditiveBlending,
    });
    // 第四步：把几何体和材质组合成 Points 并加入根 Group。
    const points = new THREE.Points(geometry, material);
    group.add(points);

    // 返回静态 Group，以及渲染层每帧调用的更新闭包。
    return {
        group,
        update: (frame, elapsed) => {
            // 取得可写的位置 BufferAttribute，所有变化完成后统一标记上传 GPU。
            const position = geometry.getAttribute('position') as THREE.BufferAttribute;
            // 第五步：遍历粒子，根据所属频段计算本帧坐标。
            for (let index = 0; index < count; index += 1) {
                // 粒子序号循环映射到低、中、高三个频段。
                const frequencyGroup = index % 3;
                // 三组粒子分别读取 bass、mid、high 能量。
                const energy = frequencyGroup === 0
                    ? frame.energy.bass
                    : frequencyGroup === 1 ? frame.energy.mid : frame.energy.high;
                // 在初始角度上叠加连续旋转，高频组的角速度略快。
                const angle = angles[index] + elapsed * (0.08 + frequencyGroup * 0.025);
                // 频段能量向外扩张基础半径，不同频段使用略有差异的响应系数。
                const pulseRadius = radii[index] * (1 + energy * (0.22 + frequencyGroup * 0.05));
                // 把更新后的圆柱坐标一次写回 X、Y、Z。
                position.setXYZ(
                    index,
                    // X/Z 围绕 Y 轴旋转，同时使用音频扩张后的半径。
                    Math.cos(angle) * pulseRadius,
                    // Y 在初始高度上叠加正弦漂浮，能量越强漂浮范围越大。
                    heights[index] + Math.sin(elapsed * 1.6 + radii[index]) * (0.1 + energy * 0.75),
                    Math.sin(angle) * pulseRadius,
                );
            }
            // 通知 Three.js 下一次渲染前把修改后的位置重新上传 GPU。
            position.needsUpdate = true;
            // 高频能量控制粒子尺寸，让高频细节表现为短促闪烁。
            material.size = 0.045 + frame.energy.high * 0.085;
            // 整个粒子云绕 Y 轴缓慢旋转。
            group.rotation.y = elapsed * 0.05;
            // Z 轴只做小幅往返摆动，避免画面完全机械对称。
            group.rotation.z = Math.sin(elapsed * 0.18) * 0.08;
        },
    };
};

/**
 * 创建由频谱桶驱动的起伏线框地形。
 *
 * @returns 包含地形 Group 和顶点更新方法的场景包。
 */
const createTerrain = (): AudioSceneBundle => {
    // 根 Group 统一承载地形网格。
    const group = new THREE.Group();
    // 72x52 分段提供足够的起伏细节，同时控制逐帧顶点数量。
    const geometry = new THREE.PlaneGeometry(18, 13, 72, 52);
    // 复制初始位置；每帧从固定 X/Y 基准计算 Z，避免误差持续累积。
    const original = Float32Array.from((geometry.getAttribute('position') as THREE.BufferAttribute).array as ArrayLike<number>);
    // 线框标准材质同时接受场景灯光和自身 emissive 发光。
    const material = new THREE.MeshStandardMaterial({
        color: '#123b38',
        emissive: '#0f8f82',
        emissiveIntensity: 0.5,
        metalness: 0.48,
        roughness: 0.38,
        side: THREE.DoubleSide,
        wireframe: true,
    });
    // 把平面几何体和材质组合成可渲染 Mesh。
    const terrain = new THREE.Mesh(geometry, material);
    // 向后倾斜平面，建立从近处向远处延伸的地形透视。
    terrain.rotation.x = -Math.PI * 0.58;
    // 下移并后移地形，使起伏中心落在镜头主要视区。
    terrain.position.y = -1.35;
    terrain.position.z = -1.8;
    // 将 Mesh 加入模式根节点。
    group.add(terrain);

    return {
        group,
        update: (frame, elapsed, _delta, responseGain) => {
            // 取得当前位置属性，逐顶点只修改 Z 轴高度。
            const position = geometry.getAttribute('position') as THREE.BufferAttribute;
            // 遍历平面网格中的全部顶点。
            for (let index = 0; index < position.count; index += 1) {
                // 从不可变副本读取当前顶点的基础 X/Y 坐标。
                const x = original[index * 3];
                const y = original[index * 3 + 1];
                // 按顶点距中心的水平距离映射到一个频谱桶索引。
                const dataIndex = Math.min(
                    frame.frequencyData.length - 1,
                    Math.floor(Math.abs(x / 9) * Math.min(800, frame.frequencyData.length - 1)),
                );
                // 把 0-255 频谱值归一化并应用响应倍率，最终限制在 0-1。
                const frequencyLevel = Math.min(
                    1,
                    (frame.frequencyData[dataIndex] || 0) / 255 * responseGain,
                );
                // X/Y 两个方向的正弦波随连续时间传播，形成基础地形起伏。
                const travellingWave = Math.sin(x * 1.25 + elapsed * 2.1) * Math.cos(y * 0.92 - elapsed * 1.35);
                // 中频扩大行波，频谱桶和低频共同增加局部高度。
                const z = travellingWave * (0.12 + frame.energy.mid * 0.35)
                    + frequencyLevel * (0.35 + frame.energy.bass * 1.7);
                // 仅写回 Z，X/Y 始终保持规则网格结构。
                position.setZ(index, z);
            }
            // 上传修改后的顶点位置并重新计算光照需要的法线。
            position.needsUpdate = true;
            geometry.computeVertexNormals();
            // 高频能量提高自发光强度，让细碎高频表现为线框闪烁。
            material.emissiveIntensity = 0.28 + frame.energy.high * 1.5;
        },
    };
};

/**
 * 创建沿顶点法线呼吸、变形的音频球体。
 *
 * @returns 包含实体球、线框球和逐顶点更新方法的场景包。
 */
const createOrb = (): AudioSceneBundle => {
    // 根 Group 同时容纳实体球和外层线框。
    const group = new THREE.Group();
    // 高细分二十面体提供足够顶点来表现频谱形变。
    const geometry = new THREE.IcosahedronGeometry(2.15, 5);
    // 保存所有顶点的原始坐标，逐帧以原始半径为基准重新计算。
    const original = Float32Array.from((geometry.getAttribute('position') as THREE.BufferAttribute).array as ArrayLike<number>);
    // 物理材质提供清漆、金属和轻微透射质感。
    const material = new THREE.MeshPhysicalMaterial({
        color: '#2bd9a8',
        emissive: '#126b61',
        emissiveIntensity: 0.55,
        metalness: 0.18,
        roughness: 0.24,
        transmission: 0.08,
        clearcoat: 0.85,
        clearcoatRoughness: 0.18,
        flatShading: true,
    });
    // 创建实体球并加入根 Group。
    const sphere = new THREE.Mesh(geometry, material);
    group.add(sphere);

    // 使用较低细分、稍大半径创建外层结构线框。
    const wireGeometry = new THREE.IcosahedronGeometry(2.18, 2);
    const wireMaterial = new THREE.MeshBasicMaterial({
        color: '#f3c969',
        wireframe: true,
        transparent: true,
        opacity: 0.18,
    });
    // 线框不参与逐顶点变形，只通过旋转和整体缩放响应音频。
    const wire = new THREE.Mesh(wireGeometry, wireMaterial);
    group.add(wire);

    // 复用一个 Vector3 计算顶点方向，避免循环内持续创建临时对象。
    const direction = new THREE.Vector3();
    return {
        group,
        update: (frame, elapsed, _delta, responseGain) => {
            // 读取实体球可写的位置属性。
            const position = geometry.getAttribute('position') as THREE.BufferAttribute;
            // 遍历球体全部顶点并沿各自法线方向伸缩。
            for (let index = 0; index < position.count; index += 1) {
                // 把不可变原始坐标写入复用向量。
                direction.set(original[index * 3], original[index * 3 + 1], original[index * 3 + 2]);
                // 保存该顶点的基础半径，确保不同细分顶点仍回到原始表面。
                const baseRadius = direction.length();
                // 单位化后 direction 只表示从球心指向顶点的法线方向。
                direction.normalize();
                // 顶点序号循环映射到前 1200 个可用频谱桶。
                const dataIndex = index % Math.max(1, Math.min(1200, frame.frequencyData.length));
                // 读取频谱桶、归一化并应用用户响应倍率。
                const frequencyLevel = Math.min(
                    1,
                    (frame.frequencyData[dataIndex] || 0) / 255 * responseGain,
                );
                // 连续三角函数生成与音频无关的微弱表面呼吸波纹。
                const ripple = Math.sin(direction.x * 8 + elapsed * 2.2)
                    * Math.cos(direction.y * 7 - elapsed * 1.4) * 0.055;
                // 在基础半径上叠加呼吸波纹和由频谱/低频驱动的向外形变。
                const radius = baseRadius + ripple + frequencyLevel * (0.08 + frame.energy.bass * 0.55);
                // 沿单位法线乘最终半径，把顶点写回球面。
                position.setXYZ(index, direction.x * radius, direction.y * radius, direction.z * radius);
            }
            // 顶点变化后上传位置，并重新计算物理材质的表面法线。
            position.needsUpdate = true;
            geometry.computeVertexNormals();
            // 实体球沿 X/Y 两轴使用不同速度持续旋转。
            sphere.rotation.y = elapsed * 0.18;
            sphere.rotation.x = elapsed * 0.08;
            // 外层线框反向旋转，产生相对运动。
            wire.rotation.y = -elapsed * 0.12;
            // 高频能量轻微放大线框，强化短促节拍。
            wire.scale.setScalar(1 + frame.energy.high * 0.08);
            // 中频能量控制实体球自发光强度。
            material.emissiveIntensity = 0.35 + frame.energy.mid * 1.25;
        },
    };
};

/**
 * 创建由音频能量推动、持续向镜头运动的星空隧道。
 *
 * @returns 包含星点、透视线环和位移更新方法的场景包。
 */
const createTunnel = (): AudioSceneBundle => {
    // 根 Group 容纳星点和全部透视线环。
    const group = new THREE.Group();
    // 2600 个星点填满隧道深度，同时保持移动端可接受的绘制量。
    const count = 2600;
    // 每颗星分别保存 XYZ 位置和 RGB 颜色。
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    // 复用 Color 对象解析三种十六进制颜色，避免循环内创建对象。
    const color = new THREE.Color();

    // 第一步：在空心圆柱体中随机分布所有星点。
    for (let index = 0; index < count; index += 1) {
        // 半径从 2.3 开始，保证镜头正前方保留隧道空心区域。
        const radius = 2.3 + Math.random() * 7.8;
        // 随机角度让星点均匀围绕 Z 轴分布。
        const angle = Math.random() * Math.PI * 2;
        // 将极坐标转换为 X/Y。
        positions[index * 3] = Math.cos(angle) * radius;
        positions[index * 3 + 1] = Math.sin(angle) * radius;
        // Z 在 8 到 -67 之间随机分布，建立长距离透视。
        positions[index * 3 + 2] = 8 - Math.random() * 75;
        // 星点按序号循环使用低、中、高频三种颜色。
        color.set(index % 3 === 0 ? '#35d6ff' : index % 3 === 1 ? '#ef476f' : '#ffd166');
        // 把解析后的颜色写入连续 RGB Buffer。
        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
    }

    // 第二步：创建星点 BufferGeometry 并绑定位置和颜色。
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // 使用透明加法混合材质生成星点光斑。
    const material = new THREE.PointsMaterial({
        size: 0.075,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    // 创建 Points 并作为 Group 的第一个子节点加入。
    const stars = new THREE.Points(geometry, material);
    group.add(stars);

    // 第三步：创建 16 个稀疏线环，强调隧道纵深和运动方向。
    for (let index = 0; index < 16; index += 1) {
        // CircleGeometry 生成圆周，EdgesGeometry 转为只绘制边缘的线几何体。
        const ring = new THREE.LineLoop(
            new THREE.EdgesGeometry(new THREE.CircleGeometry(5.7, 48)),
            new THREE.LineBasicMaterial({color: '#226d70', transparent: true, opacity: 0.13}),
        );
        // 每个线环沿 Z 轴间隔 4.6，形成规律透视标尺。
        ring.position.z = 5 - index * 4.6;
        // 保存初始偏移，便于调试或后续扩展独立环运动。
        ring.userData.offset = index * 4.6;
        // 线环从第二个子节点开始依次加入 Group。
        group.add(ring);
    }

    return {
        group,
        update: (frame, elapsed, delta) => {
            // 取得星点位置 Buffer，逐帧只更新 Z 坐标。
            const position = geometry.getAttribute('position') as THREE.BufferAttribute;
            // 基础速度叠加整体能量和低频能量，鼓点会明显推动星点前冲。
            const speed = 3.8 + frame.energy.overall * 30 + frame.energy.bass * 16;
            // 第四步：让每颗星按本帧 delta 向镜头方向移动。
            for (let index = 0; index < count; index += 1) {
                // 使用 delta 而不是固定步长，使不同刷新率下速度一致。
                let z = position.getZ(index) + speed * delta;
                // 星点越过镜头后送回隧道末端，形成无限循环。
                if (z > 9) z -= 76;
                // 写回当前星点的 Z 坐标。
                position.setZ(index, z);
            }
            // 通知 Three.js 上传修改后的位置。
            position.needsUpdate = true;
            // 高频能量增大星点尺寸，表现细碎明亮声音。
            material.size = 0.055 + frame.energy.high * 0.12;
            // 整个隧道沿 Z 轴轻微摇摆，减少完全静态的轴对称感。
            group.rotation.z = Math.sin(elapsed * 0.16) * 0.12;

            // 第五步：跳过第一个星点节点，更新后续 16 个透视线环。
            group.children.slice(1).forEach((child, index) => {
                // 用取模把线环循环放回远端，并保持 4.6 的间隔。
                child.position.z = 5 - ((elapsed * speed * 0.38 + index * 4.6) % 73.6);
            });
        },
    };
};

/**
 * 根据页面模式创建对应场景，并保持统一更新接口。
 *
 * @param mode 页面当前选择的 3D 模式。
 * @returns 对应模式的 Group 和逐帧 update 方法。
 */
export const createAudioScene = (mode: ThreeSceneMode): AudioSceneBundle => {
    // 依次匹配三个非默认模式；未匹配时使用粒子模式作为安全默认值。
    if (mode === 'terrain') return createTerrain();
    if (mode === 'orb') return createOrb();
    if (mode === 'tunnel') return createTunnel();
    return createParticles();
};

/**
 * 释放场景树中所有几何体和材质占用的 GPU 资源。
 *
 * @param root 即将从主 Scene 移除的模式根节点。
 */
export const disposeObjectTree = (root: THREE.Object3D) => {
    // traverse 会访问 root 及其全部后代，覆盖粒子、Mesh 和线环。
    root.traverse(object => {
        // Points、Line 和 Mesh 都暴露 geometry/material，这里使用统一结构处理。
        const mesh = object as THREE.Mesh;
        // 没有几何体的普通 Group 会被可选链跳过。
        mesh.geometry?.dispose();
        // Three.js 材质可能是单个对象或数组，统一转换成数组后处理。
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        // 过滤 Group 上的 undefined，只对真实材质调用 dispose。
        materials.filter(Boolean).forEach(material => material.dispose());
    });
};
