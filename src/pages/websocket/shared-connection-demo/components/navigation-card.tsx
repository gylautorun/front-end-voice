import { Card, Space, Button, Typography } from 'antd';
import { Link } from 'react-router-dom';
import style from './navigation-card.module.scss';

interface NavigationCardProps {
  currentPage?: 'page1' | 'page2' | 'page3';
}

const { Title } = Typography;
export default function NavigationCard({ currentPage }: NavigationCardProps) {
  return (
    <Card className={style.card}>
      <Title level={3}>其他演示页面</Title>
      <Space vertical size={8}>
        {currentPage !== 'page1' && (
          <Link to="/websocket/shared-connection-demo/page1">
            <Button type="link">
              页面 1 - 基本演示
            </Button>
          </Link>
        )}
        {currentPage !== 'page2' && (
          <Link to="/websocket/shared-connection-demo/page2">
            <Button type="link">
              页面 2 - 消息发送测试
            </Button>
          </Link>
        )}
        {currentPage !== 'page3' && (
          <Link to="/websocket/shared-connection-demo/page3">
            <Button type="link">
              页面 3 - 连接状态监控
            </Button>
          </Link>
        )}
        <Link to="/websocket/shared-connection-demo">
          <Button type="link">
            返回演示首页
          </Button>
        </Link>
      </Space>
    </Card>
  );
}
