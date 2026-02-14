import { useState } from 'react';
import { Button, Input, Typography } from 'antd';
import { useWebSocketGlobal } from '../context/WebSocketGlobalContext';
import style from '../index.module.scss';

const { Paragraph } = Typography;

export default function ContextChildComponent() {
  const { send, isConnected } = useWebSocketGlobal();
  const [message, setMessage] = useState('');

  const handleSend = () => {
    if (!message.trim() || !isConnected) return;
    send(`Hello from child: ${message}`);
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
  };

  const sendButtonDisabled = !isConnected || !message.trim();

  return (
    <div className={style.childComponent}>
      <Typography.Title level={4}>子组件</Typography.Title>
      <Paragraph>连接状态: <span className={isConnected ? style.connected : style.disconnected}>
        {isConnected ? '已连接' : '未连接'}
      </span></Paragraph>
      <div className={style.inputGroup}>
        <Input
          value={message}
          onChange={handleMessageChange}
          placeholder="输入消息..."
        />
        <Button 
          onClick={handleSend} 
          disabled={sendButtonDisabled}
        >
          从子组件发送
        </Button>
      </div>
    </div>
  );
}
