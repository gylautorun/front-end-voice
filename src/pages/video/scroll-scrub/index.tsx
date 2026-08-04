import {useState} from 'react';
import {Segmented, Slider} from 'antd';
import {useVideoSource} from '../shared/use-video-source';
import {VideoLabShell} from '../shared/video-lab-shell';
import {ScrollVideoStage, ScrubMode} from './scroll-video-stage';
import style from './style.module.scss';

/** Apple 风格滚动逐帧视频页面。 */
export default function ScrollVideoScrubPage() {
    const source = useVideoSource('editorial');
    const [scrubMode, setScrubMode] = useState<ScrubMode>('smooth');
    const [scrollLength, setScrollLength] = useState(3.2);

    const controls = (
        <>
            <Segmented
                value={scrubMode}
                options={[
                    {label: '平滑追帧', value: 'smooth'},
                    {label: '精确追帧', value: 'precise'},
                ]}
                onChange={value => setScrubMode(value as ScrubMode)}
            />
            <label className={style.lengthControl}>
                <span>长度</span>
                <Slider min={2} max={5} step={0.2} value={scrollLength} onChange={setScrollLength} />
            </label>
        </>
    );

    return (
        <VideoLabShell
            source={source}
            eyebrow="SCROLL / FRAME SCRUB"
            title="滚动驱动视频"
            controls={controls}
            allowCamera={false}
        >
            <ScrollVideoStage
                videoRef={source.videoRef}
                sourceKind={source.kind}
                duration={source.duration}
                scrubMode={scrubMode}
                scrollLength={scrollLength}
            />
        </VideoLabShell>
    );
}
