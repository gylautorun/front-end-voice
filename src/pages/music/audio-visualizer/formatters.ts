/** 将秒数格式化为播放器使用的 mm:ss 文本。 */
export const formatDuration = (seconds: number) => {
    // 未加载或非有限时长统一显示为起点。
    if (!Number.isFinite(seconds) || seconds <= 0) return '00:00';
    // 用整除得到完整分钟数。
    const minutes = Math.floor(seconds / 60);
    // 用取余得到当前分钟内的秒数。
    const remainingSeconds = Math.floor(seconds % 60);
    // 分钟和秒数均补齐两位，避免播放时文本宽度抖动。
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

/** 将文件字节数转为适合界面展示的 MB。 */
export const formatFileSize = (bytes: number) => {
    // 文件尚未加载时显示占位符。
    if (!bytes) return '-';
    // 按 1024 进制从字节转换为 MB。
    const megabytes = bytes / 1024 / 1024;
    // 较大文件保留一位小数，较小文件保留两位。
    return `${megabytes.toFixed(megabytes >= 10 ? 1 : 2)} MB`;
};

/** 将数值声道数转为更易读的中文文本。 */
export const formatChannels = (channels: number) => {
    // 解码尚未完成时显示占位符。
    if (!channels) return '-';
    // 标准单声道使用专用文本。
    if (channels === 1) return '单声道';
    // 标准立体声使用专用文本。
    if (channels === 2) return '双声道';
    // 多声道文件直接展示实际数量。
    return `${channels} 声道`;
};
