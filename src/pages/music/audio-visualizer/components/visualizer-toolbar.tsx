import {ChangeEvent, memo, useRef} from 'react';
import {
    BarChartOutlined,
    GlobalOutlined,
    LineChartOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import {Button, Segmented} from 'antd';
import {formatFileSize} from '../formatters';
import style from '../style.module.scss';
import {AudioMetadata} from '../use-audio-analyser';
import {VisualizationMode} from '../visualizers/types';

/** 顶部音轨工具栏的参数。 */
interface VisualizerToolbarProps {
    /** 当前文件的解析信息。 */
    metadata: AudioMetadata | null;
    /** 当前选中的可视化模式。 */
    mode: VisualizationMode;
    /** 用户选择本地音频后回传文件。 */
    onFileSelected: (file: File) => void;
    /** 模式切换后回传新的模式值。 */
    onModeChange: (mode: VisualizationMode) => void;
}

/** 展示音轨身份、可视化模式切换和音频文件选择。 */
export const VisualizerToolbar = memo(function VisualizerToolbar({
    metadata,
    mode,
    onFileSelected,
    onModeChange,
}: VisualizerToolbarProps) {
    // 隐藏原生文件框，由样式统一的按钮触发。
    const fileInputRef = useRef<HTMLInputElement>(null);

    /** 将原生文件选择事件收敛为单个 File 回调。 */
    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        // 页面只支持一次分析一个音频，因此读取第一项。
        const file = event.target.files?.[0];
        // 用户取消文件框时不触发加载。
        if (!file) return;
        // 将文件交给页面协调层加载。
        onFileSelected(file);
        // 清空值，使用户之后可以再次选择同一个文件。
        event.target.value = '';
    };

    return (
        <section className={style.toolbar} aria-label="音乐可视化工具栏">
            {/* 当前音轨的名称、格式和大小。 */}
            <div className={style.trackIdentity}>
                <div className={style.trackArtwork} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                </div>
                <div className={style.trackText}>
                    <strong title={metadata?.name}>{metadata?.name || '未选择音频'}</strong>
                    <span>{metadata ? `${metadata.type} · ${formatFileSize(metadata.size)}` : '-'}</span>
                </div>
            </div>

            <div className={style.toolbarActions}>
                {/* 分段控件在三个独立 Canvas 绘制器之间切换。 */}
                <Segmented
                    value={mode}
                    options={[
                        {label: <span><BarChartOutlined /> 频谱柱</span>, value: 'bars'},
                        {label: <span><LineChartOutlined /> 镜像波形</span>, value: 'mirror'},
                        {label: <span><GlobalOutlined /> 球形水滴波纹</span>, value: 'orb'},
                    ]}
                    onChange={value => onModeChange(value as VisualizationMode)}
                />
                {/* 可见按钮转发点击到隐藏的原生文件 input。 */}
                <Button icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>
                    选择音频
                </Button>
                <input
                    ref={fileInputRef}
                    className={style.fileInput}
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
                    onChange={handleFileChange}
                />
            </div>
        </section>
    );
});
