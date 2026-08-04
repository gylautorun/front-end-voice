import {useState} from 'react';
import {DotChartOutlined, GlobalOutlined, RadarChartOutlined, StockOutlined} from '@ant-design/icons';
import {Segmented} from 'antd';
import {useMusicAudio} from '../shared/music-audio-context';
import {MusicAudioProvider} from '../shared/music-audio-provider';
import {MusicLabShell} from '../shared/music-lab-shell';
import {VisualSettings} from '../shared/visual-settings';
import {ThreeAudioScene} from './three-audio-scene';
import {ThreeSceneMode} from './scene-builders';

/**
 * 粒子与 3D 路由的可视化内容。
 * 页面保存场景类型和视觉倍率，WebGL 资源由 ThreeAudioScene 管理。
 */
const Particle3DContent = () => {
    // 共享分析节点由音频 Provider 创建，所有 3D 模式读取同一份实时数据。
    const {analyserRef} = useMusicAudio();
    // 初始使用粒子云；改变模式后 ThreeAudioScene 会释放旧模式 GPU 资源。
    const [mode, setMode] = useState<ThreeSceneMode>('particles');
    // 控制 Three.js 累计时间以及依赖 delta 的位移速度。
    const [animationSpeed, setAnimationSpeed] = useState(1);
    // 控制频段能量、灯光、Bloom 和几何体形变幅度。
    const [responseGain, setResponseGain] = useState(1);

    /** 将运动速度和音频响应恢复到 1x。 */
    const resetVisualSettings = () => {
        // 恢复 Three.js 场景的标准运动速度。
        setAnimationSpeed(1);
        // 恢复音频驱动几何体与灯光的标准强度。
        setResponseGain(1);
    };

    // 将场景选择和视觉参数合并到同一个页面工具栏插槽。
    const modeControl = (
        <>
            <Segmented
                // 受控值保证页面状态与当前 Three.js 场景一致。
                value={mode}
                // 选项值必须与 ThreeSceneMode 中的四种场景保持同步。
                options={[
                    {label: <span><DotChartOutlined /> 粒子</span>, value: 'particles'},
                    {label: <span><StockOutlined /> 地形</span>, value: 'terrain'},
                    {label: <span><GlobalOutlined /> 变形球</span>, value: 'orb'},
                    {label: <span><RadarChartOutlined /> 星空隧道</span>, value: 'tunnel'},
                ]}
                // 将组件返回值收窄后写入模式状态，触发场景安全切换。
                onChange={value => setMode(value as ThreeSceneMode)}
            />
            <VisualSettings
                // 运动速度和响应强度可独立调节，避免用单一倍率同时放大两种效果。
                parameters={[
                    {
                        key: 'animation-speed',
                        label: '运动速度',
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
        // MusicLabShell 提供音频控制，ThreeAudioScene 在内容区直接挂载 WebGL Canvas。
        <MusicLabShell eyebrow="THREE.JS / WEBGL" title="粒子与 3D 音乐场景" modeControl={modeControl}>
            <ThreeAudioScene
                // 节点引用和视觉参数分别驱动音频数据、时间以及响应强度。
                analyserRef={analyserRef}
                animationSpeed={animationSpeed}
                mode={mode}
                responseGain={responseGain}
            />
        </MusicLabShell>
    );
};

/**
 * 提供独立音频图的 Three.js 路由页面。
 *
 * @returns 拥有独立 Web Audio 生命周期的 3D 音乐页面。
 */
export default function Particle3DPage() {
    return (
        // 路由卸载时 Provider 和 ThreeAudioScene 会分别释放音频与 WebGL 资源。
        <MusicAudioProvider>
            <Particle3DContent />
        </MusicAudioProvider>
    );
}
