import {memo, useEffect, useMemo, useRef, useState} from 'react';
import {SearchOutlined} from '@ant-design/icons';
import {Alert, Empty, Input, Spin} from 'antd';
import {getLyricsSearchQuery} from '../lyrics/lrclib-client';
import {LyricLine} from '../lyrics/types';
import {useLyrics} from '../lyrics/use-lyrics';
import style from '../style.module.scss';
import {AudioMetadata} from '../use-audio-analyser';

/** 歌词面板所需的播放器状态。 */
interface LyricsPanelProps {
    /** 当前播放秒数，用于定位同步歌词。 */
    currentTime: number;
    /** 当前音轨信息，用于自动搜索和版本匹配。 */
    metadata: AudioMetadata | null;
    /** 点击同步歌词时移动播放头。 */
    onSeek: (time: number) => void;
}

/** 使用二分查找定位当前播放时间对应的最后一行歌词。 */
const findActiveLineIndex = (lines: LyricLine[], currentTime: number) => {
    // 搜索区间左边界。
    let left = 0;
    // 搜索区间右边界。
    let right = lines.length - 1;
    // 尚未到达第一行歌词时保持 -1。
    let activeIndex = -1;

    // 每轮排除一半数据，歌词较长时也无需逐行扫描。
    while (left <= right) {
        // 取当前区间中点。
        const middle = Math.floor((left + right) / 2);
        // 同步歌词一定有时间；空值作为无限大保护异常输入。
        const startTime = lines[middle].startTime ?? Number.POSITIVE_INFINITY;
        // 中点已经开始播放，继续向右寻找更接近当前时间的行。
        if (startTime <= currentTime) {
            activeIndex = middle;
            left = middle + 1;
        } else {
            // 中点尚未开始，目标只能位于左半区。
            right = middle - 1;
        }
    }
    return activeIndex;
};

