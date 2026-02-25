import { useEffect, useRef, useState } from 'react';
import styles from './index.module.scss';

interface TriangleDemoProps {
  width?: number;
  height?: number;
}

export default function TriangleDemo({ width = 800, height = 600 }: TriangleDemoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [device, setDevice] = useState<GPUDevice | null>(null);
  const [context, setContext] = useState<GPUCanvasContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [vertexBuffer, setVertexBuffer] = useState<GPUBuffer | null>(null);
  const [renderPipeline, setRenderPipeline] = useState<GPURenderPipeline | null>(null);

  // Clear color for GPURenderPassDescriptor
  const clearColor = { r: 0.0, g: 0.5, b: 1.0, a: 1.0 };

  // Vertex data for triangle
  // Each vertex has 8 values representing position and color: X Y Z W R G B A
  const vertices = new Float32Array([
    0.0,  0.6, 0, 1, 1, 0, 0, 1,
   -0.5, -0.6, 0, 1, 0, 1, 0, 1,
    0.5, -0.6, 0, 1, 0, 0, 1, 1
  ]);

  // Vertex and fragment shaders
  const shaders = `
  struct VertexOut {
    @builtin(position) position : vec4f,
    @location(0) color : vec4f
  }

  @vertex
  fn vertex_main(@location(0) position: vec4f,
                 @location(1) color: vec4f) -> VertexOut
  {
    var output : VertexOut;
    output.position = position;
    output.color = color;
    return output;
  }

  @fragment
  fn fragment_main(fragData: VertexOut) -> @location(0) vec4f
  {
    return fragData.color;
  }
  `;

  // Initialize WebGPU
  useEffect(() => {
    async function initializeWebGPU() {
      try {
        // 1: Request adapter and device
        if (!navigator.gpu) {
          throw Error('WebGPU not supported.');
        }

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
          throw Error('Couldn\'t request WebGPU adapter.');
        }

        const gpuDevice = await adapter.requestDevice();
        setDevice(gpuDevice);

        // 2: Create a shader module from the shaders template literal
        const shaderModule = gpuDevice.createShaderModule({
          code: shaders
        });

        // 3: Get reference to the canvas to render on
        const canvas = canvasRef.current;
        if (!canvas) return;

        const gpuContext = canvas.getContext('webgpu');
        if (!gpuContext) {
          throw Error('Couldn\'t get WebGPU context.');
        }
        setContext(gpuContext);

        gpuContext.configure({
          device: gpuDevice,
          format: navigator.gpu.getPreferredCanvasFormat(),
          alphaMode: 'premultiplied'
        });

        // 4: Create vertex buffer to contain vertex data
        const gpuVertexBuffer = gpuDevice.createBuffer({
          size: vertices.byteLength, // make it big enough to store vertices in
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        setVertexBuffer(gpuVertexBuffer);

        // Copy the vertex data over to the GPUBuffer
        gpuDevice.queue.writeBuffer(gpuVertexBuffer, 0, vertices, 0, vertices.length);

        // 5: Create a GPUVertexBufferLayout and GPURenderPipelineDescriptor
        const vertexBuffers: GPUVertexBufferLayout[] = [{
          attributes: [{
            shaderLocation: 0, // position
            offset: 0,
            format: 'float32x4'
          }, {
            shaderLocation: 1, // color
            offset: 16,
            format: 'float32x4'
          }],
          arrayStride: 32,
          stepMode: 'vertex'
        }];

        const pipelineDescriptor: GPURenderPipelineDescriptor = {
          layout: 'auto',
          vertex: {
            module: shaderModule,
            entryPoint: 'vertex_main',
            buffers: vertexBuffers
          },
          fragment: {
            module: shaderModule,
            entryPoint: 'fragment_main',
            targets: [{
              format: navigator.gpu.getPreferredCanvasFormat()
            }]
          },
          primitive: {
            topology: 'triangle-list'
          }
        };

        // 6: Create the actual render pipeline
        const gpuRenderPipeline = gpuDevice.createRenderPipeline(pipelineDescriptor);
        setRenderPipeline(gpuRenderPipeline);

        setIsInitialized(true);
      } catch (err) {
        setError(`初始化 WebGPU 时出错: ${err}`);
        console.error(err);
      }
    }

    initializeWebGPU();
  }, []);

  // Render loop
  useEffect(() => {
    if (!isInitialized || !device || !context || !vertexBuffer || !renderPipeline) return;

    function render() {
      // 7: Create GPUCommandEncoder to issue commands to GPU
      const commandEncoder = device!.createCommandEncoder();

      // 8: Create GPURenderPassDescriptor to tell WebGPU which texture to draw into
      const renderPassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [{
          clearValue: clearColor,
          loadOp: 'clear',
          storeOp: 'store',
          view: context!.getCurrentTexture().createView()
        }]
      };

      const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);

      // 9: Draw triangle
      passEncoder.setPipeline(renderPipeline!);
      passEncoder.setVertexBuffer(0, vertexBuffer!);
      passEncoder.draw(3);

      // End of render pass
      passEncoder.end();

      // 10: End frame by passing array of command buffers to command queue for execution
      device!.queue.submit([commandEncoder.finish()]);

      requestAnimationFrame(render);
    }

    render();
  }, [isInitialized, device, context, vertexBuffer, renderPipeline, clearColor]);

  // Handle window resize
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
      <h1>WebGPU 三角形演示</h1>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
