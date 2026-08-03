import { mat4 } from 'wgpu-matrix';

import {
  cubeVertexArray,
  cubeVertexSize,
  cubeUVOffset,
  cubePositionOffset,
  cubeVertexCount,
} from './cube';

import basicVertWGSL from './vert.wgsl?raw';
import vertexPositionColorWGSL from './frag.wgsl?raw';
import { quitIfWebGPUNotAvailableOrMissingFeatures } from '../utils';

/**
 * 旋转立方体 WebGPU 渲染类
 * 处理 WebGPU 初始化、资源创建和渲染循环
 */
export class RotatingCube {
  private canvas: HTMLCanvasElement;
  private adapter!: GPUAdapter;
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private verticesBuffer!: GPUBuffer;
  private pipeline!: GPURenderPipeline;
  private depthTexture!: GPUTexture;
  private uniformBuffer!: GPUBuffer;
  private uniformBindGroup!: GPUBindGroup;
  private renderPassDescriptor!: GPURenderPassDescriptor;
  private aspect!: number;
  private projectionMatrix!: Float32Array;
  private modelViewProjectionMatrix!: Float32Array;
  private animationId: number | null = null;

  /**
   * 构造函数
   * @param canvasElement - Canvas 元素
   */
  constructor(canvasElement: HTMLCanvasElement) {
    this.canvas = canvasElement;
  }

  /**
   * 初始化 WebGPU 资源
   */
  async initialize(): Promise<void> {
    // 请求 WebGPU 适配器
    const adapter = await navigator.gpu?.requestAdapter();

    // 请求 WebGPU 设备
    const device = await adapter?.requestDevice();

    // 检查 WebGPU 可用性
    quitIfWebGPUNotAvailableOrMissingFeatures(adapter || null, device || null);

    this.adapter = adapter!;
    this.device = device!;

    // 获取 WebGPU 上下文
    const context = this.canvas.getContext('webgpu');
    if (!context) {
      throw new Error('无法获取 WebGPU 上下文');
    }
    this.context = context;

    // 配置 Canvas 大小
    const devicePixelRatio = window.devicePixelRatio;
    this.canvas.width = this.canvas.clientWidth * devicePixelRatio;
    this.canvas.height = this.canvas.clientHeight * devicePixelRatio;
    const presentationFormat = navigator.gpu!.getPreferredCanvasFormat();

    // 配置 WebGPU 上下文
    this.context.configure({
      device: this.device,
      format: presentationFormat,
    });

    // 创建顶点缓冲区
    this.createVertexBuffer();

    // 创建渲染管线
    this.createRenderPipeline(presentationFormat);

    // 创建深度纹理
    this.createDepthTexture();

    // 创建 uniform 缓冲区和绑定组
    this.createUniformBuffer();

    // 创建渲染通道描述符
    this.createRenderPassDescriptor();

    // 初始化矩阵
    this.initializeMatrices();
  }

