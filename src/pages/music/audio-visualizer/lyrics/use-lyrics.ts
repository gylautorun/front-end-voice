import {useCallback, useEffect, useRef, useState} from 'react';
import {AudioMetadata} from '../use-audio-analyser';
import {getCachedLyrics, setCachedLyrics} from './lyrics-cache';
import {getLyricsSearchQuery, searchOnlineLyrics} from './lrclib-client';
import {LyricsResult, LyricsStatus} from './types';

/** 管理自动匹配、手动搜索、取消旧请求和歌词查询状态。 */
export const useLyrics = (metadata: AudioMetadata | null) => {
    // 保存当前成功匹配的歌词。
    const [result, setResult] = useState<LyricsResult | null>(null);
    // 保存加载、成功、未找到或错误状态。
    const [status, setStatus] = useState<LyricsStatus>('idle');
    // 保存可以直接显示给用户的错误信息。
    const [error, setError] = useState('');
    // 标记当前歌词是否已持久化，供面板展示缓存状态。
    const [isCached, setIsCached] = useState(false);
    // 新搜索开始时取消旧请求，防止旧歌曲结果覆盖新歌曲。
    const requestRef = useRef<AbortController | null>(null);

    /** 使用关键词和已知时长执行一次网络歌词匹配。 */
    const search = useCallback(async (query: string, duration = 0) => {
        // 空关键词不发送无意义请求。
        if (!query.trim()) return;
        // 中止上一首歌或上一次手动搜索。
        requestRef.current?.abort();
        // 立即解除旧请求身份，防止它的超时回调覆盖后续缓存命中状态。
        requestRef.current = null;
        // 新查询开始时清除旧歌词和错误。
        setResult(null);
        setError('');
        setIsCached(false);
        setStatus('loading');
        // 优先读取本地同步歌词，命中后无需再次访问公共接口。
        const cachedResult = getCachedLyrics(query, duration);
        if (cachedResult) {
            setResult(cachedResult);
            setIsCached(true);
            setStatus('success');
            return;
        }
        // 为本次查询创建独立取消信号。
        const controller = new AbortController();
        requestRef.current = controller;
        // 公共接口长时间无响应时主动结束，避免界面永久停留在加载状态。
        const timeoutId = window.setTimeout(() => {
            // 只有本次请求仍是最新请求时才更新超时错误。
            if (requestRef.current !== controller) return;
            setError('歌词查询超时，请稍后重试');
            setStatus('error');
            controller.abort();
        }, 12000);

        try {
            // 等待歌词服务返回并完成候选评分和文本解析。
            const nextResult = await searchOnlineLyrics(query, duration, controller.signal);
            // 已取消请求不能继续覆盖状态。
            if (controller.signal.aborted) return;
            // null 表示请求成功但没有可用歌词。
            if (!nextResult) {
                setStatus('not-found');
                return;
            }
            // 保存标准化歌词，并尝试持久化到浏览器缓存。
            setResult(nextResult);
            setIsCached(setCachedLyrics(query, duration, nextResult));
            setStatus('success');
        } catch (reason) {
            // 主动取消属于正常切换流程，不显示错误。
            if (controller.signal.aborted) return;
            // 使用服务层的明确错误，未知异常回退为网络错误。
            setError(reason instanceof Error ? reason.message : '歌词查询失败');
            setStatus('error');
        } finally {
            // 无论请求成功、失败或取消都清理超时计时器。
            window.clearTimeout(timeoutId);
            // 只有当前请求仍是最新请求时才清空引用。
            if (requestRef.current === controller) {
                requestRef.current = null;
            }
        }
    }, []);

    // 音频解析完成后，自动根据文件名和精确时长匹配一次。
    useEffect(() => {
        // 文件还未解码完成时等待时长就绪，避免重复请求和错误版本匹配。
        if (!metadata?.duration) {
            requestRef.current?.abort();
            // 音频切换的空闲状态不能再被旧请求的超时回调覆盖。
            requestRef.current = null;
            setResult(null);
            setError('');
            setIsCached(false);
            setStatus('idle');
            return;
        }
        // 文件名去掉扩展名后作为默认搜索词。
        const query = getLyricsSearchQuery(metadata.name);
        void search(query, metadata.duration);
    }, [metadata?.duration, metadata?.name, search]);

    // Hook 卸载时中止仍在等待的网络请求。
    useEffect(() => () => requestRef.current?.abort(), []);

    return {
        error,
        isCached,
        result,
        search,
        status,
    };
};
