import { Typography } from 'antd';
import { Link, Route, Switch } from 'react-router-dom';
import style from './index.module.scss';
import Page1 from './components/page1';
import Page2 from './components/page2';
import Page3 from './components/page3';



const { Title, Paragraph, Text } = Typography;

export default function SharedConnectionDemo() {
  return (
    <div className={style.container}>
      <Switch>
        <Route exact path="/websocket/shared-connection-demo">
          <Title level={1}>WebSocket 共享连接演示</Title>
          <Paragraph className={style.description}>
            本演示展示如何在浏览器多个不同页面之间共享同一个 WebSocket 连接，
            减少服务器连接数，提高应用性能。
          </Paragraph>
          
          <div className={style.card}>
            <Title level={2}>使用说明</Title>
            <Paragraph>
              1. 打开下方的演示页面（可以在新标签页中打开）
            </Paragraph>
            <Paragraph>
              2. 观察所有页面是否共享同一个 WebSocket 连接
            </Paragraph>
            <Paragraph>
              3. 在任意页面发送消息，查看其他页面是否能接收到
            </Paragraph>
          </div>
          
          <div className={style.links}>
            <Title level={2}>演示页面</Title>
            <div className={style.linkList}>
              <Link to="/websocket/shared-connection-demo/page1" className={style.link}>
                <div className={style.linkCard}>
                  <Text strong>页面 1</Text>
                  <Paragraph>基本演示页面</Paragraph>
                </div>
              </Link>
              
              <Link to="/websocket/shared-connection-demo/page2" className={style.link}>
                <div className={style.linkCard}>
                  <Text strong>页面 2</Text>
                  <Paragraph>消息发送测试</Paragraph>
                </div>
              </Link>
              
              <Link to="/websocket/shared-connection-demo/page3" className={style.link}>
                <div className={style.linkCard}>
                  <Text strong>页面 3</Text>
                  <Paragraph>连接状态监控</Paragraph>
                </div>
              </Link>
            </div>
          </div>
          
          <div className={style.card}>
            <Title level={2}>技术原理</Title>
            <Paragraph>
              使用 <Text code>BroadcastChannel</Text> API 在同一浏览器的不同标签页/窗口之间通信，
              实现 WebSocket 连接的共享：
            </Paragraph>
            <ul>
              <li>第一个打开的页面创建并维护 WebSocket 连接</li>
              <li>后续打开的页面通过 BroadcastChannel 与主页面通信</li>
              <li>所有页面共享同一个连接，减少服务器负担</li>
              <li>当主页面关闭时，自动选择新的页面作为连接维护者</li>
            </ul>
          </div>
        </Route>
        <Route path="/websocket/shared-connection-demo/page1" component={Page1} />
        <Route path="/websocket/shared-connection-demo/page2" component={Page2} />
        <Route path="/websocket/shared-connection-demo/page3" component={Page3} />
      </Switch>
    </div>
  );
}
