
export const ENTRY_MAIN = 'main';

export const SITE_MAP_SPEECH_RECOGNITION = {
    entry: ENTRY_MAIN,
    key: 'speech-recognition',
    label: () => '语音识别',
    path: '/speech/speech-recognition',
};
export const SITE_MAP_SPEECH_SYNTHESIS = {
    entry: ENTRY_MAIN,
    key: 'speech-synthesis',
    label: () => '语音合成',
    path: '/speech/speech-synthesis',
};
export const SITE_MAP_AUDIO_CONTEXT = {
    entry: ENTRY_MAIN,
    key: 'audio-context',
    label: () => '网页 audio',
    path: '/audio-context',
};

export const SITE_MAP_SPEECH = {
    entry: ENTRY_MAIN,
    key: 'speech',
    label: () => '语音',
    path: '/speech',
    children: [
        SITE_MAP_SPEECH_RECOGNITION,
        SITE_MAP_SPEECH_SYNTHESIS,
        SITE_MAP_AUDIO_CONTEXT,
    ],
};

export const SITE_MAP_MUSIC_AUDIO_VISUALIZER = {
    entry: ENTRY_MAIN,
    key: 'music-audio-visualizer',
    label: () => '音乐解析与可视化',
    path: '/music/audio-visualizer',
};

/** Canvas 2D 经典频谱、环形黑胶与示波器。 */
export const SITE_MAP_MUSIC_SPECTRUM = {
    entry: ENTRY_MAIN,
    key: 'music-spectrum',
    label: () => '经典频谱',
    path: '/music/spectrum',
};

/** Three.js 粒子、地形、变形球和星空隧道。 */
export const SITE_MAP_MUSIC_PARTICLE_3D = {
    entry: ENTRY_MAIN,
    key: 'music-particle-3d',
    label: () => '粒子与 3D',
    path: '/music/particle-3d',
};

/** GLSL 万花筒和流体色场。 */
export const SITE_MAP_MUSIC_SHADER_LAB = {
    entry: ENTRY_MAIN,
    key: 'music-shader-lab',
    label: () => 'Shader 图形',
    path: '/music/shader-lab',
};

/** 黑胶、氛围背景与卡拉 OK 歌词播放器。 */
export const SITE_MAP_MUSIC_IMMERSIVE_PLAYER = {
    entry: ENTRY_MAIN,
    key: 'music-immersive-player',
    label: () => '沉浸播放器',
    path: '/music/immersive-player',
};

export const SITE_MAP_MUSIC = {
    entry: ENTRY_MAIN,
    key: 'music',
    label: () => '音乐',
    path: '/music',
    children: [
        SITE_MAP_MUSIC_AUDIO_VISUALIZER,
        SITE_MAP_MUSIC_SPECTRUM,
        SITE_MAP_MUSIC_PARTICLE_3D,
        SITE_MAP_MUSIC_SHADER_LAB,
        SITE_MAP_MUSIC_IMMERSIVE_PLAYER,
    ],
};

export const SITE_MAP_MEDIA_DEVICE = {
    entry: ENTRY_MAIN,
    key: 'media-devices',
    label: () => '摄像头',
    path: '/media/media-devices',
};


export const SITE_MAP_IMG_VIDEO_PREVIEW = {
    entry: ENTRY_MAIN,
    key: 'img-video-preview',
    label: () => '图片视频上传预览',
    path: '/media/img-video-preview',
};

export const SITE_MAP_MEDIA_RECORDER = {
    entry: ENTRY_MAIN,
    key: 'media-recorder-api',
    label: () => 'MediaRecorder音频/视频录制',
    path: '/media/media-recorder-api',
};

export const SITE_MAP_MEDIA = {
    entry: ENTRY_MAIN,
    key: 'media',
    label: () => '媒体',
    path: '/media',
    children: [
        SITE_MAP_MEDIA_DEVICE,
        SITE_MAP_IMG_VIDEO_PREVIEW,
        SITE_MAP_MEDIA_RECORDER,
    ],
};


export const SITE_MAP_SSE_BASE = {
    entry: ENTRY_MAIN,
    key: 'sse-base',
    label: () => 'SSE',
    path: '/sse/base',
};
// AI 流式打字机在侧边栏中的菜单元数据。
export const SITE_MAP_SSE_AI_TYPED = {
    // 页面所属入口，与现有主站菜单保持一致。
    entry: ENTRY_MAIN,
    // 菜单和路由使用的稳定唯一标识。
    key: 'sse-ai-typed',
    // 侧边栏展示名称。
    label: () => 'AI 流式打字机',
    // 浏览器访问路径。
    path: '/sse/ai-typed',
};
export const SITE_MAP_SSE = {
    entry: ENTRY_MAIN,
    key: 'sse',
    label: () => 'SSE 示例',
    path: '/sse',
    children: [
        SITE_MAP_SSE_BASE,
        SITE_MAP_SSE_AI_TYPED,
    ],
};

