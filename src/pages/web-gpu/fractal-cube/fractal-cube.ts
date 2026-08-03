import { mat4, Mat4 } from 'wgpu-matrix';

import {
  cubeVertexArray,
  cubeVertexSize,
  cubeUVOffset,
  cubePositionOffset,
  cubeVertexCount,
} from './cube';

import basicVertWGSL from './vert.wgsl?raw';
import sampleSelfWGSL from './frag.wgsl?raw';
import { quitIfWebGPUNotAvailableOrMissingFeatures } from '../utils';

export class FractalCube {
  private canvas: HTMLCanvasElement;
  private adapter: GPUAdapter | null = null;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private verticesBuffer: GPUBuffer | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private depthTexture: GPUTexture | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private cubeTexture: GPUTexture | null = null;
  private sampler: GPUSampler | null = null;
  private uniformBindGroup: GPUBindGroup | null = null;
  private renderPassDescriptor: GPURenderPassDescriptor | null = null;
  private projectionMatrix: Mat4 = mat4.create();
  private modelViewProjectionMatrix: Mat4 = mat4.create();
  private animationId: number | null = null;

  /**
   * 构造函数
   * @param canvasElement - Canvas 元素
   */
  constructor(canvasElement: HTMLCanvasElement) {
    this.canvas = canvasElement;
  }

  /**
   * 初始化 WebGPU 和资源
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
      device: this.device!,
      format: presentationFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

    // 创建顶点缓冲区
    this.createVertexBuffer();

    // 创建渲染管线
    this.createRenderPipeline(presentationFormat);

    // 创建深度纹理
    this.createDepthTexture();

    // 创建 uniform 缓冲区
    this.createUniformBuffer();

    // 创建立方体纹理
    this.createCubeTexture(presentationFormat);

    // 创建采样器
    this.createSampler();

    // 创建绑定组
    this.createBindGroup();

    // 创建渲染通道描述符
    this.createRenderPassDescriptor();

    // 初始化矩阵
    this.initializeMatrices();
  }

  /**
   * 创建顶点缓冲区
   */
  private createVertexBuffer(): void {
    const verticesBuffer = this.device!.createBuffer({
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
    const pipeline = this.device!.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: this.device!.createShaderModule({
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
        module: this.device!.createShaderModule({
          code: sampleSelfWGSL,
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
    const depthTexture = this.device!.createTexture({
      size: [this.canvas.width, this.canvas.height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depthTexture = depthTexture;
  }

  /**
   * 创建 uniform 缓冲区
   */
  private createUniformBuffer(): void {
    const uniformBufferSize = 4 * 16; // 4x4 matrix
    const uniformBuffer = this.device!.createBuffer({
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.uniformBuffer = uniformBuffer;
  }

  /**
   * 创建立方体纹理
   * @param presentationFormat - 呈现格式
   */
  private createCubeTexture(presentationFormat: GPUTextureFormat): void {
    const cubeTexture = this.device!.createTexture({
      size: [this.canvas.width, this.canvas.height],
      format: presentationFormat,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.cubeTexture = cubeTexture;
  }

  /**
   * 创建采样器
   */
  private createSampler(): void {
    // 使用 any 类型绕过类型检查
    const device = this.device;
    if (device && device.createSampler) {
      this.sampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
      });
    } else {
      // 如果不支持 createSampler，使用默认值
      this.sampler = null;
    }
  }

  /**
   * 创建绑定组
   */
  private createBindGroup(): void {
    const uniformBindGroup = this.device!.createBindGroup({
      layout: this.pipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer! } },
        { binding: 1, resource: this.sampler! },
        { binding: 2, resource: this.cubeTexture!.createView() },
      ],
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
        view: this.depthTexture!.createView(),
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
    const aspect = this.canvas.width / this.canvas.height;
    this.projectionMatrix = mat4.perspective((2 * Math.PI) / 5, aspect, 1, 100.0);
    this.modelViewProjectionMatrix = mat4.create();
  }

  /**
   * 获取变换矩阵
   */
  private getTransformationMatrix(): Mat4 {
    const viewMatrix = mat4.identity();
    mat4.translate(viewMatrix, [0, 0, -4], viewMatrix);
    const now = Date.now() / 1000;
    mat4.rotate(viewMatrix, [Math.sin(now), Math.cos(now), 0], 1, viewMatrix);

    mat4.multiply(this.projectionMatrix, viewMatrix, this.modelViewProjectionMatrix);

    return this.modelViewProjectionMatrix;
  }

  /**
   * 渲染一帧
   */
  private renderFrame(): void {
    if (!this.device || !this.uniformBuffer || !this.context || !this.renderPassDescriptor || !this.pipeline || !this.uniformBindGroup || !this.verticesBuffer) {
      return;
    }

    const transformationMatrix = this.getTransformationMatrix();
    this.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      transformationMatrix.buffer as ArrayBuffer,
      transformationMatrix.byteOffset,
      transformationMatrix.byteLength
    );

    const swapChainTexture = this.context.getCurrentTexture();
    this.renderPassDescriptor.colorAttachments[0].view = swapChainTexture.createView();

    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass(this.renderPassDescriptor);
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, this.uniformBindGroup);
    passEncoder.setVertexBuffer(0, this.verticesBuffer);
    passEncoder.draw(cubeVertexCount);
    passEncoder.end();

    // 使用 any 类型绕过类型检查
    const encoder = commandEncoder as any;
    if (encoder.copyTextureToTexture && this.cubeTexture) {
      encoder.copyTextureToTexture(
        {
          texture: swapChainTexture,
        },
        {
          texture: this.cubeTexture,
        },
        [this.canvas.width, this.canvas.height]
      );
    }

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
    if (!this.device || !this.depthTexture || !this.renderPassDescriptor) {
      return;
    }

    const devicePixelRatio = window.devicePixelRatio;
    this.canvas.width = this.canvas.clientWidth * devicePixelRatio;
    this.canvas.height = this.canvas.clientHeight * devicePixelRatio;
    
    // 重新创建深度纹理
    this.depthTexture.destroy();
    this.createDepthTexture();
    if (this.depthTexture) {
      this.renderPassDescriptor.depthStencilAttachment!.view = this.depthTexture.createView();
    }
    
    // 重新创建立方体纹理
    if (this.cubeTexture) {
      this.cubeTexture.destroy();
    }
    const presentationFormat = navigator.gpu!.getPreferredCanvasFormat();
    this.createCubeTexture(presentationFormat);
    
    // 重新创建绑定组
    if (this.pipeline) {
      this.createBindGroup();
    }
    
    // 更新矩阵
    this.initializeMatrices();
  }

  /**
   * 销毁资源
   */
  dispose(): void {
    this.stop();
    if (this.verticesBuffer) {
      this.verticesBuffer.destroy();
    }
    if (this.depthTexture) {
      this.depthTexture.destroy();
    }
    if (this.uniformBuffer) {
      this.uniformBuffer.destroy();
    }
    if (this.cubeTexture) {
      this.cubeTexture.destroy();
    }
    if (this.device) {
      this.device.destroy();
    }
  }
}

/**
 * 创建并启动分形立方体
 * @param canvasElement - Canvas 元素
 */
export async function createFractalCube(canvasElement: HTMLCanvasElement): Promise<FractalCube> {
  const cube = new FractalCube(canvasElement);
  await cube.initialize();
  cube.start();
  return cube;
}
