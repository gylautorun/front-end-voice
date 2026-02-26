import {
  quitIfAdapterNotAvailable,
  quitIfWebGPUNotAvailableOrMissingFeatures,
} from '../utils';
import spriteWGSL from './sprite.wgsl?raw';
import updateSpritesWGSL from './sprites.wgsl?raw';
import { GUI } from 'dat.gui';

export class ComputeBoids {
  private canvas: HTMLCanvasElement;
  private adapter!: GPUAdapter;
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private devicePixelRatio: number;
  private presentationFormat!: GPUTextureFormat;
  private renderPipeline!: GPURenderPipeline;
  private computePipeline!: GPUComputePipeline;
  private spriteShaderModule!: GPUShaderModule;
  private renderPassDescriptor!: GPURenderPassDescriptor;
  private computePassDescriptor!: GPUComputePassDescriptor;
  private querySet: GPUQuerySet | undefined;
  private resolveBuffer: GPUBuffer | undefined;
  private spareResultBuffers: GPUBuffer[] = [];
  private hasTimestampQuery: boolean = false;
  private spriteVertexBuffer: GPUBuffer | null = null;
  private simParams: {
    deltaT: number;
    rule1Distance: number;
    rule2Distance: number;
    rule3Distance: number;
    rule1Scale: number;
    rule2Scale: number;
    rule3Scale: number;
  };
  private simParamBuffer: GPUBuffer | null = null;
  private gui: GUI | null = null;
  private numParticles: number;
  private particleBuffers: GPUBuffer[] = [];
  private particleBindGroups: GPUBindGroup[] = [];
  private t: number = 0;
  private computePassDurationSum: number = 0;
  private renderPassDurationSum: number = 0;
  private timerSamples: number = 0;
  private animationId: number | undefined;
  private perfDisplay: HTMLPreElement | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.devicePixelRatio = window.devicePixelRatio;
    this.numParticles = 1500;
    this.simParams = {
      deltaT: 0.04,
      rule1Distance: 0.1,
      rule2Distance: 0.025,
      rule3Distance: 0.025,
      rule1Scale: 0.02,
      rule2Scale: 0.05,
      rule3Scale: 0.005,
    };
  }

  async initialize(): Promise<void> {
    // 请求 GPU 适配器
    const adapter = await navigator.gpu?.requestAdapter({
      featureLevel: 'compatibility',
    });
    quitIfAdapterNotAvailable(adapter);
    this.adapter = adapter;

    // 检查是否支持时间戳查询
    this.hasTimestampQuery = this.adapter.features.has('timestamp-query');

    // 创建 GPU 设备
    const device = await this.adapter.requestDevice({
      requiredFeatures: this.hasTimestampQuery ? ['timestamp-query'] : [],
    });
    quitIfWebGPUNotAvailableOrMissingFeatures(this.adapter!, device);
    this.device = device;

    // 创建性能显示元素
    this.createPerfDisplay();

    // 初始化画布上下文
    this.initializeCanvasContext();

    // 创建着色器模块和管线
    this.createShaderModulesAndPipelines();

    // 初始化查询相关资源
    this.initializeQueryResources();

    // 创建粒子系统资源
    this.createParticleResources();

    // 创建 GUI 控制面板
    this.createGUIControls();

    // 开始渲染循环
    this.startRenderLoop();
  }

  private createPerfDisplay(): void {
    const perfDisplayContainer = document.createElement('div');
    perfDisplayContainer.style.color = 'white';
    perfDisplayContainer.style.background = 'black';
    perfDisplayContainer.style.position = 'absolute';
    perfDisplayContainer.style.bottom = '10px';
    perfDisplayContainer.style.left = '10px';
    perfDisplayContainer.style.textAlign = 'left';

    const perfDisplay = document.createElement('pre');
    perfDisplay.style.margin = '.5em';
    perfDisplayContainer.appendChild(perfDisplay);
    
    if (this.canvas.parentNode) {
      this.canvas.parentNode.appendChild(perfDisplayContainer);
    } else {
      console.error('canvas.parentNode is null');
    }

    this.perfDisplay = perfDisplay;
  }

  private initializeCanvasContext(): void {
    const context = this.canvas.getContext('webgpu');
    if (!context) {
      throw new Error('WebGPU context not available');
    }
    this.context = context;

    this.canvas.width = this.canvas.clientWidth * this.devicePixelRatio;
    this.canvas.height = this.canvas.clientHeight * this.devicePixelRatio;
    const gpu = navigator.gpu;
    if (!gpu) {
      throw new Error('WebGPU not available');
    }
    this.presentationFormat = gpu.getPreferredCanvasFormat();

    this.context.configure({
      device: this.device,
      format: this.presentationFormat,
    });
  }

  private createShaderModulesAndPipelines(): void {
    this.spriteShaderModule = this.device.createShaderModule({ code: spriteWGSL });

    // 创建渲染管线
    this.renderPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: this.spriteShaderModule,
        entryPoint: 'vert_main',
        buffers: [
          {
            // instanced particles buffer
            arrayStride: 4 * 4,
            stepMode: 'instance',
            attributes: [
              {
                // instance position
                shaderLocation: 0,
                offset: 0,
                format: 'float32x2',
              },
              {
                // instance velocity
                shaderLocation: 1,
                offset: 2 * 4,
                format: 'float32x2',
              },
            ],
          },
          {
            // vertex buffer
            arrayStride: 2 * 4,
            stepMode: 'vertex',
            attributes: [
              {
                // vertex positions
                shaderLocation: 2,
                offset: 0,
                format: 'float32x2',
              },
            ],
          },
        ],
      },
      fragment: {
        module: this.spriteShaderModule,
        entryPoint: 'frag_main',
        targets: [
          {
            format: this.presentationFormat,
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    // 创建计算管线
    const computeShaderModule = this.device.createShaderModule({
      code: updateSpritesWGSL,
    });
    this.computePipeline = this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: computeShaderModule,
        entryPoint: 'main',
      },
    });

    // 初始化渲染通道描述符
    this.renderPassDescriptor = {
      colorAttachments: [
        {
          view: null as unknown as GPUTextureView, // Assigned later
          clearValue: [0, 0, 0, 1],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    };

    // 初始化计算通道描述符
    this.computePassDescriptor = {};
  }

  private initializeQueryResources(): void {
    if (this.hasTimestampQuery) {
      this.querySet = this.device.createQuerySet({
        type: 'timestamp',
        count: 4,
      });
      this.resolveBuffer = this.device.createBuffer({
        size: 4 * BigInt64Array.BYTES_PER_ELEMENT,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      });
      this.computePassDescriptor = {
        timestampWrites: {
          querySet: this.querySet,
          beginningOfPassWriteIndex: 0,
          endOfPassWriteIndex: 1,
        },
      };
      this.renderPassDescriptor = {
        ...this.renderPassDescriptor,
        timestampWrites: {
          querySet: this.querySet,
          beginningOfPassWriteIndex: 2,
          endOfPassWriteIndex: 3,
        },
      };
    }
  }

  private createParticleResources(): void {
    // 创建精灵顶点缓冲区
    const vertexBufferData = new Float32Array([
      -0.01, -0.02, 0.01,
      -0.02, 0.0, 0.02,
    ]);

    this.spriteVertexBuffer = this.device.createBuffer({
      size: vertexBufferData.byteLength,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    new Float32Array(this.spriteVertexBuffer.getMappedRange()).set(vertexBufferData);
    this.spriteVertexBuffer.unmap();

    // 创建模拟参数缓冲区
    const simParamBufferSize = 7 * Float32Array.BYTES_PER_ELEMENT;
    this.simParamBuffer = this.device.createBuffer({
      size: simParamBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.updateSimParams();

    // 创建粒子缓冲区
    this.particleBuffers = new Array(2);
    this.particleBindGroups = new Array(2);

    const initialParticleData = new Float32Array(this.numParticles * 4);
    for (let i = 0; i < this.numParticles; ++i) {
      initialParticleData[4 * i + 0] = 2 * (Math.random() - 0.5);
      initialParticleData[4 * i + 1] = 2 * (Math.random() - 0.5);
      initialParticleData[4 * i + 2] = 2 * (Math.random() - 0.5) * 0.1;
      initialParticleData[4 * i + 3] = 2 * (Math.random() - 0.5) * 0.1;
    }

    for (let i = 0; i < 2; ++i) {
      this.particleBuffers[i] = this.device.createBuffer({
        size: initialParticleData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
        mappedAtCreation: true,
      });
      new Float32Array(this.particleBuffers[i].getMappedRange()).set(
        initialParticleData
      );
      this.particleBuffers[i].unmap();
    }

    for (let i = 0; i < 2; ++i) {
      this.particleBindGroups[i] = this.device.createBindGroup({
        layout: this.computePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.simParamBuffer },
          { binding: 1, resource: this.particleBuffers[i] },
          { binding: 2, resource: this.particleBuffers[(i + 1) % 2] },
        ],
      });
    }
  }

  private createGUIControls(): void {
    try {
      this.gui = new GUI();
      Object.keys(this.simParams).forEach((k) => {
        const key = k as keyof typeof this.simParams;
        this.gui!.add(this.simParams, key).onFinishChange(() => this.updateSimParams());
      });
    } catch (error) {
      console.warn('Failed to initialize GUI:', error);
      this.gui = null;
    }
  }

  private updateSimParams(): void {
    // if (!this.simParamBuffer) {
    //   return;
    // }
    this.device.queue.writeBuffer(
      this.simParamBuffer!,
      0,
      new Float32Array([
        this.simParams.deltaT,
        this.simParams.rule1Distance,
        this.simParams.rule2Distance,
        this.simParams.rule3Distance,
        this.simParams.rule1Scale,
        this.simParams.rule2Scale,
        this.simParams.rule3Scale,
      ])
    );
  }

  private startRenderLoop(): void {
    const frame = () => {
      this.renderPassDescriptor.colorAttachments[0].view = this.context
        .getCurrentTexture()
        .createView();

      const commandEncoder = this.device.createCommandEncoder();
      {
        const passEncoder = commandEncoder.beginComputePass(this.computePassDescriptor);
        passEncoder.setPipeline(this.computePipeline);
        passEncoder.setBindGroup(0, this.particleBindGroups[this.t % 2]);
        passEncoder.dispatchWorkgroups(Math.ceil(this.numParticles / 64));
        passEncoder.end();
      }
      {
        const passEncoder = commandEncoder.beginRenderPass(this.renderPassDescriptor);
        passEncoder.setPipeline(this.renderPipeline);
        passEncoder.setVertexBuffer(0, this.particleBuffers[(this.t + 1) % 2]);
        passEncoder.setVertexBuffer(1, this.spriteVertexBuffer!);
        passEncoder.draw(3, this.numParticles, 0, 0);
        passEncoder.end();
      }

      let resultBuffer: GPUBuffer | undefined = undefined;
      if (this.hasTimestampQuery && this.querySet && this.resolveBuffer) {
        resultBuffer = this.spareResultBuffers.pop() || this.device.createBuffer({
          size: 4 * BigInt64Array.BYTES_PER_ELEMENT,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        commandEncoder.resolveQuerySet(this.querySet, 0, 4, this.resolveBuffer, 0);
        commandEncoder.copyBufferToBuffer(this.resolveBuffer, 0, resultBuffer, 0, 4 * BigInt64Array.BYTES_PER_ELEMENT);
      }

      this.device.queue.submit([commandEncoder.finish()]);

      if (this.hasTimestampQuery && resultBuffer) {
        resultBuffer.mapAsync('READ').then(() => {
          const times = new BigInt64Array(resultBuffer!.getMappedRange());
          const computePassDuration = Number(times[1] - times[0]);
          const renderPassDuration = Number(times[3] - times[2]);

          // In some cases the timestamps may wrap around and produce a negative
          // number as the GPU resets it's timings. These can safely be ignored.
          if (computePassDuration > 0 && renderPassDuration > 0) {
            this.computePassDurationSum += computePassDuration;
            this.renderPassDurationSum += renderPassDuration;
            this.timerSamples++;
          }
          resultBuffer!.unmap();

          // Periodically update the text for the timer stats
          const kNumTimerSamplesPerUpdate = 100;
          if (this.timerSamples >= kNumTimerSamplesPerUpdate && this.perfDisplay) {
            const avgComputeMicroseconds = Math.round(
              this.computePassDurationSum / this.timerSamples / 1000
            );
            const avgRenderMicroseconds = Math.round(
              this.renderPassDurationSum / this.timerSamples / 1000
            );
            this.perfDisplay.textContent = `\navg compute pass duration: ${avgComputeMicroseconds}µs\navg render pass duration:  ${avgRenderMicroseconds}µs\nspare readback buffers:    ${this.spareResultBuffers.length}`;
            this.computePassDurationSum = 0;
            this.renderPassDurationSum = 0;
            this.timerSamples = 0;
          }
          this.spareResultBuffers.push(resultBuffer!);
        });
      }

      ++this.t;
      this.animationId = requestAnimationFrame(frame);
    };

    this.animationId = requestAnimationFrame(frame);
  }

  /**
   * 销毁资源
   */
  public destroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    // 销毁缓冲区
    if (this.spriteVertexBuffer) {
      this.spriteVertexBuffer.destroy();
    }

    if (this.simParamBuffer) {
      this.simParamBuffer.destroy();
    }

    if (this.particleBuffers) {
      this.particleBuffers.forEach(buffer => buffer.destroy());
    }

    if (this.resolveBuffer) {
      this.resolveBuffer.destroy();
    }

    if (this.querySet) {
      this.querySet.destroy();
    }

    if (this.spareResultBuffers) {
      this.spareResultBuffers.forEach(buffer => buffer.destroy());
    }

    // 销毁设备
    if (this.device) {
      this.device.destroy();
    }
  }
}

/**
 * 创建 ComputeBoids 实例
 * @param canvas 画布元素
 * @returns ComputeBoids 实例
 */
export async function createComputeBoids(canvas: HTMLCanvasElement): Promise<ComputeBoids> {
  const boids = new ComputeBoids(canvas);
  await boids.initialize();
  return boids;
}
