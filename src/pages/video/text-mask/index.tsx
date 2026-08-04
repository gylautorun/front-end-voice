import {useState} from 'react';
import {FontSizeOutlined} from '@ant-design/icons';
import {Input, Slider, Switch} from 'antd';
import {useVideoSource} from '../shared/use-video-source';
import {VideoLabShell} from '../shared/video-lab-shell';
import {TextMaskStage} from './text-mask-stage';
import style from './style.module.scss';

/** 视频镂空文字页面。 */
export default function VideoTextMaskPage() {
    const source = useVideoSource('editorial');
    const [text, setText] = useState('VIDEO LAB');
    const [textScale, setTextScale] = useState(1);
    const [showOutline, setShowOutline] = useState(true);

    const controls = (
        <>
            <Input
                className={style.textInput}
                prefix={<FontSizeOutlined />}
                value={text}
                maxLength={16}
                aria-label="视频遮罩文字"
                onChange={event => setText(event.target.value)}
            />
            <label className={style.sliderControl}>
                <span>字号</span>
                <Slider
                    aria-label="遮罩文字字号"
                    min={0.65}
                    max={1.35}
                    step={0.05}
                    value={textScale}
                    onChange={setTextScale}
                />
            </label>
            <label className={style.switchControl}>
                <span>描边</span>
                <Switch size="small" checked={showOutline} onChange={setShowOutline} />
            </label>
        </>
    );

    return (
        <VideoLabShell
            source={source}
            eyebrow="MASK / TYPOGRAPHY"
            title="文字视频遮罩"
            controls={controls}
        >
            <TextMaskStage
                videoRef={source.videoRef}
                text={text}
                textScale={textScale}
                showOutline={showOutline}
            />
        </VideoLabShell>
    );
}
