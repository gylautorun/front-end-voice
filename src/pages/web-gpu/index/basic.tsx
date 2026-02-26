/**
 * WebGPU 基础演示组件
 * 展示了 WebGPU 的基本用法，包括初始化设备、创建渲染管线、绘制三角形等
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import basicVertWGSL from './basic.vert.wgsl?raw';
import basicFragWGSL from './basic.frag.wgsl?raw';
import styles from './basic.module.scss';

/**
 * 组件属性接口
 */
interface WebGPUDemoProps {
  /** 画布宽度，默认 800px */
  width?: number;
  /** 画布高度，默认 600px */
  height?: number;
}

/**
 * WebGPU 基础演示组件
 */
export default function BasicWebgpuDemo({ width = 800, height = 600 }: WebGPUDemoProps) {
  /** Canvas 元素引用 */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** WebGPU 设备实例 */
  const [device, setDevice] = useState<GPUDevice | null>(null);
  /** WebGPU 画布上下文 */
  const [context, setContext] = useState<GPUCanvasContext | null>(null);
  /** 错误信息 */
  const [error, setError] = useState<Error | string | null>(null);
  /** 初始化状态 */
  const [isInitialized, setIsInitialized] = useState(false);
  /** 渲染管线引用 */
  const pipelineRef = useRef<GPURenderPipeline | null>(null);

/**
 * 渲染循环函数
 * 负责每一帧的渲染操作，包括创建命令编码器、设置渲染通道、执行绘制命令等
 */
  const render = useCallback(() => {
    // 检查必要的资源是否就绪
    if (!context || !device || !pipelineRef.current) return;

    // 创建命令编码器，用于向 GPU 发送命令
    const commandEncoder = device.createCommandEncoder();
    // 获取当前画布纹理的视图
    const textureView = context.getCurrentTexture().createView();

    // 创建渲染通道描述符，定义渲染目标和清除值等
    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: textureView, // 渲染目标视图
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, // 清除颜色（黑色）
          loadOp: 'clear', // 加载操作：清除
          storeOp: 'store' // 存储操作：保存
        }
      ]
    };

    // 开始渲染通道
    const renderPass = commandEncoder.beginRenderPass(renderPassDescriptor);
    // 设置渲染管线
    renderPass.setPipeline(pipelineRef.current);
    // 绘制三角形（3个顶点）
    renderPass.draw(3);
    // 结束渲染通道
    renderPass.end();

    // 提交命令缓冲区到 GPU 队列执行
    device.queue.submit([commandEncoder.finish()]);

    // 请求下一帧渲染
    requestAnimationFrame(render);
  }, [context, device]);

