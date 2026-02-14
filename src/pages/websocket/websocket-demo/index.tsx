import { Typography } from 'antd';
import { WebSocketGlobalProvider } from './context/WebSocketGlobalContext';
import BasicWebSocket from './components/BasicWebSocket';
import ConfiguredWebSocket from './components/ConfiguredWebSocket';
import ContextWebSocket from './components/ContextWebSocket';
import ChatRoom from './components/ChatRoom';
import ManualWebSocket from './components/ManualWebSocket';
import GlobalConfigControl from './components/GlobalConfigControl';
import Documentation from './components/Documentation';
import style from './index.module.scss';

const { Title, Paragraph } = Typography;

export default function WebSocketDemo() {
  return (
    <WebSocketGlobalProvider>
      <div className={style.container}>
        <Title level={1}>WebSocket 组件使用示例</Title>
        <Paragraph className={style.description}>
          本页面展示了 WebSocket 组件的各种使用方式，包括基本连接、配置化使用、Context 共享、聊天室示例和手动连接控制。
          所有组件现在共享同一个全局 WebSocket 连接配置，可以通过全局配置控制面板进行统一管理。
        </Paragraph>
        
        <GlobalConfigControl />
        
        <BasicWebSocket />
        <ConfiguredWebSocket />
        <ContextWebSocket />
        <ChatRoom />
        <ManualWebSocket />
        
        <Documentation />
      </div>
    </WebSocketGlobalProvider>
  );
}
