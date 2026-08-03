import {parseSyncedLyrics} from './lrc-parser';
import {LyricsResult} from './types';

/** LRCLIB 搜索接口返回的单个候选结果。 */
interface LrclibTrack {
    /** 专辑名。 */
    albumName: string;
    /** 歌手名。 */
    artistName: string;
    /** 音频时长，单位为秒。 */
    duration: number;
    /** 是否被标记为纯音乐。 */
    instrumental: boolean;
    /** 无时间轴歌词。 */
    plainLyrics: string | null;
    /** 带 LRC 时间标签的同步歌词。 */
    syncedLyrics: string | null;
    /** 歌曲名。 */
    trackName: string;
}

/** 公开歌词服务地址；该接口无需密钥并允许浏览器跨域访问。 */
const LRCLIB_SEARCH_ENDPOINT = 'https://lrclib.net/api/search';

/** 去掉扩展名和常见首尾空格，得到默认歌词搜索词。 */
export const getLyricsSearchQuery = (fileName: string) => (
    fileName.replace(/\.[^.]+$/, '').trim()
);

/** 将“歌手 - 歌名”形式拆为可用于候选评分的身份信息。 */
const parseTrackIdentity = (query: string) => {
    // 同时支持半角横线、短横线和长横线，且要求两侧存在空白。
    const parts = query.split(/\s+[-–—]\s+/).map(part => part.trim()).filter(Boolean);
    // 只有一段时无法可靠推断歌手，整段作为歌名。
    if (parts.length < 2) return {artist: '', title: query.trim()};
    // 第一段作为歌手，其余部分重新连接为歌曲名，兼容歌名本身带横线。
    return {artist: parts[0], title: parts.slice(1).join(' - ')};
};

/** 统一大小写和符号，降低文件名与网络元数据格式差异。 */
const normalizeText = (value: string) => (
    value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
);

/** 要求网络歌名与目标歌名相等或互相包含，防止只因时长接近而误配。 */
const isTitleCompatible = (candidate: LrclibTrack, query: string) => {
    // “歌手 - 歌名”格式只取歌名部分进行硬性校验。
    const {title} = parseTrackIdentity(query);
    const expectedTitle = normalizeText(title);
    const actualTitle = normalizeText(candidate.trackName);
    // 空标题不能成为有效匹配依据。
    if (!expectedTitle || !actualTitle) return false;
    return actualTitle === expectedTitle
        || actualTitle.includes(expectedTitle)
        || expectedTitle.includes(actualTitle);
};

/** 判断未知网络响应是否具备歌词候选的必要字段。 */
const isLrclibTrack = (value: unknown): value is LrclibTrack => {
    // 非对象和 null 都不可能是候选记录。
    if (!value || typeof value !== 'object') return false;
    // 转为部分候选类型后逐项检查关键字段。
    const candidate = value as Partial<LrclibTrack>;
    return typeof candidate.trackName === 'string'
        && typeof candidate.artistName === 'string'
        && typeof candidate.albumName === 'string'
        && typeof candidate.duration === 'number'
        && typeof candidate.instrumental === 'boolean'
        && (typeof candidate.plainLyrics === 'string' || candidate.plainLyrics === null)
        && (typeof candidate.syncedLyrics === 'string' || candidate.syncedLyrics === null);
};

/** 根据歌名、歌手、时长和歌词完整度计算候选可信度。 */
const scoreCandidate = (candidate: LrclibTrack, query: string, duration: number) => {
    const {artist, title} = parseTrackIdentity(query);
    // 标准化本地和网络文本后再比较。
    const expectedTitle = normalizeText(title);
    const expectedArtist = normalizeText(artist);
    const actualTitle = normalizeText(candidate.trackName);
    const actualArtist = normalizeText(candidate.artistName);
    // 初始分数为零，匹配越明确分数越高。
    let score = 0;

    // 歌曲名完全一致是最重要的匹配依据。
    if (actualTitle === expectedTitle) score += 120;
    // 一方包含另一方可兼容 Live、伴奏版等后缀。
    else if (actualTitle.includes(expectedTitle) || expectedTitle.includes(actualTitle)) score += 55;

    // 文件名包含歌手时进一步校验，避免同名歌曲误配。
    if (expectedArtist && actualArtist === expectedArtist) score += 80;
    else if (expectedArtist && (
        actualArtist.includes(expectedArtist) || expectedArtist.includes(actualArtist)
    )) score += 40;

    // 已完成解码时优先选择时长最接近的版本。
    if (duration > 0) {
        const difference = Math.abs(candidate.duration - duration);
        if (difference <= 2) score += 90;
        else if (difference <= 5) score += 65;
        else if (difference <= 12) score += 35;
        // 差距过大时扣分，防止选中同名但不同版本。
        else score -= Math.min(80, difference);
    }

    // 纯音乐候选不能为歌词面板提供内容。
    if (candidate.instrumental) score -= 100;
    return score;
};

/** 从公开 LRCLIB 服务搜索并返回最可信的一份歌词。 */
export const searchOnlineLyrics = async (
    query: string,
    duration: number,
    signal: AbortSignal,
): Promise<LyricsResult | null> => {
    // URL API 负责正确编码中文、空格和特殊符号。
    const requestUrl = new URL(LRCLIB_SEARCH_ENDPOINT);
    requestUrl.searchParams.set('q', query.trim());
    // 只请求 JSON，并显式忽略站点凭据。
    const response = await fetch(requestUrl, {
        headers: {Accept: 'application/json'},
        credentials: 'omit',
        signal,
    });

    // 429 单独提示请求频率问题，其余状态使用通用服务错误。
    if (response.status === 429) throw new Error('歌词查询过于频繁，请稍后重试');
    if (!response.ok) throw new Error('歌词服务暂时不可用');

    // 网络数据按 unknown 处理，避免未经校验的数据进入界面。
    const payload: unknown = await response.json();
    // 只保留结构有效、标题匹配且包含时间轴歌词的记录。
    const candidates = Array.isArray(payload)
        ? payload
            .filter(isLrclibTrack)
            .filter(item => Boolean(item.syncedLyrics))
            .filter(item => isTitleCompatible(item, query))
        : [];
    // 没有同步歌词候选时返回未匹配，而不是回退到无法逐行同步的全文。
    if (!candidates.length) return null;

    // 按可信度排序后选择第一份可以成功解析出时间轴的歌词。
    const selected = [...candidates]
        .sort((left, right) => (
            scoreCandidate(right, query, duration) - scoreCandidate(left, query, duration)
        ))
        .map(candidate => ({
            candidate,
            lines: parseSyncedLyrics(candidate.syncedLyrics || ''),
        }))
        .find(item => item.lines.length > 0);
    // 候选字符串无法解析出有效时间标签时按未找到处理。
    if (!selected) return null;

    return {
        albumName: selected.candidate.albumName,
        artistName: selected.candidate.artistName,
        isSynced: true,
        lines: selected.lines,
        provider: 'LRCLIB',
        trackName: selected.candidate.trackName,
    };
};
