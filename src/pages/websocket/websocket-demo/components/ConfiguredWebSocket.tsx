import { useState } from 'react';
import { Button, Input, Typography } from 'antd';
import { useWebSocketGlobal } from '../context/WebSocketGlobalContext';
import style from '../index.module.scss';

const { Paragraph } = Typography;

export default function ConfiguredWebSocket() {
  const [message, setMessage] = useState('');
  const [receivedMessage, setReceivedMessage] = useState('');
  
  const { send, isConnected, readyState } = useWebSocketGlobal();

  const handleSendJSON = () => {
    if (!message.trim() || !isConnected) return;
    
    const messageData = {
      content: message,
      sender: 'user',
      timestamp: new Date().toISOString()
    };
    
    send(messageData);
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
  };

  const sendButtonDisabled = !isConnected || !message.trim();

  return (
    <div className={style.section}>
      <Typography.Title level={3}>配置化 WebSocket 连接</Typography.Title>
      <div className={style.status}>
        <Paragraph>连接状态: <span className={isConnected ? style.connected : style.disconnected}>
          {isConnected ? '已连接' : '未连接'}
        </span></Paragraph>
        <Paragraph>Ready State: <span>{readyState}</span></Paragraph>
      </div>
      <div className={style.inputGroup}>
        <Input
          value={message}
          onChange={handleMessageChange}
          placeholder="输入消息..."
        />
        <Button 
          onClick={handleSendJSON} 
          disabled={sendButtonDisabled}
        >
          发送 JSON 消息
        </Button>
      </div>
      {receivedMessage && (
        <div className={style.message}>
          <Paragraph>收到消息: <span>{receivedMessage}</span></Paragraph>
        </div>
      )}
    </div>
  );
}
