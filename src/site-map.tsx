
export const ENTRY_MAIN = 'main';
export const SITE_MAP_SOCKET_GROUP = {
    label: () => 'socket群聊',
    key: 'socket-group',
    path: '/socket-group',
    entry: ENTRY_MAIN,
};
export const SITE_MAP_SPEECH_RECOGNITION = {
    entry: ENTRY_MAIN,
    key: 'speech-recognition',
    label: () => '语音识别',
    path: '/speech-recognition',
};

export const SITE_MAP_SPEECH_SYNTHESIS = {
    entry: ENTRY_MAIN,
    key: 'speech-synthesis',
    label: () => '语音合成',
    path: '/speech-synthesis',
};

export const SITE_MAP_MEDIA_DEVICE = {
    entry: ENTRY_MAIN,
    key: 'media-devices',
    label: () => '摄像头',
    path: '/media-devices',
};

export const SITE_MAP_AUDIO_CONTEXT = {
    entry: ENTRY_MAIN,
    key: 'audio-context',
    label: () => '网页 audio',
    path: '/audio-context',
};

export const SITE_MAP_IMG_VIDEO_PREVIEW = {
    entry: ENTRY_MAIN,
    key: 'audio-context',
    label: () => '图片视频上传预览',
    path: '/img-video-preview',
};

export const SITE_MAP_MEDIA_RECORDER = {
    entry: ENTRY_MAIN,
    key: 'media-recorder-api',
    label: () => 'MediaRecorder音频/视频录制',
    path: '/media-recorder-api',
};
export const SITE_MAP_SSE = {
    entry: ENTRY_MAIN,
    key: 'sse',
    label: () => 'SSE',
    path: '/sse',
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
export const SITE_MAP_VIRTUAL_LIST = {
    entry: ENTRY_MAIN,
    key: 'virtual-list',
    label: () => '虚拟列表',
    path: '/virtual-list',
    children: [
        SITE_VIRTUAL_LIST_FIXED,
        SITE_VIRTUAL_LIST_AUTO,
    ],
};

export const SITE_MAP_MAIN = {
    label: () => '主菜单',
    entry: ENTRY_MAIN,
    path: '#',
    children: [
        SITE_MAP_SPEECH_RECOGNITION,
        SITE_MAP_SPEECH_SYNTHESIS,
        SITE_MAP_SOCKET_GROUP,
        SITE_MAP_MEDIA_DEVICE,
        SITE_MAP_AUDIO_CONTEXT,
        SITE_MAP_IMG_VIDEO_PREVIEW,
        SITE_MAP_MEDIA_RECORDER,
        SITE_MAP_WEB_WORKER,
        SITE_MAP_SSE,
        SITE_MAP_SCROLL_ANIMATION,
        SITE_MAP_INTERSECTION_OBSERVER,
        SITE_MAP_VIRTUAL_LIST,
    ],
};