/** 自动匹配、搜索并渲染同步或全文歌词。 */
export const LyricsPanel = memo(function LyricsPanel({
    currentTime,
    metadata,
    onSeek,
}: LyricsPanelProps) {
    // Hook 负责网络请求、取消旧请求和候选匹配。
    const {error, isCached, result, search, status} = useLyrics(metadata);
    // 手动搜索框默认使用去掉扩展名的文件名。
    const [searchValue, setSearchValue] = useState('');
    // 歌词滚动区域，用于将当前行保持在中间位置。
    const viewportRef = useRef<HTMLDivElement>(null);
    // 当前高亮歌词按钮，用于读取它在滚动容器内的位置。
    const activeLineRef = useRef<HTMLButtonElement>(null);
    // effect 只关心文件名变化，避免依赖整个 metadata 对象。
    const metadataName = metadata?.name || '';

    // 切换音频时同步更新搜索框，但不干扰用户输入过程。
    useEffect(() => {
        setSearchValue(metadataName ? getLyricsSearchQuery(metadataName) : '');
    }, [metadataName]);

    // 只有同步歌词才根据播放器时间计算当前行。
    const activeLineIndex = useMemo(() => (
        result?.isSynced
            ? findActiveLineIndex(result.lines, currentTime)
            : -1
    ), [currentTime, result]);
    // 将歌词类型和播放时长提取为基本值，供两个滚动 effect 稳定判断。
    const shouldScrollSyncedLyrics = status === 'success' && Boolean(result?.isSynced);
    const shouldScrollPlainLyrics = status === 'success' && Boolean(result && !result.isSynced);
    const trackDuration = metadata?.duration || 0;

    // 当前歌词变化时平滑滚动，使高亮行稳定停留在面板中部。
    useEffect(() => {
        const viewport = viewportRef.current;
        const activeLine = activeLineRef.current;
        // 非同步歌词、首段前或节点尚未挂载时不执行当前行滚动。
        if (!shouldScrollSyncedLyrics || !viewport || !activeLine || activeLineIndex < 0) return;
        // 根据元素相对容器顶部的位置计算居中滚动目标。
        const top = activeLine.offsetTop
            - viewport.clientHeight / 2
            + activeLine.offsetHeight / 2;
        // 平滑滚动只发生在歌词容器内部，不移动整个页面。
        viewport.scrollTo({top: Math.max(0, top), behavior: 'smooth'});
    }, [activeLineIndex, shouldScrollSyncedLyrics]);

    // 全文歌词没有逐行时间标签，按整首播放比例移动正文作为明确的降级行为。
    useEffect(() => {
        const viewport = viewportRef.current;
        // 只处理成功返回的全文歌词，并要求音频具有有效时长。
        if (!shouldScrollPlainLyrics || !viewport || !trackDuration) return;
        // 将播放时间限制到 0–1，避免媒体时长校正期间出现越界位置。
        const progress = Math.min(1, Math.max(0, currentTime / trackDuration));
        // scrollHeight 与可视高度的差值就是正文能够移动的实际距离。
        const scrollableDistance = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        // 相邻 timeupdate 之间由浏览器平滑过渡，不移动歌词栏之外的页面。
        viewport.scrollTo({top: scrollableDistance * progress, behavior: 'smooth'});
    }, [currentTime, shouldScrollPlainLyrics, trackDuration]);

    /** 使用输入框关键词重新匹配当前时长附近的歌词版本。 */
    const handleSearch = (value: string) => {
        // 去除用户输入首尾空格，避免空请求。
        const query = value.trim();
        if (!query) return;
        // 手动查询仍使用音频时长参与候选评分。
        void search(query, metadata?.duration || 0);
    };

    return (
        <section className={style.lyricsPanel} aria-label="网络歌词">
            <div className={style.lyricsHeader}>
                <div className={style.lyricsIdentity}>
                    <span className={style.sectionLabel}>LYRICS</span>
                    <h2>{result?.trackName || '歌词'}</h2>
                    {result && (
                        <span className={style.lyricsMeta}>
                            {result.artistName}{result.albumName ? ` · ${result.albumName}` : ''}
                        </span>
                    )}
                </div>
                <span className={style.lyricsBadge}>
                    {result
                        ? `${result.provider} · ${result.isSynced ? '同步' : '全文'}${isCached ? ' · 已缓存' : ''}`
                        : 'LRCLIB'}
                </span>
            </div>

            {/* 手动关键词用于修正文件名缺少歌手或版本信息的情况。 */}
            <Input.Search
                className={style.lyricsSearch}
                aria-label="搜索歌曲歌词"
                value={searchValue}
                placeholder="歌曲名 / 歌手 - 歌曲名"
                allowClear
                enterButton={<SearchOutlined />}
                loading={status === 'loading'}
                onChange={event => setSearchValue(event.target.value)}
                onSearch={handleSearch}
            />

            <div ref={viewportRef} className={style.lyricsViewport}>
                {/* 文件解码完成前保持稳定的空状态。 */}
                {status === 'idle' && (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择音频后显示歌词" />
                )}
                {/* 网络请求期间显示居中的加载状态。 */}
                {status === 'loading' && (
                    <div className={style.lyricsState}>
                        <Spin />
                        <span>正在匹配歌词</span>
                    </div>
                )}
                {/* 请求成功但没有候选时允许用户修改关键词继续搜索。 */}
                {status === 'not-found' && (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未匹配到可用歌词" />
                )}
                {/* 网络或服务错误使用明确提示，不覆盖搜索框。 */}
                {status === 'error' && (
                    <Alert type="error" showIcon message={error || '歌词查询失败'} />
                )}
                {/* 同步歌词使用可点击按钮，并高亮当前播放行。 */}
                {status === 'success' && result?.isSynced && (
                    <div className={style.syncedLyrics}>
                        {result.lines.map((line, index) => (
                            <button
                                ref={index === activeLineIndex ? activeLineRef : undefined}
                                key={`${line.startTime}-${index}-${line.text}`}
                                type="button"
                                className={index === activeLineIndex ? style.activeLyricLine : style.lyricLine}
                                onClick={() => onSeek(line.startTime || 0)}
                            >
                                {line.text}
                            </button>
                        ))}
                    </div>
                )}
                {/* 全文歌词留在左侧正文区，不提供不准确的逐行跳转和高亮。 */}
                {status === 'success' && result && !result.isSynced && (
                    <div className={style.plainLyrics}>
                        {result.lines.map((line, index) => (
                            <p key={`${index}-${line.text}`}>{line.text}</p>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
});
