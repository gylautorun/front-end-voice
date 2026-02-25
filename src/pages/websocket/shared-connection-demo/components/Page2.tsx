import { useState, useEffect } from 'react';
import { Typography, Input, Button, Card, Space, List, Avatar, message } from 'antd';
import { Link } from 'react-router-dom';
import useSharedWebSocket from '../utils/useSharedWebSocket';
import NavigationCard from './navigation-card';
import style from './page2.module.scss';

const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;

export default function Page2() {
  const { send, isConnected, isMaster, tabId, lastMessage } = useSharedWebSocket();
  const [messageText, setMessageText] = useState('');
  const [messageList, setMessageList] = useState<Array<{ id: string; content: string; from: string; timestamp: string }>>([]);

  const handleSendMessage = () => {
    if (!messageText.trim()) {
      message.warning('请输入消息内容');
      return;
    }

    const messageData = {
      type: 'chat',
      content: messageText,
      from: isMaster ? `Master (${tabId.substring(tabId.length - 6)})` : `Slave (${tabId.substring(tabId.length - 6)})`,
      timestamp: new Date().toLocaleTimeString()
    };

    send(messageData);
    setMessageText('');

    // 添加到本地消息列表
    setMessageList(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        ...messageData
      }
    ]);
  };



  // 当收到新消息时更新列表
  useEffect(() => {
    if (lastMessage && lastMessage.type === 'WEBSOCKET_MESSAGE' && lastMessage.data) {
      const data = lastMessage.data;
      if (data.type === 'chat') {
        setMessageList(prev => [
          ...prev,
          {
            id: Date.now().toString(),
            content: data.content,
            from: data.from,
            timestamp: data.timestamp
          }
        ]);
      }
    }
  }, [lastMessage]);

  return (
    <div className={style.container}>
      <NavigationCard currentPage="page2" />

      <Title level={1}>页面 2 - 消息发送测试</Title>
      
      <Card className={style.card}>
        <Title level={3}>发送消息</Title>
        <Paragraph>输入消息内容并发送，所有页面都会收到此消息：</Paragraph>
        <Space vertical size={16} style={{ width: '100%' }}>
          <TextArea
            value={messageText}
            onChange={e => setMessageText(e.target.value)}
            placeholder="请输入消息内容..."
            rows={4}
            disabled={!isConnected}
          />
          <Button 
            type="primary" 
            onClick={handleSendMessage} 
            disabled={!isConnected || !messageText.trim()}
            size="large"
          >
            发送消息
          </Button>
          <Text type="secondary">
            当前角色：{isMaster ? '主标签页' : '从标签页'} | 
            连接状态：{isConnected ? '已连接' : '未连接'}
          </Text>
        </Space>
      </Card>

      <Card className={style.card}>
        <Title level={3}>消息历史</Title>
        <List
          dataSource={messageList}
          renderItem={item => (
            <List.Item>
              <List.Item.Meta
                avatar={<Avatar>{item.from.charAt(0)}</Avatar>}
                title={
                  <Space size={8}>
                    <Text strong>{item.from}</Text>
                    <Text type="secondary">{item.timestamp}</Text>
                  </Space>
                }
                description={item.content}
              />
            </List.Item>
          )}
          locale={{ emptyText: '暂无消息，请发送第一条消息' }}
        />
      </Card>


    </div>
  );
}
