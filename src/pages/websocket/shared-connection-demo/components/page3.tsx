import { Typography, Card, Space, Alert, List, Tag } from 'antd';
import { Link } from 'react-router-dom';
import useSharedWebSocket from '../utils/useSharedWebSocket';
import NavigationCard from './navigation-card';
import style from './page3.module.scss';

const { Title, Paragraph, Text } = Typography;

export default function Page3() {
  const { isConnected, readyState, isMaster, tabId, connectionState, connectionHistory } = useSharedWebSocket();

  const getReadyStateText = (state: number) => {
    switch (state) {
      case 0: return 'CONNECTING';
      case 1: return 'OPEN';
      case 2: return 'CLOSING';
      case 3: return 'CLOSED';
      default: return 'UNKNOWN';
    }
  };

  const getStatusColor = (status: boolean) => {
    return status ? 'success' : 'error';
  };

  const typeColorMap = {
    connection: 'blue',
    message: 'green',
    master: 'orange',
    other: 'purple'
  };

  return (
    <div className={style.container}>
      <NavigationCard currentPage="page3" />
      <Title level={1}>页面 3 - 连接状态监控</Title>
      
      <Card className={style.card}>
        <Title level={3}>实时连接状态</Title>
        <Space vertical size={16} style={{ width: '100%' }}>
          <Alert
            message="连接状态"
            description={
              <Text className={isConnected ? style.connected : style.disconnected}>
                {isConnected ? '已连接' : '未连接'}
              </Text>
            }
            type={isConnected ? 'success' : 'error'}
            showIcon
          />
          
          <Alert
            message="Ready State"
            description={`${getReadyStateText(readyState)} (${readyState})`}
            type={readyState === 1 ? 'success' : 'info'}
            showIcon
          />
          
          <Alert
            message="当前标签页角色"
            description={
              <Text className={isMaster ? style.master : style.slave}>
                {isMaster ? '主标签页 (负责维护连接)' : '从标签页 (共享连接)'}
              </Text>
            }
            type={isMaster ? 'warning' : 'info'}
            showIcon
          />
        </Space>
      </Card>

      <Card className={style.card}>
        <Title level={3}>连接详情</Title>
        <List
          itemLayout="horizontal"
          dataSource={[
            {
              key: 'tabId',
              title: '当前标签页 ID',
              value: tabId.substring(tabId.length - 12)
            },
            {
              key: 'masterTabId',
              title: '主标签页 ID',
              value: connectionState.masterTabId ? connectionState.masterTabId.substring(connectionState.masterTabId.length - 12) : '无'
            },
            {
              key: 'connectionId',
              title: '连接 ID',
              value: connectionState.connectionId ? connectionState.connectionId.substring(connectionState.connectionId.length - 12) : '无'
            },
            {
              key: 'tabCount',
              title: '共享连接的标签页数量',
              value: connectionState.tabCount || 0
            },
            {
              key: 'lastUpdated',
              title: '最后更新时间',
              value: connectionState.lastUpdated ? new Date(connectionState.lastUpdated).toLocaleString() : '无'
            }
          ]}
          renderItem={item => (
            <List.Item>
              <List.Item.Meta
                title={<Text strong>{item.title}</Text>}
                description={<Text code>{item.value}</Text>}
              />
            </List.Item>
          )}
        />
      </Card>

      <Card className={style.card}>
        <Title level={3}>连接历史</Title>
        <List
          dataSource={connectionHistory}
          renderItem={item => (
            <List.Item>
              <List.Item.Meta
                title={
                  <Space>
                    <Text>{item.event}</Text>
                    <Tag color={typeColorMap[item.type] || 'default'}>
                      {item.type}
                    </Tag>
                  </Space>
                }
                description={
                  <div>
                    <Text>{item.description}</Text>
                    <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                      {new Date(item.timestamp).toLocaleString()}
                    </Text>
                  </div>
                }
              />
            </List.Item>
          )}
          locale={{ emptyText: '暂无连接历史' }}
        />
      </Card>

      <Card className={style.card}>
        <Title level={3}>技术说明</Title>
        <Paragraph>
          本页面实时监控 WebSocket 连接状态，包括：
        </Paragraph>
        <List
          dataSource={[
            '连接状态（已连接/未连接）',
            'WebSocket Ready State',
            '当前标签页角色（主/从）',
            '连接详情（标签页 ID、连接 ID 等）',
            '连接历史记录'
          ]}
          renderItem={item => <List.Item>• {item}</List.Item>}
        />
      </Card>
    </div>
  );
}
