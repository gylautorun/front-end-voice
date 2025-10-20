import {Button, Form, Select, Slider} from 'antd';
import {useAudio} from './use-audio';
import style from './style.module.scss';

export type FieldType = {
  gainChangeType: 'linearRampToValueAtTime' | 'exponentialRampToValueAtTime';
  gain: number;
  type: 'sine' | 'square' | 'sawtooth' | 'triangle';
  frequency: number;
};
export function AudioSound() {
  const {start, stop, started} = useAudio();
  const onFinish = (values: FieldType) => {
    if (started) {
      stop(values);
    }
    else {
      start(values);
    }
  };
  return (
    <div className={style.audioSound}>
      <Form
        name="synthesis"
        labelCol={{span: 4}}
        wrapperCol={{span: 16}}
        initialValues={{
          gainChangeType: 'linearRampToValueAtTime',
          gain: 0.5,
          type: 'sine',
          frequency: 196,
        }}
        onFinish={onFinish}
        autoComplete="off"
        style={{minWidth: '100%'}}
      >
        <Form.Item<FieldType>
          label={'音量'}
          name="gain"
        >
          <Slider
            min={0}
            max={1}
            step={0.1}
          />
        </Form.Item>
        <Form.Item<FieldType>
          label={'音量变化曲线'}
          name="gainChangeType"
        >
          <Select
            options={[{
              value: 'linearRampToValueAtTime',
              label: '线性',
            }, {
              value: 'exponentialRampToValueAtTime',
              label: '指数',
            }]}
          />
        </Form.Item>
        <Form.Item<FieldType>
          label={'波形'}
          name="type"
        >
          <Select
            onChange={(value) => {
              // setLang(value);
            }}
            options={['sine', 'square', 'sawtooth', 'triangle'].map(item => ({
              value: item,
              label: item,
            }))}
          />
        </Form.Item>
        <Form.Item<FieldType>
          label={'频率(Hz)'}
          name="frequency"
        >
          <Slider
            min={1}
            max={20000}
            step={1}
          />
        </Form.Item>
        

        <Form.Item wrapperCol={{ offset: 8, span: 16 }}>
          <Button type="primary" htmlType="submit">
            {started ? '停止' : '开始'}
          </Button>
        </Form.Item>
      </Form>
    </div>
  )
}

