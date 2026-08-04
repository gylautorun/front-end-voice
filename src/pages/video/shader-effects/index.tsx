import {useState} from 'react';
import {Segmented, Slider} from 'antd';
import {useVideoSource} from '../shared/use-video-source';
import {VideoLabShell} from '../shared/video-lab-shell';
import {VideoShaderMode, VideoShaderStage} from './video-shader-stage';
import style from './style.module.scss';

/** WebGL 视频水波、扭曲、液化、色差和扩散波纹页面。 */
export default function VideoShaderEffectsPage() {
    const source = useVideoSource('editorial');
    const [mode, setMode] = useState<VideoShaderMode>('water');
    const [intensity, setIntensity] = useState(1);
    const [speed, setSpeed] = useState(1);

    const controls = (
        <>
            <Segmented
                value={mode}
                options={[
                    {label: '水波', value: 'water'},
                    {label: '扭曲', value: 'distortion'},
                    {label: '液化', value: 'liquid'},
                    {label: '色差', value: 'chromatic'},
                    {label: '波纹', value: 'ripple'},
                ]}
                onChange={value => setMode(value as VideoShaderMode)}
            />
            <label className={style.sliderControl}>
                <span>强度</span>
                <Slider min={0.2} max={2} step={0.05} value={intensity} onChange={setIntensity} />
            </label>
            <label className={style.sliderControl}>
                <span>速度</span>
                <Slider min={0.2} max={2} step={0.05} value={speed} onChange={setSpeed} />
            </label>
        </>
    );

    return (
        <VideoLabShell
            source={source}
            eyebrow="WEBGL / FRAGMENT SHADER"
            title="视频 Shader 实验室"
            controls={controls}
        >
            <VideoShaderStage
                videoRef={source.videoRef}
                mode={mode}
                intensity={intensity}
                speed={speed}
            />
        </VideoLabShell>
    );
}
