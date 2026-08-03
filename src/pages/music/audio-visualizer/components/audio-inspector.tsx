import {Slider} from 'antd';
import {memo} from 'react';
import {formatChannels, formatDuration, formatFileSize} from '../formatters';
import {FREQUENCY_BANDS} from '../frequency-bands';
import style from '../style.module.scss';
import {AudioMetadata} from '../use-audio-analyser';

/** 音频分析面板的显示数据和灵敏度控制。 */
interface AudioInspectorProps {
    /** 播放器当前识别的总时长。 */
    duration: number;
    /** 解码后的音频技术信息。 */
    metadata: AudioMetadata | null;
    /** 用户调整灵敏度后的回调。 */
    onSensitivityChange: (sensitivity: number) => void;
    /** 当前可视化幅度倍率。 */
    sensitivity: number;
}

/** 展示音频元数据、可视化灵敏度和七频段图例。 */
export const AudioInspector = memo(function AudioInspector({
    duration,
    metadata,
    onSensitivityChange,
    sensitivity,
}: AudioInspectorProps) {
    return (
        <aside className={style.inspector}>
            <div className={style.inspectorHeader}>
                <div>
                    <span className={style.sectionLabel}>ANALYSIS</span>
                    <h2>音频信息</h2>
                </div>
                <span className={style.formatBadge}>{metadata?.type || '--'}</span>
            </div>

            <dl className={style.metadataList}>
                <div>
                    <dt>时长</dt>
                    <dd>{formatDuration(metadata?.duration || duration)}</dd>
                </div>
                <div>
                    <dt>采样率</dt>
                    <dd>{metadata?.sampleRate ? `${metadata.sampleRate.toLocaleString()} Hz` : '-'}</dd>
                </div>
                <div>
                    <dt>声道</dt>
                    <dd>{formatChannels(metadata?.channels || 0)}</dd>
                </div>
                <div>
                    <dt>码率（估算）</dt>
                    <dd>{metadata?.bitRate ? `${metadata.bitRate} kbps` : '-'}</dd>
                </div>
                <div>
                    <dt>文件大小</dt>
                    <dd>{formatFileSize(metadata?.size || 0)}</dd>
                </div>
            </dl>

            {/* 只放大视觉振幅，不修改实际音频输出。 */}
            <div className={style.sensitivityControl}>
                <div className={style.controlLabel}>
                    <span>可视化灵敏度</span>
                    <strong>{Math.round(sensitivity * 100)}%</strong>
                </div>
                <Slider
                    min={0.6}
                    max={1.6}
                    step={0.05}
                    value={sensitivity}
                    tooltip={{formatter: value => `${Math.round((value || 0) * 100)}%`}}
                    onChange={onSensitivityChange}
                />
            </div>

            {/* 七段频谱与 Hz 范围图例，颜色与 Canvas 完全共用。 */}
            <div className={style.bandLegend} aria-label="频段图例">
                {FREQUENCY_BANDS.map(band => (
                    <span key={band.label}>
                        <i style={{backgroundColor: band.color}} />
                        <b>{band.label}</b>
                        <small>{band.range}</small>
                    </span>
                ))}
            </div>
        </aside>
    );
});
