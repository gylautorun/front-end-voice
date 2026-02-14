import { useState, useEffect } from 'react';
import { Card, Form, Input, InputNumber, Switch, Button, Typography, Space, Divider } from 'antd';
import { wsConfigManager, defaultWebSocketConfig } from '../config/wsConfig';
import { useWebSocketGlobal } from '../context/WebSocketGlobalContext';
import style from '../index.module.scss';

const { Title, Text } = Typography;

export default function GlobalConfigControl() {
  const { isConnected, readyState, updateConfig, resetConfig } = useWebSocketGlobal();
  const [form] = Form.useForm();
  const [config, setConfig] = useState(wsConfigManager.getConfig());

  useEffect(() => {
    setConfig(wsConfigManager.getConfig());
    form.setFieldsValue(wsConfigManager.getConfig().options);
  }, []);

  const handleValuesChange = (changedValues: any, allValues: any) => {
    const newOptions = {
      ...config.options,
      ...changedValues
    };
    wsConfigManager.updateOptions(newOptions);
    setConfig(wsConfigManager.getConfig());
  };

  const handleReset = () => {
    resetConfig();
    const defaultConfig = wsConfigManager.getConfig();
    form.setFieldsValue(defaultConfig.options);
    setConfig(defaultConfig);
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    wsConfigManager.updateConfig({ url: newUrl });
    setConfig(wsConfigManager.getConfig());
  };

  const getReadyStateText = (state: number) => {
    switch (state) {
      case 0: return '正在连接';
      case 1: return '已连接';
      case 2: return '正在关闭';
      case 3: return '已关闭';
      default: return '未知';
    }
  };

  return (
    <div className={style.section}>
      <Card>
        <Title level={3}>全局 WebSocket 配置控制</Title>
        <Divider />
        
        <div className={style.status}>
          <Text strong>连接状态：</Text>
          <span className={isConnected ? style.connected : style.disconnected}>
            {isConnected ? '已连接' : '未连接'}
          </span>
          <Text style={{ marginLeft: 16 }}>Ready State：</Text>
          <Text>{getReadyStateText(readyState)} ({readyState})</Text>
        </div>

        <Divider />

        <Form
          form={form}
          layout="vertical"
          onValuesChange={handleValuesChange}
          initialValues={config.options}
        >
          <Form.Item label="WebSocket URL">
            <Input
              value={config.url}
              onChange={handleUrlChange}
              placeholder="输入 WebSocket URL"
            />
          </Form.Item>

          <Form.Item label="数据格式" name="format">
            <Space>
              <Text>format:</Text>
              <Text code>{config.options.format || 'string'}</Text>
            </Space>
          </Form.Item>

          <Form.Item label="自动重连" name="reconnection" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item label="重连尝试次数" name="reconnectionAttempts">
            <InputNumber min={1} max={100} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="初始重连延迟 (ms)" name="reconnectionDelay">
            <InputNumber min={100} max={60000} step={100} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="最大重连延迟 (ms)" name="maxReconnectionDelay">
            <InputNumber min={1000} max={300000} step={1000} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="延迟增长因子" name="reconnectionDelayGrowFactor">
            <InputNumber min={1} max={5} step={0.1} precision={1} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="手动连接" name="connectManually" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>

        <Divider />

        <Space>
          <Button type="primary" onClick={handleReset}>
            重置为默认配置
          </Button>
        </Space>
      </Card>
    </div>
  );
}
