import { useState } from 'react';
import { Button, Input, Typography } from 'antd';
import { useWebSocketGlobal } from '../context/WebSocketGlobalContext';
import style from '../index.module.scss';

const { Paragraph } = Typography;

export default function ManualWebSocket() {
  const { connect, disconnect, isConnected, send } = useWebSocketGlobal();

  const handleConnect = () => {
    connect();
  };

  const handleDisconnect = () => {
    disconnect();
  };

  const handleSend = () => {
    if (!isConnected) return;
    send('Hello from manual connection!');
  };

  const connectDisabled = isConnected;
  const disconnectDisabled = !isConnected;
  const sendDisabled = !isConnected;

  return (
    <div className={style.section}>
      <Typography.Title level={3}>手动连接控制</Typography.Title>
      <Typography.Paragraph>
        使用全局 WebSocket 连接，通过全局配置控制面板管理连接参数。
      </Typography.Paragraph>
      <div className={style.status}>
        <Paragraph>连接状态: <span className={isConnected ? style.connected : style.disconnected}>
          {isConnected ? '已连接' : '未连接'}
        </span></Paragraph>
      </div>
      <div className={style.inputGroup}>
        <Button 
          onClick={handleConnect} 
          disabled={connectDisabled}
        >
          连接
        </Button>
        <Button 
          onClick={handleDisconnect} 
          disabled={disconnectDisabled}
        >
          断开
        </Button>
      </div>
      <Button 
        onClick={handleSend} 
        disabled={sendDisabled}
      >
        发送消息
      </Button>
    </div>
  );
}
