import {useState} from 'react';
import {AimOutlined, BarChartOutlined, LineChartOutlined} from '@ant-design/icons';
import {Segmented} from 'antd';
import {useMusicAudio} from '../shared/music-audio-context';
import {MusicAudioProvider} from '../shared/music-audio-provider';
import {MusicLabShell} from '../shared/music-lab-shell';
import {VisualSettings} from '../shared/visual-settings';
import {SpectrumCanvas, SpectrumMode} from './spectrum-canvas';

/**
 * 经典频谱页内部内容，需要读取上层音频 Provider。
 * 该组件只管理模式和视觉参数，音频生命周期统一交给 Provider。
 */
const SpectrumPageContent = () => {
    // 获取当前音轨连接的 AnalyserNode 引用，Canvas 每帧从中读取频域和时域数据。
    const {analyserRef} = useMusicAudio();
    // 默认展示上下镜像柱，切换模式时只重建对应的 Canvas 绘制循环。
    const [mode, setMode] = useState<SpectrumMode>('mirror-bars');
    // 动画速度控制视觉时间推进倍率；1x 对应低/中/高约 8.38/6.61/5.46 秒一轮。
    const [animationSpeed, setAnimationSpeed] = useState(1);
    // 音频响应控制能量映射倍率；1x 保留原始映射，放大后柱高和波形振幅更明显。
    const [responseGain, setResponseGain] = useState(1);

    /** 将两个可调参数同时恢复到设计基准值。 */
    const resetVisualSettings = () => {
        // 恢复标准时间倍率。
        setAnimationSpeed(1);
        // 恢复原始音频响应倍率。
        setResponseGain(1);
    };

    // 工具栏由模式选择器和参数按钮组成，统一传入页面外壳的 modeControl 插槽。
    const modeControl = (
        <>
            <Segmented
                // 当前 mode 决定哪一个选项高亮。
                value={mode}
                // 每个选项值与 SpectrumMode 联合类型一一对应。
                options={[
                    {label: <span><BarChartOutlined /> 镜像频谱</span>, value: 'mirror-bars'},
                    {label: <span><AimOutlined /> 环形黑胶</span>, value: 'radial'},
                    {label: <span><LineChartOutlined /> 示波器</span>, value: 'oscilloscope'},
                ]}
                // Ant Design 返回 string | number，这里收窄为已声明的模式类型。
                onChange={value => setMode(value as SpectrumMode)}
            />
            <VisualSettings
                // 经典频谱允许分别调节时间推进速度和音频振幅映射。
                parameters={[
                    {
                        key: 'animation-speed',
                        label: '动画速度',
                        min: 0.35,
                        max: 2,
                        step: 0.05,
                        value: animationSpeed,
                        onChange: setAnimationSpeed,
                    },
                    {
                        key: 'response-gain',
                        label: '音频响应',
                        min: 0.5,
                        max: 2.2,
                        step: 0.05,
                        value: responseGain,
                        onChange: setResponseGain,
                    },
                ]}
                onReset={resetVisualSettings}
            />
        </>
    );

    return (
        // 页面外壳负责音轨工具栏和布局，SpectrumCanvas 只负责逐帧绘图。
        <MusicLabShell eyebrow="CANVAS 2D" title="经典音乐频谱" modeControl={modeControl}>
            <SpectrumCanvas
                // 传递 ref 而非 AnalyserNode 值，节点变化后动画循环无需重新挂载。
                analyserRef={analyserRef}
                // 速度与响应参数在 Canvas 内部通过 ref 实时读取。
                animationSpeed={animationSpeed}
                mode={mode}
                responseGain={responseGain}
            />
        </MusicLabShell>
    );
};

/**
 * 提供独立音频生命周期的经典频谱路由。
 *
 * @returns 包裹 MusicAudioProvider 的经典频谱页面。
 */
export default function SpectrumPage() {
    return (
        // Provider 负责默认音频、上传音频和 AnalyserNode 的创建与释放。
        <MusicAudioProvider>
            <SpectrumPageContent />
        </MusicAudioProvider>
    );
}
