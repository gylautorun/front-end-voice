import {LyricLine} from './types';

/** 匹配标准 LRC 时间标签，例如 [01:23.45] 或 [01:23:450]。 */
const TIMESTAMP_PATTERN = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?]/g;

/** 将 LRC 的可变精度小数秒统一转换为秒。 */
const parseFraction = (fraction = '') => {
    // 5、50、500 都分别代表 0.5 秒，因此向右补齐到三位毫秒。
    const milliseconds = Number(fraction.padEnd(3, '0').slice(0, 3));
    // 毫秒除以 1000 得到秒。
    return milliseconds / 1000;
};

/** 解析带时间标签的 LRC 文本，并按播放时间排序。 */
export const parseSyncedLyrics = (content: string): LyricLine[] => {
    // offset 使用毫秒，可整体修正歌词比音乐提前或滞后的情况。
    const offsetMatch = content.match(/^\[offset:([+-]?\d+)]/mi);
    // 未声明 offset 时按零处理。
    const offsetSeconds = Number(offsetMatch?.[1] || 0) / 1000;
    // 保存所有成功解析的歌词行；一个文本行可能对应多个时间标签。
    const parsedLines: LyricLine[] = [];

    // 按换行符逐行处理 LRC。
    content.split(/\r?\n/).forEach(sourceLine => {
        // 每一行都重新创建正则，避免全局 lastIndex 污染下一行。
        const matches = Array.from(sourceLine.matchAll(new RegExp(TIMESTAMP_PATTERN)));
        // 没有时间标签的是元数据或普通文本，不进入同步结果。
        if (!matches.length) return;
        // 删除所有时间标签后得到真正歌词正文。
        const text = sourceLine.replace(TIMESTAMP_PATTERN, '').trim();
        // 空时间点没有展示价值，直接忽略。
        if (!text) return;

        // 同一行存在多个标签时，为每个时间点创建一条歌词。
        matches.forEach(match => {
            // 分钟和秒来自正则的前两个捕获组。
            const minutes = Number(match[1]);
            const seconds = Number(match[2]);
            // 第三个捕获组是可选的小数秒。
            const fraction = parseFraction(match[3]);
            // offset 可能令极早时间成为负数，这里限制到播放起点。
            const startTime = Math.max(0, minutes * 60 + seconds + fraction + offsetSeconds);
            parsedLines.push({startTime, text});
        });
    });

    // LRC 不保证源码顺序与时间顺序一致，因此统一升序排列。
    return parsedLines.sort((left, right) => (
        (left.startTime || 0) - (right.startTime || 0)
    ));
};

/** 将无时间轴的全文歌词转换为统一行结构。 */
export const parsePlainLyrics = (content: string): LyricLine[] => (
    content
        // 同时兼容 Windows 和 Unix 换行符。
        .split(/\r?\n/)
        // 去除每行首尾空白。
        .map(text => text.trim())
        // 忽略空白行，避免歌词面板出现无意义间隔。
        .filter(Boolean)
        // 纯文本没有可靠起始时间，明确保存为 null。
        .map(text => ({startTime: null, text}))
);