export const SITE_MAP_SCROLL_ANIMATION = {
    entry: ENTRY_MAIN,
    key: 'scroll-animation',
    label: () => '滚动动画',
    path: '/scroll-animation',
};

// web worker
export const SITE_WEB_WORKER_SHARE = {
    entry: ENTRY_MAIN,
    key: 'web-worker-share',
    label: () => 'Web Worker - Share',
    path: '/web-worker/share',
};
export const SITE_MAP_WEB_WORKER = {
    entry: ENTRY_MAIN,
    key: 'web-worker',
    label: () => 'Web Worker',
    path: '/web-worker',
    children: [
        SITE_WEB_WORKER_SHARE,
    ],
};

// intersectionObserver 实现
export const SITE_WEB_OBSERVER_LAZY_LOAD = {
    entry: ENTRY_MAIN,
    key: 'lazy-load',
    label: () => '懒加载',
    path: '/intersection-observer/lazy-load',
};
export const SITE_WEB_OBSERVER_INFINITE_SCROLL = {
    entry: ENTRY_MAIN,
    key: 'infinite-scroll',
    label: () => '无限滚动',
    path: '/intersection-observer/infinite-scroll',
};
export const SITE_WEB_OBSERVER_INFINITE_SCROLL_ANIMATE = {
    entry: ENTRY_MAIN,
    key: 'infinite-scroll-animate',
    label: () => '滚动动画',
    path: '/intersection-observer/infinite-scroll-animate',
};

export const SITE_WEB_OBSERVER_VIRTUAL_LIST = {
    entry: ENTRY_MAIN,
    key: 'virtual-list',
    label: () => '虚拟列表',
    path: '/intersection-observer/virtual-list',
};
export const SITE_MAP_INTERSECTION_OBSERVER = {
    entry: ENTRY_MAIN,
    key: 'intersection-observer',
    label: () => 'intersectionObserver',
    path: '/intersection-observer',
    children: [
        SITE_WEB_OBSERVER_LAZY_LOAD,
        SITE_WEB_OBSERVER_INFINITE_SCROLL_ANIMATE,
        SITE_WEB_OBSERVER_INFINITE_SCROLL,
        SITE_WEB_OBSERVER_VIRTUAL_LIST,
    ],
};

// 虚拟列表
export const SITE_VIRTUAL_LIST_AUTO = {
    entry: ENTRY_MAIN,
    key: 'virtual-list-auto',
    label: () => '高度不定',
    path: '/virtual-list/height-auto',
};
export const SITE_VIRTUAL_LIST_FIXED = {
    entry: ENTRY_MAIN,
    key: 'virtual-list-fixed',
    label: () => '高度固定',
    path: '/virtual-list/height-fixed',
};
// React 固定高度长列表性能方案。
export const SITE_VIRTUAL_LIST_LONG_LIST_FIXED = {
    entry: ENTRY_MAIN,
    key: 'virtual-list-long-list-fixed',
    label: () => '长列表不卡顿（固定高）',
    path: '/virtual-list/long-list-ui-lag/fixed-height',
};
// React 不定高度长列表性能方案。
export const SITE_VIRTUAL_LIST_LONG_LIST_DYNAMIC = {
    entry: ENTRY_MAIN,
    key: 'virtual-list-long-list-dynamic',
    label: () => '长列表不卡顿（不定高）',
    path: '/virtual-list/long-list-ui-lag/dynamic-height',
};
export const SITE_MAP_VIRTUAL_LIST = {
    entry: ENTRY_MAIN,
    key: 'virtual-list',
    label: () => '虚拟列表',
    path: '/virtual-list',
    children: [
        SITE_VIRTUAL_LIST_FIXED,
        SITE_VIRTUAL_LIST_AUTO,
        SITE_VIRTUAL_LIST_LONG_LIST_FIXED,
        SITE_VIRTUAL_LIST_LONG_LIST_DYNAMIC,
    ],
};

