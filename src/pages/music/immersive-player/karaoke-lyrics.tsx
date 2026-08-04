import {CSSProperties, useEffect, useMemo, useRef, useState} from 'react';
import {SearchOutlined} from '@ant-design/icons';
import {Alert, Empty, Input, Spin} from 'antd';
import {getLyricsSearchQuery} from '../audio-visualizer/lyrics/lrclib-client';
import {LyricLine} from '../audio-visualizer/lyrics/types';
import {useLyrics} from '../audio-visualizer/lyrics/use-lyrics';
import {AudioMetadata} from '../audio-visualizer/use-audio-analyser';
import style from './style.module.scss';

/** 卡拉 OK 歌词面板参数。 */
interface KaraokeLyricsProps {
    /** 当前播放秒数，用于定位和填充歌词。 */
    currentTime: number;
    /** 当前歌曲信息，用于自动搜索与版本评分。 */
    metadata: AudioMetadata | null;
    /** 点击同步歌词后跳转到该行起始时间。 */
    onSeek: (time: number) => void;
}

/** 使用二分查找定位不晚于当前时间的最后一行歌词。 */
const findActiveLineIndex = (lines: LyricLine[], currentTime: number) => {
    let left = 0;
    let right = lines.length - 1;
    let activeIndex = -1;

    while (left <= right) {
        const middle = Math.floor((left + right) / 2);
        const startTime = lines[middle].startTime ?? Number.POSITIVE_INFINITY;
        if (startTime <= currentTime) {
            activeIndex = middle;
            left = middle + 1;
        } else {
            right = middle - 1;
        }
    }
    return activeIndex;
};

/** 同步歌词逐行滚动并按当前行时间范围显示卡拉 OK 填充。 */
export const KaraokeLyrics = ({currentTime, metadata, onSeek}: KaraokeLyricsProps) => {
    const {error, isCached, result, search, status} = useLyrics(metadata);
    const [query, setQuery] = useState('');
    const viewportRef = useRef<HTMLDivElement>(null);
    const activeLineRef = useRef<HTMLButtonElement>(null);
    const metadataName = metadata?.name || '';

    useEffect(() => {
        setQuery(metadataName ? getLyricsSearchQuery(metadataName) : '');
    }, [metadataName]);

    const activeLineIndex = useMemo(() => (
        result?.isSynced ? findActiveLineIndex(result.lines, currentTime) : -1
    ), [currentTime, result]);

    // 当前同步行改变时，只滚动歌词 viewport，并将活动行保持在垂直中部。
    useEffect(() => {
        const viewport = viewportRef.current;
        const activeLine = activeLineRef.current;
        if (!result?.isSynced || activeLineIndex < 0 || !viewport || !activeLine) return;
        const targetTop = activeLine.offsetTop - viewport.clientHeight / 2 + activeLine.offsetHeight / 2;
        viewport.scrollTo({top: Math.max(0, targetTop), behavior: 'smooth'});
    }, [activeLineIndex, result?.isSynced]);

    // 无时间轴歌词无法逐行同步，按整首播放比例平滑移动全文。
    useEffect(() => {
        const viewport = viewportRef.current;
        if (!result || result.isSynced || !metadata?.duration || !viewport) return;
        const progress = Math.min(1, Math.max(0, currentTime / metadata.duration));
        const scrollableDistance = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        viewport.scrollTo({top: scrollableDistance * progress, behavior: 'smooth'});
    }, [currentTime, metadata?.duration, result]);

    /** 计算活动行从开始到下一行之间的播放比例。 */
    const getLineProgress = (index: number) => {
        if (!result?.isSynced || index !== activeLineIndex) return 0;
        const startTime = result.lines[index].startTime || 0;
        const endTime = result.lines[index + 1]?.startTime ?? metadata?.duration ?? startTime + 4;
        return Math.min(1, Math.max(0, (currentTime - startTime) / Math.max(0.1, endTime - startTime)));
    };

    /** 使用输入关键词手动修正歌词匹配。 */
    const handleSearch = (value: string) => {
        const normalizedQuery = value.trim();
        if (normalizedQuery) void search(normalizedQuery, metadata?.duration || 0);
    };

    return (
        <section className={style.lyricsPane} aria-label="卡拉 OK 歌词">
            <header className={style.lyricsHeader}>
                <div>
                    <span>LYRICS</span>
                    <h2>{result?.trackName || '歌词'}</h2>
                    <small>
                        {result
                            ? `${result.artistName} · ${result.isSynced ? '时间轴歌词' : '全文歌词'}${isCached ? ' · 已缓存' : ''}`
                            : 'LRCLIB'}
                    </small>
                </div>
                <Input.Search
                    className={style.lyricsSearch}
                    value={query}
                    placeholder="歌曲名 / 歌手 - 歌曲名"
                    allowClear
                    enterButton={<SearchOutlined />}
                    loading={status === 'loading'}
                    onChange={event => setQuery(event.target.value)}
                    onSearch={handleSearch}
                />
            </header>

            <div ref={viewportRef} className={style.lyricsViewport}>
                {status === 'idle' && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="正在准备歌词" />}
                {status === 'loading' && <div className={style.lyricsState}><Spin /><span>正在匹配歌词</span></div>}
                {status === 'not-found' && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未匹配到歌词，可修改关键词" />}
                {status === 'error' && <Alert type="error" message={error || '歌词查询失败'} showIcon />}

                {status === 'success' && result?.isSynced && (
                    <div className={style.syncedLyrics}>
                        {result.lines.map((line, index) => {
                            const isActive = index === activeLineIndex;
                            const lyricStyle = isActive
                                ? ({'--lyric-progress': `${getLineProgress(index) * 100}%`} as CSSProperties)
                                : undefined;
                            return (
                                <button
                                    ref={isActive ? activeLineRef : undefined}
                                    key={`${line.startTime}-${index}-${line.text}`}
                                    type="button"
                                    className={isActive ? style.activeLyric : style.lyricLine}
                                    style={lyricStyle}
                                    onClick={() => onSeek(line.startTime || 0)}
                                >
                                    {line.text}
                                </button>
                            );
                        })}
                    </div>
                )}

                {status === 'success' && result && !result.isSynced && (
                    <div className={style.plainLyrics}>
                        {result.lines.map((line, index) => <p key={`${index}-${line.text}`}>{line.text}</p>)}
                    </div>
                )}
            </div>
        </section>
    );
};
