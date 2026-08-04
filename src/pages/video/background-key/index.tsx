import {useState} from 'react';
import {Segmented, Slider} from 'antd';
import {useVideoSource} from '../shared/use-video-source';
import {VideoLabShell} from '../shared/video-lab-shell';
import {BackgroundKeyMode, BackgroundStage, VirtualBackground} from './background-stage';
import style from './style.module.scss';

/** 绿幕色度键和 BodyPix 人像虚拟背景页面。 */
export default function VideoBackgroundKeyPage() {
    const source = useVideoSource('green-screen');
    const [mode, setMode] = useState<BackgroundKeyMode>('chroma');
    const [background, setBackground] = useState<VirtualBackground>('studio');
    const [threshold, setThreshold] = useState(0.22);

    const controls = (
        <>
            <Segmented
                value={mode}
                options={[
                    {label: '绿幕抠像', value: 'chroma'},
                    {label: 'AI 人像', value: 'ai'},
                ]}
                onChange={value => setMode(value as BackgroundKeyMode)}
            />
            <Segmented
                value={background}
                options={[
                    {label: '摄影棚', value: 'studio'},
                    {label: '城市', value: 'city'},
                    {label: '纯色', value: 'solid'},
                ]}
                onChange={value => setBackground(value as VirtualBackground)}
            />
            {mode === 'chroma' && (
                <label className={style.thresholdControl}>
                    <span>容差</span>
                    <Slider min={0.08} max={0.5} step={0.01} value={threshold} onChange={setThreshold} />
                </label>
            )}
        </>
    );

    return (
        <VideoLabShell
            source={source}
            eyebrow="CHROMA KEY / BODYPIX"
            title="视频抠像与虚拟背景"
            controls={controls}
        >
            <BackgroundStage
                videoRef={source.videoRef}
                mode={mode}
                threshold={threshold}
                background={background}
            />
        </VideoLabShell>
    );
}
