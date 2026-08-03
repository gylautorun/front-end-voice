import {LyricsResult} from './types';

/** 当前缓存结构版本；数据结构变化时通过版本号隔离旧数据。 */
const CACHE_VERSION = 1;
/** 同步歌词在浏览器中最多保留 30 天。 */
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
/** 限制缓存歌曲数量，避免歌词文本无限占用 localStorage。 */
const MAX_CACHE_ENTRIES = 30;
/** 使用独立命名空间，避免和站点其他本地数据冲突。 */
const STORAGE_KEY = 'music-audio-visualizer:synced-lyrics:v1';

/** 单首同步歌词的持久化记录。 */
interface LyricsCacheEntry {
    /** 首次写入或最近网络更新的时间戳。 */
    cachedAt: number;
    /** 由搜索词和音频时长组成的稳定索引。 */
    key: string;
    /** 已解析、可直接渲染的同步歌词。 */
    result: LyricsResult;
}

/** localStorage 中保存的完整缓存容器。 */
interface LyricsCacheStore {
    /** 缓存结构版本。 */
    version: number;
    /** 最近使用的记录位于数组前方。 */
    entries: LyricsCacheEntry[];
}

/** 统一搜索词格式，减少大小写、全半角和多余空格造成的重复缓存。 */
const normalizeQuery = (query: string) => (
    query.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ')
);

/** 秒级时长足以区分歌曲版本，同时能容忍不同解码器的小数误差。 */
const createCacheKey = (query: string, duration: number) => (
    `${normalizeQuery(query)}::${Math.max(0, Math.round(duration))}`
);

/** 校验缓存中的歌词，防止损坏或旧结构数据进入组件状态。 */
const isLyricsResult = (value: unknown): value is LyricsResult => {
    // 非对象无法构成歌词结果。
    if (!value || typeof value !== 'object') return false;
    // 逐项检查界面和同步滚动依赖的字段。
    const result = value as Partial<LyricsResult>;
    return typeof result.albumName === 'string'
        && typeof result.artistName === 'string'
        && result.isSynced === true
        && result.provider === 'LRCLIB'
        && typeof result.trackName === 'string'
        && Array.isArray(result.lines)
        && result.lines.length > 0
        && result.lines.every(line => (
            Boolean(line)
            && typeof line.startTime === 'number'
            && Number.isFinite(line.startTime)
            && line.startTime >= 0
            && typeof line.text === 'string'
            && Boolean(line.text.trim())
        ));
};

/** 校验单条缓存记录。 */
const isCacheEntry = (value: unknown): value is LyricsCacheEntry => {
    // 先排除 null 和基本类型。
    if (!value || typeof value !== 'object') return false;
    // 缓存时间、索引和歌词内容都必须有效。
    const entry = value as Partial<LyricsCacheEntry>;
    return typeof entry.cachedAt === 'number'
        && Number.isFinite(entry.cachedAt)
        && typeof entry.key === 'string'
        && isLyricsResult(entry.result);
};

/** 读取并清洗本地缓存；浏览器禁用存储时安全返回空数组。 */
const readEntries = () => {
    try {
        // 缓存尚未建立时直接返回空列表。
        const rawValue = window.localStorage.getItem(STORAGE_KEY);
        if (!rawValue) return [];
        // JSON 先按 unknown 解析，再经过完整结构校验。
        const parsed: unknown = JSON.parse(rawValue);
        if (!parsed || typeof parsed !== 'object') return [];
        const store = parsed as Partial<LyricsCacheStore>;
        // 旧版本结构不能复用，避免字段含义变化导致错误歌词。
        if (store.version !== CACHE_VERSION || !Array.isArray(store.entries)) return [];
        const now = Date.now();
        // 同时移除损坏记录和超过有效期的歌词。
        return store.entries
            .filter(isCacheEntry)
            .filter(entry => now - entry.cachedAt <= CACHE_TTL)
            .slice(0, MAX_CACHE_ENTRIES);
    } catch {
        // 隐私模式、存储权限或损坏 JSON 都不应阻止网络歌词功能。
        return [];
    }
};

/** 写入完整缓存，并将存储失败转换为布尔结果。 */
const writeEntries = (entries: LyricsCacheEntry[]) => {
    try {
        // 只写入容量上限内的最近记录。
        const store: LyricsCacheStore = {
            version: CACHE_VERSION,
            entries: entries.slice(0, MAX_CACHE_ENTRIES),
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
        return true;
    } catch {
        // localStorage 满额或不可用时继续使用当前内存中的网络结果。
        return false;
    }
};

/** 按搜索词和歌曲时长读取同步歌词，并将命中记录移到队首。 */
export const getCachedLyrics = (query: string, duration: number) => {
    // 服务端渲染或测试环境没有 window，此时视为未命中。
    if (typeof window === 'undefined') return null;
    const key = createCacheKey(query, duration);
    const entries = readEntries();
    const index = entries.findIndex(entry => entry.key === key);
    // 未命中时顺便回写清洗后的有效记录。
    if (index < 0) {
        writeEntries(entries);
        return null;
    }
    // 将最近访问记录移到数组开头，实现简单的 LRU 淘汰顺序。
    const [matchedEntry] = entries.splice(index, 1);
    writeEntries([matchedEntry, ...entries]);
    return matchedEntry.result;
};

/** 保存一首同步歌词；相同歌曲会覆盖旧版本并移动到队首。 */
export const setCachedLyrics = (
    query: string,
    duration: number,
    result: LyricsResult,
) => {
    // 只缓存可以按时间轴播放的有效结果。
    if (typeof window === 'undefined' || !isLyricsResult(result)) return false;
    const key = createCacheKey(query, duration);
    const entries = readEntries().filter(entry => entry.key !== key);
    // 新记录放在最前方，超过上限的旧记录由 writeEntries 截断。
    return writeEntries([{cachedAt: Date.now(), key, result}, ...entries]);
};
