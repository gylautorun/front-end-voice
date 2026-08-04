import React from 'react';
import {
    SITE_MAP_SPEECH_RECOGNITION,
    SITE_MAP_SPEECH_SYNTHESIS,
    SITE_MAP_MUSIC_AUDIO_VISUALIZER,
    SITE_MAP_MUSIC_SPECTRUM,
    SITE_MAP_MUSIC_PARTICLE_3D,
    SITE_MAP_MUSIC_SHADER_LAB,
    SITE_MAP_MUSIC_IMMERSIVE_PLAYER,
    SITE_MAP_MUSIC_NOTE_STUDIO,
    SITE_MAP_MUSIC_ANALYSIS_STUDIO,
    SITE_MAP_MUSIC_GENERATIVE_STUDIO,
    SITE_MAP_MUSIC_LYRIC_MOTION,
    SITE_MAP_MUSIC_INTERACTIVE_STAGE,
    SITE_MAP_MUSIC_AMBIENT_LAB,
    SITE_MAP_MUSIC_SOUND_SCULPTURE,
    SITE_MAP_MEDIA_DEVICE,
    SITE_MAP_AUDIO_CONTEXT,
    SITE_MAP_IMG_VIDEO_PREVIEW,
    SITE_MAP_MEDIA_RECORDER,

    SITE_WEB_WORKER_SHARE,

    SITE_MAP_SSE_BASE,
    SITE_MAP_SSE_AI_TYPED,

    SITE_MAP_SCROLL_ANIMATION,

    SITE_WEB_OBSERVER_LAZY_LOAD,
    SITE_WEB_OBSERVER_INFINITE_SCROLL,
    SITE_WEB_OBSERVER_INFINITE_SCROLL_ANIMATE,
    SITE_WEB_OBSERVER_VIRTUAL_LIST,
    
    SITE_VIRTUAL_LIST_AUTO,
    SITE_VIRTUAL_LIST_FIXED,
    SITE_VIRTUAL_LIST_LONG_LIST_DYNAMIC,
    SITE_VIRTUAL_LIST_LONG_LIST_FIXED,

    SITE_MAP_WEBSOCKET_DEMO,
    SITE_MAP_WEBSOCKET_SHARED_CONNECTION_DEMO,
    SITE_MAP_WEBSOCKET_RELIABLE_CONNECTION_DEMO,
    SITE_MAP_SOCKET_IO_RELIABLE_DEMO,
    SITE_MAP_SOCKET_GROUP,
    SITE_MAP_WS_SOCKET_GROUP,

    SITE_MAP_WEB_GPU_BASE,
    SITE_MAP_WEB_GPU_TRIANGLE,
    SITE_MAP_WEB_GPU_ROTATING,
    SITE_MAP_WEB_GPU_FRACTAL_CUBE,
    SITE_MAP_WEB_GPU_COMPUTE_BOIDS,

    SITE_MAP_TENSOR_FLOW_SMART_IMAGE,

} from './site-map';

