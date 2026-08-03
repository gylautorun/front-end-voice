import {
    PauseCircleFilled,
    PlayCircleFilled,
    ReloadOutlined,
    SoundOutlined,
} from '@ant-design/icons';
import {memo} from 'react';
import {Button, Slider, Tooltip} from 'antd';
import {formatDuration} from '../formatters';
import style from '../style.module.scss';

/** 播放器控件接收的受控状态和命令。 */
interface PlayerControlsProps {
    /** 当前播放秒数。 */
    currentTime: number;
    /** 当前音轨总秒数。 */
    duration: number;
    /** 是否已经存在可播放文件。 */
    hasAudio: boolean;
    /** 文件是否仍在解析。 */
    isParsing: boolean;
    /** 音频是否正在播放。 */
    isPlaying: boolean;
    /** 将播放头恢复到起点。 */
    onReset: () => void;
    /** 拖动进度条时修改播放位置。 */
    onSeek: (time: number) => void;
    /** 切换播放和暂停。 */
    onTogglePlayback: () => Promise<void>;
    /** 修改 0-1 的音量。 */
    onVolumeChange: (volume: number) => void;
    /** 当前 0-1 音量。 */
    volume: number;
}

/** 自定义播放、进度和音量控件。 */
export const PlayerControls = memo(function PlayerControls({
    currentTime,
    duration,
    hasAudio,
    isParsing,
    isPlaying,
    onReset,
    onSeek,
    onTogglePlayback,
    onVolumeChange,
    volume,
}: PlayerControlsProps) {
    return (
        <div className={style.playerControls}>
            <div className={style.transportRow}>
                {/* 主播放/暂停命令，文件解码完成前禁用。 */}
                <Tooltip title={isPlaying ? '暂停' : '播放'}>
                    <Button
                        className={style.playButton}
                        type="text"
                        shape="circle"
                        disabled={!hasAudio || isParsing}
                        icon={isPlaying ? <PauseCircleFilled /> : <PlayCircleFilled />}
                        onClick={() => void onTogglePlayback()}
                    />
                </Tooltip>
                {/* 将播放头快速返回 0 秒。 */}
                <Tooltip title="回到开头">
                    <Button
                        type="text"
                        shape="circle"
                        disabled={!hasAudio}
                        icon={<ReloadOutlined />}
                        onClick={onReset}
                    />
                </Tooltip>
                <span className={style.time}>{formatDuration(currentTime)}</span>
                {/* 可拖动的播放进度，上限随文件时长变化。 */}
                <Slider
                    className={style.progress}
                    min={0}
                    max={duration || 1}
                    step={0.01}
                    value={Math.min(currentTime, duration || 1)}
                    disabled={!hasAudio}
                    tooltip={{formatter: value => formatDuration(value || 0)}}
                    onChange={onSeek}
                />
                <span className={style.time}>{formatDuration(duration)}</span>
                <SoundOutlined className={style.soundIcon} />
                {/* 音量仅修改媒体输出，不改变图形灵敏度。 */}
                <Slider
                    className={style.volume}
                    min={0}
                    max={1}
                    step={0.01}
                    value={volume}
                    tooltip={{formatter: value => `${Math.round((value || 0) * 100)}%`}}
                    onChange={onVolumeChange}
                />
            </div>
        </div>
    );
});
