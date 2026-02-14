import { Typography } from 'antd';
import { useWebSocketGlobal } from '../context/WebSocketGlobalContext';
import ContextChildComponent from './ContextChildComponent';
import style from '../index.module.scss';

export default function ContextWebSocket() {
  return (
    <div className={style.section}>
      <Typography.Title level={3}>使用 Context 的 WebSocket 连接</Typography.Title>
      <Typography.Paragraph>
        此组件现在使用全局 WebSocket 连接，所有子组件共享同一个连接。
      </Typography.Paragraph>
      <ContextChildComponent />
      <ContextChildComponent />
    </div>
  );
}