export const routes = [
    {
        key: SITE_MAP_SPEECH_RECOGNITION.key,
        path: SITE_MAP_SPEECH_RECOGNITION.path,
        component: React.lazy(() => import('./pages/speech/speech-recognition/index')),
    },
    {
        key: SITE_MAP_SPEECH_SYNTHESIS.key,
        path: SITE_MAP_SPEECH_SYNTHESIS.path,
        component: React.lazy(() => import('./pages/speech/speech-synthesis/index')),
    },
    {
        key: SITE_MAP_MUSIC_AUDIO_VISUALIZER.key,
        path: SITE_MAP_MUSIC_AUDIO_VISUALIZER.path,
        component: React.lazy(() => import('./pages/music/audio-visualizer/index')),
    },
    {
        key: SITE_MAP_MUSIC_SPECTRUM.key,
        path: SITE_MAP_MUSIC_SPECTRUM.path,
        component: React.lazy(() => import('./pages/music/spectrum/index')),
    },
    {
        key: SITE_MAP_MUSIC_PARTICLE_3D.key,
        path: SITE_MAP_MUSIC_PARTICLE_3D.path,
        component: React.lazy(() => import('./pages/music/particle-3d/index')),
    },
    {
        key: SITE_MAP_MUSIC_SHADER_LAB.key,
        path: SITE_MAP_MUSIC_SHADER_LAB.path,
        component: React.lazy(() => import('./pages/music/shader-lab/index')),
    },
    {
        key: SITE_MAP_MUSIC_IMMERSIVE_PLAYER.key,
        path: SITE_MAP_MUSIC_IMMERSIVE_PLAYER.path,
        component: React.lazy(() => import('./pages/music/immersive-player/index')),
    },
    {
        key: SITE_MAP_MUSIC_NOTE_STUDIO.key,
        path: SITE_MAP_MUSIC_NOTE_STUDIO.path,
        component: React.lazy(() => import('./pages/music/note-studio/index')),
    },
    {
        key: SITE_MAP_MUSIC_ANALYSIS_STUDIO.key,
        path: SITE_MAP_MUSIC_ANALYSIS_STUDIO.path,
        component: React.lazy(() => import('./pages/music/analysis-studio/index')),
    },
    {
        key: SITE_MAP_MUSIC_GENERATIVE_STUDIO.key,
        path: SITE_MAP_MUSIC_GENERATIVE_STUDIO.path,
        component: React.lazy(() => import('./pages/music/generative-studio/index')),
    },
    {
        key: SITE_MAP_MUSIC_LYRIC_MOTION.key,
        path: SITE_MAP_MUSIC_LYRIC_MOTION.path,
        component: React.lazy(() => import('./pages/music/lyric-motion/index')),
    },
    {
        key: SITE_MAP_MUSIC_INTERACTIVE_STAGE.key,
        path: SITE_MAP_MUSIC_INTERACTIVE_STAGE.path,
        component: React.lazy(() => import('./pages/music/interactive-stage/index')),
    },
    {
        key: SITE_MAP_MUSIC_AMBIENT_LAB.key,
        path: SITE_MAP_MUSIC_AMBIENT_LAB.path,
        component: React.lazy(() => import('./pages/music/ambient-lab/index')),
    },
    {
        key: SITE_MAP_MUSIC_SOUND_SCULPTURE.key,
        path: SITE_MAP_MUSIC_SOUND_SCULPTURE.path,
        component: React.lazy(() => import('./pages/music/sound-sculpture/index')),
    },
    
    {
        key: SITE_MAP_MEDIA_DEVICE.key,
        path: SITE_MAP_MEDIA_DEVICE.path,
        component: React.lazy(() => import('./pages/media/media-devices/index')),
    },
    {
        key: SITE_MAP_AUDIO_CONTEXT.key,
        path: SITE_MAP_AUDIO_CONTEXT.path,
        component: React.lazy(() => import('./pages/speech/audio-context/index')),
    },
    {
        key: SITE_MAP_IMG_VIDEO_PREVIEW.key,
        path: SITE_MAP_IMG_VIDEO_PREVIEW.path,
        component: React.lazy(() => import('./pages/media/img-video-preview/index')),
    },
    {
        key: SITE_MAP_MEDIA_RECORDER.key,
        path: SITE_MAP_MEDIA_RECORDER.path,
        component: React.lazy(() => import('./pages/media/media-recorder-api/index')),
    },
    {
        key: SITE_WEB_WORKER_SHARE.key,
        path: SITE_WEB_WORKER_SHARE.path,
        component: React.lazy(() => import('./pages/web-worker/share-worker/index')),
    },

    {
        key: SITE_MAP_SSE_BASE.key,
        path: SITE_MAP_SSE_BASE.path,
        component: React.lazy(() => import('./pages/sse/index')),
    },
    {
        // 独立懒加载 AI 打字机页面，避免增加其他页面的首屏代码。
        // 路由 key 与站点地图保持一致。
        key: SITE_MAP_SSE_AI_TYPED.key,
        // 注册浏览器访问地址。
        path: SITE_MAP_SSE_AI_TYPED.path,
        // 访问该路由时才加载页面模块。
        component: React.lazy(() => import('./pages/sse/ai-typed/index')),
    },
    {
        key: SITE_MAP_SCROLL_ANIMATION.key,
        path: SITE_MAP_SCROLL_ANIMATION.path,
        component: React.lazy(() => import('./pages/scroll-animation/index')),
    },

    {
        key: SITE_WEB_OBSERVER_LAZY_LOAD.key,
        path: SITE_WEB_OBSERVER_LAZY_LOAD.path,
        component: React.lazy(() => import('./pages/intersection-observer/lazy-load/index')),
    },
    {
        key: SITE_WEB_OBSERVER_INFINITE_SCROLL.key,
        path: SITE_WEB_OBSERVER_INFINITE_SCROLL.path,
        component: React.lazy(() => import('./pages/intersection-observer/infinite-scroll/index')),
    },
    {
        key: SITE_WEB_OBSERVER_INFINITE_SCROLL_ANIMATE.key,
        path: SITE_WEB_OBSERVER_INFINITE_SCROLL_ANIMATE.path,
        component: React.lazy(() => import('./pages/intersection-observer/infinite-scroll-animate/index')),
    },
    {
        key: SITE_WEB_OBSERVER_VIRTUAL_LIST.key,
        path: SITE_WEB_OBSERVER_VIRTUAL_LIST.path,
        component: React.lazy(() => import('./pages/intersection-observer/virtual-list/index')),
    },

    {
        key: SITE_VIRTUAL_LIST_FIXED.key,
        path: SITE_VIRTUAL_LIST_FIXED.path,
        component: React.lazy(() => import('./pages/virtual-list/height-fixed/index')),
    },
    {
        key: SITE_VIRTUAL_LIST_AUTO.key,
        path: SITE_VIRTUAL_LIST_AUTO.path,
        component: React.lazy(() => import('./pages/virtual-list/height-auto/index')),
    },
    {
        key: SITE_VIRTUAL_LIST_LONG_LIST_FIXED.key,
        path: SITE_VIRTUAL_LIST_LONG_LIST_FIXED.path,
        component: React.lazy(() => import(
            './pages/virtual-list/long-list-ui-lag/fixed-height/index'
        )),
    },
    {
        key: SITE_VIRTUAL_LIST_LONG_LIST_DYNAMIC.key,
        path: SITE_VIRTUAL_LIST_LONG_LIST_DYNAMIC.path,
        component: React.lazy(() => import(
            './pages/virtual-list/long-list-ui-lag/dynamic-height/index'
        )),
    },

    {
        key: SITE_MAP_WEBSOCKET_DEMO.key,
        path: SITE_MAP_WEBSOCKET_DEMO.path,
        component: React.lazy(() => import('./pages/websocket/websocket-demo/index')),
    },
    {
        key: SITE_MAP_WEBSOCKET_SHARED_CONNECTION_DEMO.key,
        path: SITE_MAP_WEBSOCKET_SHARED_CONNECTION_DEMO.path,
        component: React.lazy(() => import('./pages/websocket/shared-connection-demo/index')),
    },
    {
        key: SITE_MAP_WEBSOCKET_RELIABLE_CONNECTION_DEMO.key,
        path: SITE_MAP_WEBSOCKET_RELIABLE_CONNECTION_DEMO.path,
        component: React.lazy(() => import('./pages/websocket/reliable-connection-demo/index')),
    },
    {
        key: SITE_MAP_SOCKET_IO_RELIABLE_DEMO.key,
        path: SITE_MAP_SOCKET_IO_RELIABLE_DEMO.path,
        component: React.lazy(() => import('./pages/websocket/reliable-socket-io-demo/index')),
    },
    {
        key: SITE_MAP_SOCKET_GROUP.key,
        path: SITE_MAP_SOCKET_GROUP.path,
        component: React.lazy(() => import('./pages/websocket/socket-group/index')),
    },
    {
        key: SITE_MAP_WS_SOCKET_GROUP.key,
        path: SITE_MAP_WS_SOCKET_GROUP.path,
        component: React.lazy(() => import('./pages/websocket/ws-socket-group/index')),
    },

    {
        key: SITE_MAP_WEB_GPU_BASE.key,
        path: SITE_MAP_WEB_GPU_BASE.path,
        component: React.lazy(() => import('./pages/web-gpu/index/index')),
    },
    {
        key: SITE_MAP_WEB_GPU_TRIANGLE.key,
        path: SITE_MAP_WEB_GPU_TRIANGLE.path,
        component: React.lazy(() => import('./pages/web-gpu/triangle/index')),
    },
    {
        key: SITE_MAP_WEB_GPU_ROTATING.key,
        path: SITE_MAP_WEB_GPU_ROTATING.path,
        component: React.lazy(() => import('./pages/web-gpu/rotating/index')),
    },
    {
        key: SITE_MAP_WEB_GPU_FRACTAL_CUBE.key,
        path: SITE_MAP_WEB_GPU_FRACTAL_CUBE.path,
        component: React.lazy(() => import('./pages/web-gpu/fractal-cube/index')),
    },
    {
        key: SITE_MAP_WEB_GPU_COMPUTE_BOIDS.key,
        path: SITE_MAP_WEB_GPU_COMPUTE_BOIDS.path,
        component: React.lazy(() => import('./pages/web-gpu/compute-boids/index')),
    },

    {
        key: SITE_MAP_TENSOR_FLOW_SMART_IMAGE.key,
        path: SITE_MAP_TENSOR_FLOW_SMART_IMAGE.path,
        component: React.lazy(() => import('./pages/tensor-flow/smart-image/index')),
    },
];
