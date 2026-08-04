import {useCallback, useState} from 'react';
import {PlayCircleOutlined, StopOutlined} from '@ant-design/icons';
import {Button, Form, InputNumber, Segmented, Slider} from 'antd';
import {useAudio} from './use-audio';
import type {AudioSoundSettings, WaveformType} from './types';
import {WaveformPreview} from './waveform-preview';
import style from './style.module.scss';

const MIN_FREQUENCY = 20;
const MAX_FREQUENCY = 20000;
const FREQUENCY_SCALE_STEPS = 1000;

const WAVEFORM_OPTIONS = [
  {label: '正弦', value: 'sine'},
  {label: '方波', value: 'square'},
  {label: '锯齿', value: 'sawtooth'},
  {label: '三角', value: 'triangle'},
];

const GAIN_CURVE_OPTIONS = [
  {label: '线性淡出', value: 'linearRampToValueAtTime'},
  {label: '指数淡出', value: 'exponentialRampToValueAtTime'},
];

/** 把实际 Hz 转换为对数滑杆位置，使低频区仍可精确调节。 */
function frequencyToPosition(frequency: number): number {
  const normalizedFrequency = Math.min(MAX_FREQUENCY, Math.max(MIN_FREQUENCY, frequency));
  return Math.log(normalizedFrequency / MIN_FREQUENCY)
    / Math.log(MAX_FREQUENCY / MIN_FREQUENCY)
    * FREQUENCY_SCALE_STEPS;
}

/** 把对数滑杆位置还原为实际 Hz。 */
function positionToFrequency(position: number): number {
  const ratio = position / FREQUENCY_SCALE_STEPS;
  return Math.round(MIN_FREQUENCY * (MAX_FREQUENCY / MIN_FREQUENCY) ** ratio);
}

interface FrequencyControlProps {
  value?: number;
  onChange?: (value: number) => void;
}

/** 对数滑杆负责快速调节，数字输入负责精确设置。 */
function FrequencyControl({value = 196, onChange}: FrequencyControlProps) {
  return (
    <div className={style.frequencyControl}>
      <Slider
        min={0}
        max={FREQUENCY_SCALE_STEPS}
        step={1}
        value={frequencyToPosition(value)}
        tooltip={{formatter: position => `${positionToFrequency(position || 0)} Hz`}}
        onChange={position => onChange?.(positionToFrequency(position))}
      />
      <InputNumber
        min={MIN_FREQUENCY}
        max={MAX_FREQUENCY}
        step={1}
        value={value}
        addonAfter="Hz"
        onChange={frequency => onChange?.(frequency || MIN_FREQUENCY)}
      />
    </div>
  );
}

/** 可视化编辑 OscillatorNode，并通过 Web Audio API 实时合成声音。 */
export function AudioSound() {
  const {start, status, stop, update} = useAudio();
  const [form] = Form.useForm<AudioSoundSettings>();
  const [error, setError] = useState('');
  const gain = Form.useWatch('gain', form) ?? 0.18;
  const frequency = Form.useWatch('frequency', form) ?? 196;
  const waveform = (Form.useWatch('type', form) ?? 'sine') as WaveformType;
  const playing = status === 'playing';
  const transitioning = status === 'starting' || status === 'stopping';

  /** 开始时创建振荡器，播放时提交则执行平滑停止。 */
  const handleSubmit = async (settings: AudioSoundSettings): Promise<void> => {
    setError('');
    try {
      if (playing) stop(settings);
      else await start(settings);
    } catch (startError) {
      console.error('Failed to start oscillator:', startError);
      setError('音频合成器启动失败，请检查浏览器的音频播放权限');
    }
  };

  /** 仅在发声期间把表单变化平滑同步到 Web Audio 节点。 */
  const handleValuesChange = useCallback((_: Partial<AudioSoundSettings>, values: AudioSoundSettings) => {
    if (playing) update(values);
  }, [playing, update]);

  const statusLabel = status === 'playing'
    ? '正在发声'
    : status === 'starting'
      ? '正在启动'
      : status === 'stopping'
        ? '正在淡出'
        : '已停止';

  return (
    <section className={style.audioSound}>
      <header className={style.header}>
        <div>
          <h2>振荡器</h2>
          <span className={style.apiName}>OscillatorNode</span>
        </div>
        <span className={`${style.status} ${playing ? style.statusActive : ''}`}>
          <i aria-hidden="true" />
          {statusLabel}
        </span>
      </header>

      <WaveformPreview
        frequency={frequency}
        gain={gain}
        playing={playing}
        type={waveform}
      />

      <Form<AudioSoundSettings>
        form={form}
        name="synthesis"
        layout="vertical"
        initialValues={{
          gainChangeType: 'linearRampToValueAtTime',
          gain: 0.18,
          type: 'sine',
          frequency: 196,
        }}
        onFinish={handleSubmit}
        onValuesChange={handleValuesChange}
        autoComplete="off"
      >
        <div className={style.controlGrid}>
          <Form.Item<AudioSoundSettings> label="基础波形" name="type">
            <Segmented block options={WAVEFORM_OPTIONS} />
          </Form.Item>

          <Form.Item<AudioSoundSettings> label="停止曲线" name="gainChangeType">
            <Segmented block options={GAIN_CURVE_OPTIONS} />
          </Form.Item>

          <Form.Item<AudioSoundSettings>
            label={<span className={style.fieldLabel}>音量 <output>{Math.round(gain * 100)}%</output></span>}
            name="gain"
          >
            <Slider min={0} max={1} step={0.01} tooltip={{formatter: value => `${Math.round((value || 0) * 100)}%`}} />
          </Form.Item>

          <Form.Item<AudioSoundSettings>
            label={<span className={style.fieldLabel}>频率 <output>{Math.round(frequency)} Hz</output></span>}
            name="frequency"
          >
            <FrequencyControl />
          </Form.Item>
        </div>

        <div className={style.actionBar}>
          <div className={style.currentValues}>
            <span>{Math.round(frequency)} Hz</span>
            <span>{Math.round(gain * 100)}%</span>
            <span>{WAVEFORM_OPTIONS.find(option => option.value === waveform)?.label}</span>
          </div>
          <Button
            type="primary"
            danger={playing}
            htmlType="submit"
            disabled={transitioning}
            loading={transitioning}
            icon={playing ? <StopOutlined /> : <PlayCircleOutlined />}
          >
            {playing ? '停止发声' : '开始发声'}
          </Button>
        </div>
      </Form>

      {error && <div className={style.error} role="alert">{error}</div>}
    </section>
  );
}