  /**
   * 创建顶点缓冲区
   */
  private createVertexBuffer(): void {
    const verticesBuffer = this.device.createBuffer({
      size: cubeVertexArray.byteLength,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    new Float32Array(verticesBuffer.getMappedRange()).set(cubeVertexArray);
    verticesBuffer.unmap();
    this.verticesBuffer = verticesBuffer;
  }

  /**
   * 创建渲染管线
   * @param presentationFormat - 呈现格式
   */
  private createRenderPipeline(presentationFormat: GPUTextureFormat): void {
    const pipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: this.device.createShaderModule({
          code: basicVertWGSL,
        }),
        entryPoint: 'main',
        buffers: [
          {
            arrayStride: cubeVertexSize,
            attributes: [
              {
                // position
                shaderLocation: 0,
                offset: cubePositionOffset,
                format: 'float32x4',
              },
              {
                // uv
                shaderLocation: 1,
                offset: cubeUVOffset,
                format: 'float32x2',
              },
            ],
          },
        ],
      },
      fragment: {
        module: this.device.createShaderModule({
          code: vertexPositionColorWGSL,
        }),
        entryPoint: 'main',
        targets: [
          {
            format: presentationFormat,
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });
    this.pipeline = pipeline;
  }

  /**
   * 创建深度纹理
   */
  private createDepthTexture(): void {
    const depthTexture = this.device.createTexture({
      size: [this.canvas.width, this.canvas.height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depthTexture = depthTexture;
  }

  /**
   * 创建 uniform 缓冲区和绑定组
   */
  private createUniformBuffer(): void {
    const uniformBufferSize = 4 * 16; // 4x4 matrix
    const uniformBuffer = this.device.createBuffer({
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.uniformBuffer = uniformBuffer;

    const uniformBindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });
    this.uniformBindGroup = uniformBindGroup;
  }

  /**
   * 创建渲染通道描述符
   */
  private createRenderPassDescriptor(): void {
    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: null as unknown as GPUTextureView, // 稍后赋值
          clearValue: [0.5, 0.5, 0.5, 1.0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    };
    this.renderPassDescriptor = renderPassDescriptor;
  }

  /**
   * 初始化矩阵
   */
  private initializeMatrices(): void {
    this.aspect = this.canvas.width / this.canvas.height;
    this.projectionMatrix = mat4.perspective((2 * Math.PI) / 5, this.aspect, 1, 100.0);
    this.modelViewProjectionMatrix = mat4.create();
  }

  /**
   * 获取变换矩阵
   * @returns 模型视图投影矩阵
   */
  private getTransformationMatrix(): Float32Array {
    const viewMatrix = mat4.identity();
    mat4.translate(viewMatrix, [0, 0, -4], viewMatrix);
    const now = Date.now() / 1000;
    mat4.rotate(viewMatrix, [Math.sin(now), Math.cos(now), 0], 1, viewMatrix);

    mat4.multiply(this.projectionMatrix, viewMatrix, this.modelViewProjectionMatrix);

    return this.modelViewProjectionMatrix;
  }

  /**
   * 渲染帧
   */
  private renderFrame(): void {
    const transformationMatrix = this.getTransformationMatrix();
    this.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      transformationMatrix.buffer as ArrayBuffer,
      transformationMatrix.byteOffset,
      transformationMatrix.byteLength
    );
    
    this.renderPassDescriptor.colorAttachments[0].view = this.context
      .getCurrentTexture()
      .createView();

    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass(this.renderPassDescriptor);
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, this.uniformBindGroup);
    passEncoder.setVertexBuffer(0, this.verticesBuffer);
    passEncoder.draw(cubeVertexCount);
    passEncoder.end();
    this.device.queue.submit([commandEncoder.finish()]);

    this.animationId = requestAnimationFrame(() => this.renderFrame());
  }

  /**
   * 开始渲染循环
   */
  start(): void {
    if (this.animationId === null) {
      this.animationId = requestAnimationFrame(() => this.renderFrame());
    }
  }

  /**
   * 停止渲染循环
   */
  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * 调整大小
   */
  resize(): void {
    const devicePixelRatio = window.devicePixelRatio;
    this.canvas.width = this.canvas.clientWidth * devicePixelRatio;
    this.canvas.height = this.canvas.clientHeight * devicePixelRatio;
    
    // 重新创建深度纹理
    this.depthTexture.destroy();
    this.createDepthTexture();
    this.renderPassDescriptor.depthStencilAttachment!.view = this.depthTexture.createView();
    
    // 更新矩阵
    this.initializeMatrices();
  }

  /**
   * 销毁资源
   */
  dispose(): void {
    this.stop();
    this.verticesBuffer.destroy();
    this.depthTexture.destroy();
    this.uniformBuffer.destroy();
    this.device.destroy();
  }
}

/**
 * 创建并启动旋转立方体
 * @param canvasElement - Canvas 元素
 */
export async function createRotatingCube(canvasElement: HTMLCanvasElement): Promise<RotatingCube> {
  const cube = new RotatingCube(canvasElement);
  await cube.initialize();
  cube.start();
  return cube;
}
