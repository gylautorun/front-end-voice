import {useState} from 'react';
import {BgColorsOutlined, FunctionOutlined} from '@ant-design/icons';
import {Segmented} from 'antd';
import {useMusicAudio} from '../shared/music-audio-context';
import {MusicAudioProvider} from '../shared/music-audio-provider';
import {MusicLabShell} from '../shared/music-lab-shell';
import {VisualSettings} from '../shared/visual-settings';
import {ShaderMode, ShaderStage} from './shader-stage';

/**
 * Shader 路由内部内容。
 * 页面管理 Shader 模式和用户参数，具体 uniform 更新在 ShaderStage 内完成。
 */
const ShaderLabContent = () => {
    // 获取共享分析节点引用，ShaderStage 每帧把其中的频段能量写入 uniform。
    const {analyserRef} = useMusicAudio();
    // 初始使用万花筒效果，用户可以切换为流体色场。
    const [mode, setMode] = useState<ShaderMode>('kaleidoscope');
    // 控制 uTime 的累计速度，改变图案整体运动节奏。
    const [animationSpeed, setAnimationSpeed] = useState(1);
    // 控制写入 uBass/uMid/uHigh/uOverall 的能量倍率。
    const [responseGain, setResponseGain] = useState(1);

    /** 恢复 Shader 的标准时间速度和音频响应。 */
    const resetVisualSettings = () => {
        // 让 uTime 回到每秒增加一秒的标准倍率。
        setAnimationSpeed(1);
        // 让频段 uniform 使用分析器返回的原始映射强度。
        setResponseGain(1);
    };

    // 模式选择器与视觉参数按钮共同占用页面工具栏的控制区域。
    const modeControl = (
        <>
            <Segmented
                // 当前模式决定片段着色器中的 uMode 分支。
                value={mode}
                // 两个选项与 ShaderMode 联合类型保持一致。
                options={[
                    {label: <span><FunctionOutlined /> 万花筒</span>, value: 'kaleidoscope'},
                    {label: <span><BgColorsOutlined /> 流体色场</span>, value: 'fluid'},
                ]}
                // 收窄 Ant Design 的返回值并更新 Shader 模式。
                onChange={value => setMode(value as ShaderMode)}
            />
            <VisualSettings
                // Shader 可单独调整时间倍率和频段响应，便于控制观感而不修改 GLSL。
                parameters={[
                    {
                        key: 'animation-speed',
                        label: '动画速度',
                        min: 0.25,
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
        // 外壳处理播放器，ShaderStage 只关心 WebGL 渲染和音频 uniform。
        <MusicLabShell eyebrow="GLSL FRAGMENT SHADER" title="迷幻音频图形实验室" modeControl={modeControl}>
            <ShaderStage
                // 将分析节点、时间倍率、模式和响应倍率全部作为受控属性传入。
                analyserRef={analyserRef}
                animationSpeed={animationSpeed}
                mode={mode}
                responseGain={responseGain}
            />
        </MusicLabShell>
    );
};

/**
 * 提供独立播放器与 WebGL 生命周期的 Shader 路由。
 *
 * @returns 包含共享音频 Provider 的 Shader 实验页面。
 */
export default function ShaderLabPage() {
    return (
        // Provider 让页面获得独立的 AudioContext，避免和其他音乐路由互相占用。
        <MusicAudioProvider>
            <ShaderLabContent />
        </MusicAudioProvider>
    );
}
