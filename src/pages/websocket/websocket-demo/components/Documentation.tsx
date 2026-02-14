import { Table, Typography } from 'antd';
import { configOptionsColumns, configOptionsDataSource, readyStateColumns, readyStateDataSource } from './tableData';
import style from '../index.module.scss';

const { Title } = Typography;

export default function Documentation() {
  return (
    <div className={style.documentation}>
      <Title level={2}>WebSocket 组件文档</Title>
      <div className={style.docSection}>
        <Title level={3}>安装与导入</Title>
        <pre className={style.code}>
          {`// 方式 1: 导入默认导出
          import useWebSocket from 'src/components/native-websocket';

          // 方式 2: 导入命名导出
          import { useWebSocket, WebSocketProvider, useWebSocketContext } from 'src/components/native-websocket';`}
        </pre>
      </div>
      
      <div className={style.docSection}>
        <Title level={3}>配置选项</Title>
        <Table
          columns={configOptionsColumns}
          dataSource={configOptionsDataSource}
          pagination={false}
        />
      </div>
      
      <div className={style.docSection}>
        <Title level={3}>Ready State 状态码</Title>
        <Table
          columns={readyStateColumns}
          dataSource={readyStateDataSource}
          pagination={false}
        />
      </div>
      
      <div className={style.docSection}>
        <Title level={3}>注意事项</Title>
        <ul className={style.list}>
          <li>支持 ws:// 和 wss:// 协议</li>
          <li>当设置 format: 'json' 时，会自动处理 JSON 序列化和反序列化</li>
          <li>组件卸载时会自动断开连接</li>
          <li>支持所有现代浏览器，不支持 IE11 及以下版本</li>
          <li>重连失败时会停止重连并触发相应事件</li>
        </ul>
      </div>
    </div>
  );
}
