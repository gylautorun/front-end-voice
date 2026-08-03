import {memo, RefObject} from 'react';
import {Spin} from 'antd';
import {AudioVisualizer} from '../audio-visualizer';
import style from '../style.module.scss';
import {VISUALIZATION_MODE_LABELS, VisualizationMode} from '../visualizers/types';

/** Canvas 舞台所需的运行状态。 */
interface VisualizerStageProps {
    /** 每帧读取数据的 Web Audio 分析节点。 */
    analyserRef: RefObject<AnalyserNode | null>;
    /** 是否正在解析上传文件。 */
    isParsing: boolean;
    /** 当前是否正在播放。 */
    isPlaying: boolean;
    /** 当前图谱模式。 */
    mode: VisualizationMode;
    /** 可视化幅度倍率。 */
    sensitivity: number;
}

/** 组合 Canvas、模式状态和文件解析遮罩。 */
export const VisualizerStage = memo(function VisualizerStage({
    analyserRef,
    isParsing,
    isPlaying,
    mode,
    sensitivity,
}: VisualizerStageProps) {
    return (
        <div className={style.visualStage}>
            {/* Canvas 组件只处理音频数据读取与图形调度。 */}
            <AudioVisualizer
                analyserRef={analyserRef}
                isPlaying={isPlaying}
                mode={mode}
                sensitivity={sensitivity}
            />
            {/* 左上角标记当前模式与播放状态。 */}
            <div className={style.stageStatus}>
                <span>{VISUALIZATION_MODE_LABELS[mode]}</span>
                <span>{isPlaying ? 'LIVE' : 'IDLE'}</span>
            </div>
            {/* 文件解码期间覆盖 Canvas，明确表示新文件尚未就绪。 */}
            {isParsing && (
                <div className={style.parsingOverlay}>
                    <Spin size="large" />
                </div>
            )}
        </div>
    );
});
