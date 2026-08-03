/** 一行可选时间轴的歌词。 */
export interface LyricLine {
    /** 有同步时间轴时的起始秒数，纯文本歌词为 null。 */
    startTime: number | null;
    /** 去掉 LRC 时间标签后的歌词正文。 */
    text: string;
}

/** 一次成功歌词匹配的标准化结果。 */
export interface LyricsResult {
    /** 歌词服务返回的专辑名。 */
    albumName: string;
    /** 歌词服务返回的歌手名。 */
    artistName: string;
    /** 当前功能只接受带时间轴的同步歌词。 */
    isSynced: true;
    /** 标准化后的歌词行。 */
    lines: LyricLine[];
    /** 当前数据提供方。 */
    provider: 'LRCLIB';
    /** 歌词服务返回的歌曲名。 */
    trackName: string;
}

/** 歌词查询的完整生命周期。 */
export type LyricsStatus = 'idle' | 'loading' | 'success' | 'not-found' | 'error';
