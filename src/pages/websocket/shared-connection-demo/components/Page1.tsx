import { Typography, Button, Card, Space } from 'antd';
import { Link } from 'react-router-dom';
import useSharedWebSocket from '../utils/useSharedWebSocket';
import style from './Page1.module.scss';

const { Title, Paragraph, Text } = Typography;

export default function Page1() {
  const { send, isConnected, readyState, isMaster, tabId, connectionState } = useSharedWebSocket();

  const handleSendMessage = () => {
    send({
      type: 'greeting',
      content: `Hello from ${isMaster ? 'Master' : 'Slave'} tab ${tabId.substring(tabId.length - 6)}`,
      timestamp: new Date().toISOString()
    });
  };

  const getReadyStateText = (state: number) => {
    switch (state) {
      case 0: return 'CONNECTING';
      case 1: return 'OPEN';
      case 2: return 'CLOSING';
      case 3: return 'CLOSED';
      default: return 'UNKNOWN';
    }
  };

  return (
    <div className={style.container}>
      <Title level={1}>页面 1 - 基本演示</Title>
      
      <Card className={style.card}>
        <Title level={3}>连接状态</Title>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div className={style.statusItem}>
            <Text strong>连接状态：</Text>
            <Text className={isConnected ? style.connected : style.disconnected}>
              {isConnected ? '已连接' : '未连接'}
            </Text>
          </div>
          
          <div className={style.statusItem}>
            <Text strong>Ready State：</Text>
            <Text>{getReadyStateText(readyState)} ({readyState})</Text>
          </div>
          
          <div className={style.statusItem}>
            <Text strong>当前标签页角色：</Text>
            <Text className={isMaster ? style.master : style.slave}>
              {isMaster ? '主标签页 (负责维护连接)' : '从标签页 (共享连接)'}
            </Text>
          </div>
          
          <div className={style.statusItem}>
            <Text strong>当前标签页 ID：</Text>
            <Text code>{tabId.substring(tabId.length - 12)}</Text>
          </div>
          
          <div className={style.statusItem}>
            <Text strong>主标签页 ID：</Text>
            <Text code>{connectionState.masterTabId.substring(connectionState.masterTabId.length - 12)}</Text>
          </div>
          
          <div className={style.statusItem}>
            <Text strong>连接 ID：</Text>
            <Text code>{connectionState.connectionId.substring(connectionState.connectionId.length - 12)}</Text>
          </div>
        </Space>
      </Card>

      <Card className={style.card}>
        <Title level={3}>测试功能</Title>
        <Paragraph>点击下方按钮发送消息，其他页面会收到此消息：</Paragraph>
        <Button 
          type="primary" 
          onClick={handleSendMessage} 
          disabled={!isConnected}
          size="large"
        >
          发送测试消息
        </Button>
      </Card>

      <Card className={style.card}>
        <Title level={3}>其他演示页面</Title>
        <Space direction="vertical" size={8}>
          <Button type="link" component={Link} to="/websocket/shared-connection-demo/page2">
            页面 2 - 消息发送测试
          </Button>
          <Button type="link" component={Link} to="/websocket/shared-connection-demo/page3">
            页面 3 - 连接状态监控
          </Button>
          <Button type="link" component={Link} to="/websocket/shared-connection-demo">
            返回演示首页
          </Button>
        </Space>
      </Card>

      <Card className={style.card}>
        <Title level={3}>技术说明</Title>
        <Paragraph>
          本页面使用共享的 WebSocket 连接，所有打开的标签页都会共享同一个连接。
          当第一个标签页打开时，它会成为主标签页并创建 WebSocket 连接。
          后续打开的标签页会自动发现并共享这个连接。
        </Paragraph>
        <Paragraph>
          当主标签页关闭时，系统会自动选举一个新的主标签页来维护连接。
        </Paragraph>
      </Card>
    </div>
  );
}
