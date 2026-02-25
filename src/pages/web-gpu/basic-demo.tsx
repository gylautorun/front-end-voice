import { useEffect, useRef, useState } from 'react';
import styles from './basic-demo.module.scss';

interface WebGPUDemoProps {
  width?: number;
  height?: number;
}

export default function BasicWebgpuDemo({ width = 800, height = 600 }: WebGPUDemoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [device, setDevice] = useState<GPUDevice | null>(null);
  const [context, setContext] = useState<GPUCanvasContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!navigator.gpu) {
      setError('当前浏览器不支持 WebGPU');
      return;
    }

    async function initializeWebGPU() {
      try {
        // 请求 WebGPU 适配器
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
          setError('无法获取 WebGPU 适配器');
          return;
        }

        // 请求 WebGPU 设备
        const gpuDevice = await adapter.requestDevice();
        setDevice(gpuDevice);

        // 获取 canvas 上下文
        const canvas = canvasRef.current;
        if (!canvas) return;

        const gpuContext = canvas.getContext('webgpu');
        if (!gpuContext) {
          setError('无法获取 WebGPU 上下文');
          return;
        }
        setContext(gpuContext);

        // 配置上下文
        const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
        gpuContext.configure({
          device: gpuDevice,
          format: presentationFormat,
          alphaMode: 'opaque'
        });

        // 创建渲染管线
        const pipeline = gpuDevice.createRenderPipeline({
          layout: 'auto',
          vertex: {
            module: gpuDevice.createShaderModule({
              code: `
                @vertex
                fn main(
                  @builtin(vertex_index) VertexIndex : u32
                ) -> @builtin(position) vec4<f32> {
                  let positions = array<vec2<f32>, 3>(
                    vec2<f32>(0.0, 0.5),
                    vec2<f32>(-0.5, -0.5),
                    vec2<f32>(0.5, -0.5)
                  );
                  let position = positions[VertexIndex];
                  return vec4<f32>(position, 0.0, 1.0);
                }
              `
            }),
            entryPoint: 'main'
          },
          fragment: {
            module: gpuDevice.createShaderModule({
              code: `
                @fragment
                fn main() -> @location(0) vec4<f32> {
                  return vec4<f32>(1.0, 0.5, 0.0, 1.0);
                }
              `
            }),
            entryPoint: 'main',
            targets: [
              {
                format: presentationFormat
              }
            ]
          },
          primitive: {
            topology: 'triangle-list'
          }
        });

        // 渲染循环
        function render() {
          if (!gpuContext || !gpuDevice) return;

          const commandEncoder = gpuDevice.createCommandEncoder();
          const textureView = gpuContext.getCurrentTexture().createView();

          const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [
              {
                view: textureView,
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store'
              }
            ]
          };

          const renderPass = commandEncoder.beginRenderPass(renderPassDescriptor);
          renderPass.setPipeline(pipeline);
          renderPass.draw(3);
          renderPass.end();

          gpuDevice.queue.submit([commandEncoder.finish()]);

          requestAnimationFrame(render);
        }

        setIsInitialized(true);
        render();
      } catch (err) {
        setError(`初始化 WebGPU 时出错: ${err}`);
        console.error(err);
      }
    }

    initializeWebGPU();
  }, []);

  // 处理窗口大小变化
  useEffect(() => {
    function handleResize() {
      if (!canvasRef.current) return;
      
      const canvas = canvasRef.current;
      const dpr = window.devicePixelRatio || 1;
      
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    handleResize();
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [width, height]);

  return (
    <div className={styles.container}>
      <h1>WebGPU 基础演示</h1>
      
      {error && (
        <div className={styles.error}>
          <h3>错误</h3>
          <p>{error}</p>
        </div>
      )}

      {isInitialized ? (
        <div className={styles.canvasContainer}>
          <canvas ref={canvasRef} className={styles.canvas} />
          <div className={styles.info}>
            <p>WebGPU 初始化成功！</p>
            <p>渲染状态: 正在绘制一个橙色三角形</p>
          </div>
        </div>
      ) : (
        <div className={styles.loading}>
          <p>正在初始化 WebGPU...</p>
        </div>
      )}

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