/**
 * 初始化 WebGPU 函数
 * 负责设置 WebGPU 环境，包括请求适配器、创建设备、获取上下文、配置渲染管线等
 */
  async function initializeWebGPU() {
    try {
      // 请求 WebGPU 适配器，用于选择合适的 GPU 设备
      const adapter = await navigator.gpu!.requestAdapter();
      if (!adapter) {
        setError('无法获取 WebGPU 适配器');
        return;
      }

      // 请求 WebGPU 设备，用于执行 GPU 操作
      const gpuDevice = await adapter.requestDevice();
      setDevice(gpuDevice);

      // 获取 canvas 元素
      const canvas = canvasRef.current;
      if (!canvas) return;

      // 获取 WebGPU 上下文，用于渲染操作
      const gpuContext = canvas.getContext('webgpu');
      if (!gpuContext) {
        setError('无法获取 WebGPU 上下文');
        return;
      }
      setContext(gpuContext);

      // 获取浏览器首选的画布格式
      const presentationFormat = navigator.gpu!.getPreferredCanvasFormat();
      // 配置 WebGPU 上下文
      gpuContext.configure({
        device: gpuDevice, // 使用创建的 GPU 设备
        format: presentationFormat, // 使用首选的格式
        alphaMode: 'opaque' // 不透明模式
        // alphaMode: 'premultiplied' // 预乘透明度
      });

      // 创建渲染管线，定义渲染过程
      const pipeline = gpuDevice.createRenderPipeline({
        layout: 'auto', // 自动布局
        vertex: { // 顶点着色器
          module: gpuDevice.createShaderModule({
            code: basicVertWGSL
          }),
          entryPoint: 'main' // 顶点着色器入口函数
        },
        fragment: { // 片段着色器
          module: gpuDevice.createShaderModule({
            code: basicFragWGSL
          }),
          entryPoint: 'main', // 片段着色器入口函数
          targets: [ // 渲染目标
            {
              format: presentationFormat // 使用首选的格式
            }
          ]
        },
        primitive: { // 图元设置
          topology: 'triangle-list' // 使用三角形列表拓扑
        }
      });

      // 存储渲染管线到引用中
      pipelineRef.current = pipeline;
    } catch (err) {
      // 捕获并处理错误
      setError(err as Error);
    } finally {
      // 无论成功失败，都标记初始化完成
      setIsInitialized(true);
    }
  }

  /**
   * 处理窗口大小变化函数
   * 负责调整画布大小以适应窗口变化，考虑设备像素比以保证清晰度
   */
  const handleResize = useCallback(() => {
    // 检查 canvas 元素是否存在
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    // 获取设备像素比，默认为 1
    const dpr = window.devicePixelRatio || 1;
    
    // 设置 canvas 实际像素大小，考虑设备像素比
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    // 设置 canvas 显示大小
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }, [width, height]);

/**
 * 初始化 WebGPU 的 useEffect 钩子
 * 在组件挂载后执行，此时 canvas 元素已渲染到 DOM 中
 */
  useEffect(() => {
    // 检查浏览器是否支持 WebGPU
    if (!navigator.gpu) {
      setError('当前浏览器不支持 WebGPU');
      return;
    }

    // 初始化 WebGPU
    initializeWebGPU();
  }, []); // 空依赖数组，只执行一次

/**
 * 渲染循环的 useEffect 钩子
 * 在初始化完成后开始渲染循环
 */
  useEffect(() => {
    // 当初始化完成后，开始渲染循环
    if (isInitialized) {
      render();
    }
  }, [isInitialized, render]); // 依赖于初始化状态和渲染函数

/**
 * 窗口大小变化的 useEffect 钩子
 * 处理窗口大小变化，调整画布大小
 */
  useEffect(() => {
    // 初始调整画布大小
    handleResize();
    // 监听窗口大小变化事件
    window.addEventListener('resize', handleResize);
    
    // 清理函数，移除事件监听器
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [handleResize]); // 依赖于处理窗口大小变化函数

  return (
    <div className={styles.container}>
      <h1>WebGPU 基础演示</h1>
      
      {error && (
        <div className={styles.error}>
          <h3>错误</h3>
          <p>{error instanceof Error ? (error as Error).message : error}</p>
        </div>
      )}

      <div className={styles.canvasContainer}>
        <canvas ref={canvasRef} className={styles.canvas} width={width} height={height} />
        {isInitialized ? (
          <div className={styles.info}>
            <p>WebGPU 初始化成功！</p>
            <p>渲染状态: 正在绘制一个橙色三角形</p>
          </div>
        ) : (
          <div className={styles.loading}>
            <p>正在初始化 WebGPU...</p>
          </div>
        )}
      </div>

      <div className={styles.description}>
        <h2>演示说明</h2>
        <p>这个演示展示了 WebGPU 的基本用法，包括：</p>
        <ul>
          <li>初始化 WebGPU 设备和上下文</li>
          <li>创建渲染管线</li>
          <li>绘制一个简单的三角形</li>
          <li>处理窗口大小变化</li>
        </ul>
        <p>WebGPU 是一种现代的图形 API，提供了对 GPU 硬件的直接访问，性能优于传统的 WebGL。</p>
      </div>
    </div>
  );
}
