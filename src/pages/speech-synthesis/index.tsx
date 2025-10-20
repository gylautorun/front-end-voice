import {useState, useEffect, useRef, useMemo, useCallback} from 'react'
import {Button, Form, Input, Select, Slider} from 'antd';
import {useSpeechSynthesis} from './use-speech-synthesis';
import style from './style.module.scss';

export type FieldType = {
    text: string;
    lang: string;
    volume: number;
    rate: number;
    pitch: number;
};
export function SpeechSynthesis() {
  const {speak, stop, reading, langList} = useSpeechSynthesis();
  const [lang, setLang] = useState(langList[0].name);
  const langOption = useMemo(() => {
    return langList.find(item => item.name === lang);
  }, [lang, langList]);
  const onFinish = (values: FieldType) => {
    if (reading) {
      stop();
    }
    else {
      const data = {
        ...values,
        lang: langOption?.lang || values.lang,
      };
      speak(data);
      console.log('Success:', data);
    }
  };
  return (
    <div className={style.speechSynthesis}>
      <Form
        name="synthesis"
        labelCol={{span: 4}}
        wrapperCol={{span: 16}}
        initialValues={{
          lang: 'zh-CN',
          volume: 1,
          pitch: 1,
          rate: 1,
          text: '大扎好，我是渣渣辉。'
        }}
        onFinish={onFinish}
        autoComplete="off"
        style={{minWidth: '100%'}}
      >
        <Form.Item<FieldType>
          label={'文字'}
          name="text"
        >
          <Input.TextArea
            autoSize={{minRows: 3}}
          />
        </Form.Item>

        <Form.Item<FieldType>
          label={'选择语言'}
          name="lang"
        >
          <Select
            onChange={(value) => {
              setLang(value);
            }}
            options={langList.map(item => ({
              ...item,
              value: item.name,
              label: `${item.lang} - ${item.name}`,
            }))}
          />
        </Form.Item>

        <Form.Item<FieldType>
          label={'声音'}
        >
          {langOption?.voiceURI}
        </Form.Item>

        <Form.Item<FieldType>
          label={'音量'}
          name="volume"
        >
          <Slider
            min={0}
            max={1}
            step={0.1}
          />
        </Form.Item>
        <Form.Item<FieldType>
          label={'语速'}
          name="rate"
        >
          <Slider
            min={0}
            max={5}
            step={0.5}
          />
        </Form.Item>
        <Form.Item<FieldType>
          label={'音调'}
          name="pitch"
        >
          <Slider
            min={0}
            max={2}
            step={0.2}
          />
        </Form.Item>

        <Form.Item wrapperCol={{ offset: 8, span: 16 }}>
          <Button type="primary" htmlType="submit">
            {reading ? '停止' : '朗读'}
          </Button>
        </Form.Item>
      </Form>
    </div>
  )
}

export default SpeechSynthesis;