// WebSocket
// WebSocket 示例
export const SITE_MAP_WEBSOCKET_DEMO = {
    entry: ENTRY_MAIN,
    key: 'websocket-demo',
    label: () => 'WebSocket 示例',
    path: '/websocket/websocket-demo',
};
export const SITE_MAP_WEBSOCKET_SHARED_CONNECTION_DEMO = {
    entry: ENTRY_MAIN,
    key: 'websocket-shared-connection-demo',
    label: () => '共享连接示例',
    path: '/websocket/shared-connection-demo',
};
export const SITE_MAP_WEBSOCKET_RELIABLE_CONNECTION_DEMO = {
    entry: ENTRY_MAIN,
    key: 'websocket-reliable-connection-demo',
    label: () => '原生 WebSocket 可靠连接',
    path: '/websocket/reliable-connection-demo',
};
export const SITE_MAP_SOCKET_IO_RELIABLE_DEMO = {
    entry: ENTRY_MAIN,
    key: 'reliable-socket-io-demo',
    label: () => 'Socket.IO 可靠连接',
    path: '/websocket/reliable-socket-io-demo',
};
export const SITE_MAP_SOCKET_GROUP = {
    label: () => 'socket群聊',
    key: 'socket-group',
    path: '/websocket/socket-group',
    entry: ENTRY_MAIN,
};
export const SITE_MAP_WS_SOCKET_GROUP = {
    label: () => 'ws-socket群聊',
    key: 'ws-socket-group',
    path: '/websocket/ws-socket-group',
    entry: ENTRY_MAIN,
};

export const SITE_MAP_WEBSOCKET_LIST = {
    entry: ENTRY_MAIN,
    key: 'websocket',
    label: () => 'WebSocket',
    path: '/websocket',
    children: [
        SITE_MAP_WEBSOCKET_DEMO,
        SITE_MAP_WEBSOCKET_SHARED_CONNECTION_DEMO,
        SITE_MAP_WEBSOCKET_RELIABLE_CONNECTION_DEMO,
        SITE_MAP_SOCKET_IO_RELIABLE_DEMO,
        SITE_MAP_SOCKET_GROUP,
        SITE_MAP_WS_SOCKET_GROUP,
    ],
};

// WebGPU 示例
export const SITE_MAP_WEB_GPU_BASE = {
    entry: ENTRY_MAIN,
    key: 'web-gpu-base',
    label: () => '基础演示',
    path: '/web-gpu/base',
};
export const SITE_MAP_WEB_GPU_TRIANGLE = {
    entry: ENTRY_MAIN,
    key: 'web-gpu-triangle',
    label: () => '三角形',
    path: '/web-gpu/triangle',
};
export const SITE_MAP_WEB_GPU_ROTATING = {
    entry: ENTRY_MAIN,
    key: 'web-gpu-rotating',
    label: () => '旋转立方体',
    path: '/web-gpu/rotating',
};
export const SITE_MAP_WEB_GPU_FRACTAL_CUBE = {
    entry: ENTRY_MAIN,
    key: 'web-gpu-fractal-cube',
    label: () => '分形立方体',
    path: '/web-gpu/fractal-cube',
};
export const SITE_MAP_WEB_GPU_COMPUTE_BOIDS = {
    entry: ENTRY_MAIN,
    key: 'web-gpu-compute-boids',
    label: () => '计算 boids',
    path: '/web-gpu/compute-boids',
};
export const SITE_MAP_WEB_GPU_LIST = {
    entry: ENTRY_MAIN,
    key: 'web-gpu',
    label: () => 'WebGPU 示例',
    path: '/web-gpu',
    children: [
        SITE_MAP_WEB_GPU_BASE,
        SITE_MAP_WEB_GPU_TRIANGLE,
        SITE_MAP_WEB_GPU_ROTATING,
        SITE_MAP_WEB_GPU_FRACTAL_CUBE,
        SITE_MAP_WEB_GPU_COMPUTE_BOIDS,
    ],
};


// TensorFlow 示例
export const SITE_MAP_TENSOR_FLOW_SMART_IMAGE = {
    entry: ENTRY_MAIN,
    key: 'tensor-flow-smart-image',
    label: () => '智能图片识别',
    path: '/tensor-flow/smart-image',
};
export const SITE_MAP_TENSOR_FLOW_LIST = {
    entry: ENTRY_MAIN,
    key: 'tensor-flow',
    label: () => 'TensorFlow 示例',
    path: '/tensor-flow',
    children: [
        SITE_MAP_TENSOR_FLOW_SMART_IMAGE,
    ],
};


export const SITE_MAP_MAIN = {
    label: () => '主菜单',
    entry: ENTRY_MAIN,
    path: '#',
    children: [
        SITE_MAP_SPEECH,
        SITE_MAP_MUSIC,
        SITE_MAP_WEBSOCKET_LIST,
        SITE_MAP_WEB_GPU_LIST,
        SITE_MAP_MEDIA,
        SITE_MAP_WEB_WORKER,
        SITE_MAP_SSE,
        SITE_MAP_SCROLL_ANIMATION,
        SITE_MAP_INTERSECTION_OBSERVER,
        SITE_MAP_VIRTUAL_LIST,
        SITE_MAP_TENSOR_FLOW_LIST,
    ],
};
