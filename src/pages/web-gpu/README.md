# WebGPU 演示

本目录包含了 WebGPU 的基础演示，展示了如何使用 WebGPU API 进行图形渲染。

## 演示内容

### 基础演示 (basic-demo.tsx)
- 初始化 WebGPU 设备和上下文
- 创建渲染管线
- 绘制一个简单的橙色三角形
- 处理窗口大小变化
- 错误处理和状态反馈

## 技术栈

- React 18
- TypeScript
- WebGPU API
- SCSS Modules
- Ant Design

## 浏览器支持

WebGPU 目前在以下浏览器中得到支持：

- Chrome 113+
- Edge 113+
- Safari 16.4+
- Firefox (实验性支持)

## 如何运行

1. 确保您的浏览器支持 WebGPU
2. 克隆项目并安装依赖：
   ```bash
   git clone <项目地址>
   cd front-end-voice
   npm install
   ```
3. 启动开发服务器：
   ```bash
   npm run dev
   ```
4. 打开浏览器并访问：
   ```
   http://localhost:5173/websocket/shared-connection-demo
   ```
   (注意：具体路径可能需要根据项目路由配置进行调整)

## 核心概念

### WebGPU 初始化流程

1. **请求适配器**：通过 `navigator.gpu.requestAdapter()` 获取 WebGPU 适配器
2. **请求设备**：通过 `adapter.requestDevice()` 获取 WebGPU 设备
3. **配置上下文**：使用 `canvas.getContext('webgpu')` 获取并配置 WebGPU 上下文
4. **创建渲染管线**：定义顶点着色器和片段着色器，创建渲染管线
5. **渲染循环**：使用 `requestAnimationFrame` 创建渲染循环，执行绘制操作

### 着色器语言

WebGPU 使用 WGSL (WebGPU Shading Language) 作为着色器语言，类似于 GLSL 但有一些语法差异。

## 性能优化

- 使用 `useRef` 存储 canvas 引用，避免不必要的重新渲染
- 使用 `useEffect` 管理 WebGPU 资源的生命周期
- 合理配置渲染管线，避免不必要的状态切换
- 处理窗口大小变化时，适当调整 canvas 分辨率

## 扩展建议

如果您想扩展这个演示，可以考虑：

1. **添加更多几何图形**：绘制复杂的 2D 和 3D 几何图形
2. **实现纹理映射**：加载和使用纹理
3. **添加光照效果**：实现基本的光照模型
4. **实现动画**：添加基于时间的动画效果
5. **创建粒子系统**：展示 WebGPU 的并行计算能力
6. **实现后期处理**：添加模糊、 bloom 等效果

## 参考资源

- [WebGPU 官方文档](https://gpuweb.github.io/gpuweb/)
- [MDN WebGPU 文档](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
- [WebGPU 示例](https://webgpu.github.io/webgpu-samples/)
- [WGSL 规范](https://gpuweb.github.io/gpuweb/wgsl/)

## 故障排除

### 常见错误

1. **"当前浏览器不支持 WebGPU"**
   - 解决方案：使用支持 WebGPU 的现代浏览器，如 Chrome 113+ 或 Safari 16.4+

2. **"无法获取 WebGPU 适配器"**
   - 解决方案：确保您的显卡支持 WebGPU，并且驱动程序是最新的

3. **"无法获取 WebGPU 上下文"**
   - 解决方案：确保 canvas 元素存在，并且浏览器支持 WebGPU

4. **渲染管线创建失败**
   - 解决方案：检查 WGSL 着色器代码是否正确，确保语法没有错误

### 调试技巧

- 使用浏览器开发者工具的 "GPU" 或 "WebGPU" 选项卡查看 WebGPU 相关信息
- 在控制台中添加 `console.log` 语句，跟踪 WebGPU 初始化和渲染过程
- 使用 `try-catch` 块捕获并处理可能的错误
- 参考 WebGPU 示例代码，确保您的实现符合最佳实践

## 许可证

本项目采用 MIT 许可证。
