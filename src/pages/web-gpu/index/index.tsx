import { Typography, Card, Space, Button } from 'antd';
import BasicWebgpu from './basic';
import styles from './index.module.scss';

const { Title, Paragraph } = Typography;

export default function WebGPUPage() {
  return (
    <div className={styles.container}>
      <Title level={1}>WebGPU 说明</Title>
      
      <Paragraph>
        WebGPU 是一种现代的图形 API，提供了对 GPU 硬件的直接访问，性能优于传统的 WebGL。
        本页面包含了一系列 WebGPU 演示，展示了其强大的图形渲染能力。
      </Paragraph>

      <Card className={styles['demo-card']}>
        <Title level={2}>基础演示</Title>
        <Paragraph>
          一个简单的 WebGPU 演示，展示了如何初始化 WebGPU、创建渲染管线并绘制一个三角形。
        </Paragraph>
        <BasicWebgpu />
      </Card>

      <Card className={styles['info-card']}>
        <Title level={2}>关于 WebGPU</Title>
        <Paragraph>
          WebGPU 是由 W3C GPU 工作组开发的新一代图形 API，旨在提供：
        </Paragraph>
        <ul className={styles['feature-list']}>
          <li>更高的性能和更低的延迟</li>
          <li>更现代的编程模型</li>
          <li>更好的跨平台支持</li>
          <li>对现代 GPU 特性的访问</li>
          <li>更高效的并行计算能力</li>
        </ul>
        <Paragraph>
          目前，WebGPU 在 Chrome、Edge 和 Safari 等现代浏览器中已经得到支持。
        </Paragraph>
      </Card>

      <Card className={styles['browser-support']}>
        <Title level={2}>浏览器支持</Title>
        <Paragraph>
          WebGPU 目前在以下浏览器中得到支持：
        </Paragraph>
        <ul className={styles['browser-list']}>
          <li>Chrome 113+</li>
          <li>Edge 113+</li>
          <li>Safari 16.4+</li>
          <li>Firefox (实验性支持)</li>
        </ul>
        <Paragraph>
          对于不支持 WebGPU 的浏览器，您可以考虑使用 WebGL 作为替代方案。
        </Paragraph>
      </Card>
    </div>
  );
}
