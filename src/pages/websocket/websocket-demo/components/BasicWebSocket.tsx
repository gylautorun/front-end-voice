import { Button, Typography } from 'antd';
import { useWebSocketGlobal } from '../context/WebSocketGlobalContext';
import style from '../index.module.scss';

const { Paragraph } = Typography;

export default function BasicWebSocket() {
  const { send, isConnected, connect, disconnect, readyState } = useWebSocketGlobal();

  const handleSendMessage = () => {
    send('Hello WebSocket!');
  };

  const handleConnect = () => {
    console.log('Attempting to connect to WebSocket...');
    try {
      connect();
      console.log('Connect method called successfully');
    } catch (error) {
      console.error('Error in connect method:', error);
    }
  };

  const handleDisconnect = () => {
    disconnect();
  };

  const sendMessageDisabled = !isConnected;
  const connectDisabled = isConnected;
  const disconnectDisabled = !isConnected;

  return (
    <div className={style.section}>
      <Typography.Title level={3}>基本 WebSocket 连接</Typography.Title>
      <div className={style.status}>
        <Paragraph>连接状态: <span className={isConnected ? style.connected : style.disconnected}>
          {isConnected ? '已连接' : '未连接'}
        </span></Paragraph>
        <Paragraph>Ready State: <span>{readyState}</span></Paragraph>
      </div>
      <div className={style.controls}>
        <Button 
          onClick={handleSendMessage} 
          disabled={sendMessageDisabled}
        >
          发送消息
        </Button>
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
          断开连接
        </Button>
      </div>
    </div>
  );
}
