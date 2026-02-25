import { useState, useEffect } from 'react';
import { Button, Input, List, Typography } from 'antd';
import { useWebSocketGlobal } from '../context/WebSocketGlobalContext';
import style from '../index.module.scss';

const { Paragraph } = Typography;

export default function ChatRoom() {
  const [messages, setMessages] = useState<string[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  
  const { send, isConnected, readyState, setOnMessage } = useWebSocketGlobal();

  const handleSend = () => {
    if (!inputMessage.trim() || !isConnected) return;
    
    const messageData = {
      content: inputMessage,
      sender: 'user',
      timestamp: new Date().toISOString()
    };
    
    send(messageData);
    setMessages(prev => [...prev, `我: ${inputMessage}`]);
    setInputMessage('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputMessage(e.target.value);
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        let displayMessage = '';
        
        if (data.type === 'chat') {
          if (data.sender === 'user') {
            displayMessage = `我: ${data.content}`;
          } else {
            displayMessage = `${data.sender}: ${data.content}`;
          }
        } else if (data.type === 'welcome') {
          displayMessage = `系统: ${data.message}`;
        } else if (data.type === 'system') {
          displayMessage = `系统: ${data.message}`;
        } else if (data.type === 'echo') {
          displayMessage = `服务器回显: ${data.content}`;
        } else {
          displayMessage = `服务器: ${data.content || event.data}`;
        }
        
        setMessages(prev => [...prev, displayMessage]);
      } catch (error) {
        setMessages(prev => [...prev, `服务器: ${error}`]);
      }
    };
    
    if (setOnMessage) {
      setOnMessage(handleMessage);
    }
    
    return () => {
      if (setOnMessage) {
        setOnMessage(undefined);
      }
    };
  }, [setOnMessage]);

  const sendButtonDisabled = !isConnected || !inputMessage.trim();

  return (
    <div className={style.section}>
      <Typography.Title level={3}>WebSocket 聊天室</Typography.Title>
      <div className={style.status}>
        <Paragraph>连接状态: <span className={isConnected ? style.connected : style.disconnected}>
          {isConnected ? '已连接' : '未连接'}
        </span></Paragraph>
        <Paragraph>Ready State: <span>{readyState}</span></Paragraph>
      </div>
      <div className={style.chatBox}>
        <List
          dataSource={messages}
          renderItem={(msg, index) => (
            <List.Item key={index}>
              {msg}
            </List.Item>
          )}
          locale={{
            emptyText: '暂无消息，开始发送吧！'
          }}
        />
      </div>
      <div className={style.inputGroup}>
        <Input
          value={inputMessage}
          onChange={handleInputChange}
          placeholder="输入消息..."
        />
        <Button
          onClick={handleSend}
          disabled={sendButtonDisabled}
        >
          发送
        </Button>
      </div>
    </div>
  );
}
