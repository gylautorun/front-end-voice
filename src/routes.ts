import React from 'react';
import {
    SITE_MAP_SPEECH_RECOGNITION,
    SITE_MAP_SPEECH_SYNTHESIS,
    SITE_MAP_SOCKET_GROUP,
    SITE_MAP_MEDIA_DEVICE,
    SITE_MAP_AUDIO_CONTEXT,
    SITE_MAP_IMG_VIDEO_PREVIEW,
    SITE_MAP_MEDIA_RECORDER,

    SITE_WEB_WORKER_SHARE,

    SITE_MAP_SSE,
    SITE_MAP_SCROLL_ANIMATION,

    SITE_WEB_OBSERVER_LAZY_LOAD,
    SITE_WEB_OBSERVER_INFINITE_SCROLL,
    SITE_WEB_OBSERVER_INFINITE_SCROLL_ANIMATE,
    SITE_WEB_OBSERVER_VIRTUAL_LIST,
    
    SITE_VIRTUAL_LIST_AUTO,
    SITE_VIRTUAL_LIST_FIXED,

} from './site-map';

export const routes = [
    {
        key: SITE_MAP_SPEECH_RECOGNITION.key,
        path: SITE_MAP_SPEECH_RECOGNITION.path,
        component: React.lazy(() => import('./pages/speech-recognition/index')),
    },
    {
        key: SITE_MAP_SPEECH_SYNTHESIS.key,
        path: SITE_MAP_SPEECH_SYNTHESIS.path,
        component: React.lazy(() => import('./pages/speech-synthesis/index')),
    },
    {
        key: SITE_MAP_SOCKET_GROUP.key,
        path: SITE_MAP_SOCKET_GROUP.path,
        component: React.lazy(() => import('./pages/socket-group/index')),
    },
    {
        key: SITE_MAP_MEDIA_DEVICE.key,
        path: SITE_MAP_MEDIA_DEVICE.path,
        component: React.lazy(() => import('./pages/media-devices/index')),
    },
    {
        key: SITE_MAP_AUDIO_CONTEXT.key,
        path: SITE_MAP_AUDIO_CONTEXT.path,
        component: React.lazy(() => import('./pages/audio-context/index')),
    },
    {
        key: SITE_MAP_IMG_VIDEO_PREVIEW.key,
        path: SITE_MAP_IMG_VIDEO_PREVIEW.path,
        component: React.lazy(() => import('./pages/img-video-preview/index')),
    },
    {
        key: SITE_MAP_MEDIA_RECORDER.key,
        path: SITE_MAP_MEDIA_RECORDER.path,
        component: React.lazy(() => import('./pages/media-recorder-api/index')),
    },
    {
        key: SITE_WEB_WORKER_SHARE.key,
        path: SITE_WEB_WORKER_SHARE.path,
        component: React.lazy(() => import('./pages/web-worker/share-worker/index')),
    },

    {
        key: SITE_MAP_SSE.key,
        path: SITE_MAP_SSE.path,
        component: React.lazy(() => import('./pages/sse/index')),
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
];