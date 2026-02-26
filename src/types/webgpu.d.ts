// WebGPU 类型定义

interface Navigator {
  gpu?: GPU;
}

interface GPU {
  requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
  getPreferredCanvasFormat(): string;
}

interface GPURequestAdapterOptions {
  powerPreference?: GPUPowerPreference;
  forceFallbackAdapter?: boolean;
  featureLevel?: string;
}

type GPUPowerPreference = 'default' | 'low-power' | 'high-performance';

type GPUSize32 = number;

type GPUFeatureName = string;

type GPUDeviceLostReason = string;

type GPULoadOp = 'clear' | 'load';
type GPUStoreOp = 'discard' | 'store';

type GPUTextureFormat = string;

interface GPUAdapter {
  requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice>;
  features: Set<GPUFeatureName>;
  limits: GPUSupportedLimits;
}

interface GPUSupportedLimits {
  maxTextureDimension1D: number;
  maxTextureDimension2D: number;
  maxTextureDimension3D: number;
  maxTextureArrayLayers: number;
  maxBindGroups: number;
  maxBindingsPerBindGroup: number;
  maxDynamicUniformBuffersPerPipelineLayout: number;
  maxDynamicStorageBuffersPerPipelineLayout: number;
  maxSampledTexturesPerShaderStage: number;
  maxSamplersPerShaderStage: number;
  maxStorageBuffersPerShaderStage: number;
  maxStorageTexturesPerShaderStage: number;
  maxUniformBuffersPerShaderStage: number;
  maxUniformBufferBindingSize: number;
  maxStorageBufferBindingSize: number;
  maxVertexBuffers: number;
  maxVertexAttributes: number;
  maxVertexBufferArrayStride: number;
  maxInterStageShaderVariables: number;
  maxComputeWorkgroupStorageSize: number;
  maxComputeInvocationsPerWorkgroup: number;
  maxComputeWorkgroupSizeX: number;
  maxComputeWorkgroupSizeY: number;
  maxComputeWorkgroupSizeZ: number;
  maxComputeWorkgroupsPerDimension: number;
}

interface GPUDeviceDescriptor {
  requiredFeatures?: Iterable<GPUFeatureName>;
  requiredLimits?: GPULimits;
  label?: string;
}

interface GPULimits {
  maxTextureDimension1D?: number;
  maxTextureDimension2D?: number;
  maxTextureDimension3D?: number;
  maxTextureArrayLayers?: number;
  maxBindGroups?: number;
  maxBindingsPerBindGroup?: number;
  maxDynamicUniformBuffersPerPipelineLayout?: number;
  maxDynamicStorageBuffersPerPipelineLayout?: number;
  maxSampledTexturesPerShaderStage?: number;
  maxSamplersPerShaderStage?: number;
  maxStorageBuffersPerShaderStage?: number;
  maxStorageTexturesPerShaderStage?: number;
  maxUniformBuffersPerShaderStage?: number;
  maxUniformBufferBindingSize?: number;
  maxStorageBufferBindingSize?: number;
  maxVertexBuffers?: number;
  maxVertexAttributes?: number;
  maxVertexBufferArrayStride?: number;
  maxInterStageShaderVariables?: number;
  maxComputeWorkgroupStorageSize?: number;
  maxComputeInvocationsPerWorkgroup?: number;
  maxComputeWorkgroupSizeX?: number;
  maxComputeWorkgroupSizeY?: number;
  maxComputeWorkgroupSizeZ?: number;
  maxComputeWorkgroupsPerDimension?: number;
}

interface GPUDevice {
  createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
  createRenderPipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline;
  createCommandEncoder(): GPUCommandEncoder;
  createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout;
  createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup;
  createTexture(descriptor: GPUTextureDescriptor): GPUTexture;
  createSampler(descriptor: GPUSamplerDescriptor): GPUSampler;
  queue: GPUQueue;
  lost: Promise<GPUDeviceLostInfo>;
  addEventListener(type: 'uncapturederror', listener: (event: GPUUncapturedErrorEvent) => void): void;
  removeEventListener(type: 'uncapturederror', listener: (event: GPUUncapturedErrorEvent) => void): void;
  destroy(): void;
}

interface GPUDeviceLostInfo {
  reason: GPUDeviceLostReason;
  message: string;
}

interface GPUUncapturedErrorEvent {
  error: Error;
}

interface GPUCanvasContext {
  configure(configuration: GPUCanvasConfiguration): void;
  getCurrentTexture(): GPUTexture;
}

interface GPUBuffer {
  readonly usage: number;
  getMappedRange(offset?: number, size?: number): ArrayBuffer;
  unmap(): void;
  destroy(): void;
}

interface GPURenderPipeline {
  getBindGroupLayout(index: number): GPUBindGroupLayout;
}

interface GPURenderPassDescriptor {
  colorAttachments: GPURenderPassColorAttachment[];
  depthStencilAttachment?: GPURenderPassDepthStencilAttachment;
}

interface GPURenderPassColorAttachment {
  view: GPUTextureView;
  clearValue?: GPUColorDict | [number, number, number, number];
  loadOp: GPULoadOp;
  storeOp: GPUStoreOp;
  resolveTarget?: GPUTextureView;
}

interface GPURenderPassDepthStencilAttachment {
  view: GPUTextureView;
  depthClearValue: number;
  depthLoadOp: GPULoadOp;
  depthStoreOp: GPUStoreOp;
  stencilClearValue?: number;
  stencilLoadOp?: GPULoadOp;
  stencilStoreOp?: GPUStoreOp;
}

interface GPUColorDict {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface GPUShaderModuleDescriptor {
  code: string;
}

interface GPUShaderModule {}

interface GPUBufferDescriptor {
  size: number;
  usage: number;
  mappedAtCreation?: boolean;
}

interface GPURenderPipelineDescriptor {
  layout: 'auto' | GPUPipelineLayout;
  vertex: GPUVertexState;
  fragment: GPUFragmentState;
  primitive: GPUPrimitiveState;
  depthStencil?: GPUDepthStencilState;
}

interface GPUVertexState {
  module: GPUShaderModule;
  entryPoint: string;
  buffers?: GPUVertexBufferLayout[];
}

interface GPUFragmentState {
  module: GPUShaderModule;
  entryPoint: string;
  targets: GPUColorTargetState[];
}

interface GPUPrimitiveState {
  topology: GPUPrimitiveTopology;
  cullMode?: GPUCullMode;
}

type GPUCullMode = 'none' | 'front' | 'back';

interface GPUVertexBufferLayout {
  arrayStride: number;
  stepMode?: GPUVertexStepMode;
  attributes: GPUVertexAttribute[];
}

interface GPUVertexAttribute {
  shaderLocation: number;
  offset: number;
  format: string;
}

interface GPUColorTargetState {
  format: string;
}

interface GPUDepthStencilState {
  depthWriteEnabled: boolean;
  depthCompare: string;
  format: string;
}

interface GPUPipelineLayout {}

type GPUVertexStepMode = 'vertex' | 'instance';
type GPUPrimitiveTopology = 'point-list' | 'line-list' | 'line-strip' | 'triangle-list' | 'triangle-strip';

// GPUBufferUsage 常量
enum GPUBufferUsage {
  MAP_READ = 1 << 0,
  MAP_WRITE = 1 << 1,
  COPY_SRC = 1 << 2,
  COPY_DST = 1 << 3,
  INDEX = 1 << 4,
  VERTEX = 1 << 5,
  UNIFORM = 1 << 6,
  STORAGE = 1 << 7,
  INDIRECT = 1 << 8,
  QUERY_RESOLVE = 1 << 9
}

// GPUTextureUsage 常量
enum GPUTextureUsage {
  COPY_SRC = 1 << 0,
  COPY_DST = 1 << 1,
  SAMPLED = 1 << 2,
  STORAGE = 1 << 3,
  RENDER_ATTACHMENT = 1 << 4,
  TEXTURE_BINDING = 1 << 2,
  STORAGE_BINDING = 1 << 3
}

// GPUShaderStage 常量
enum GPUShaderStage {
  VERTEX = 1 << 0,
  FRAGMENT = 1 << 1,
  COMPUTE = 1 << 2
}

interface GPUQueue {
  writeBuffer(buffer: GPUBuffer, bufferOffset: number, data: BufferSource, dataOffset?: number, size?: number): void;
  submit(commandBuffers: GPUCommandBuffer[]): void;
}

interface GPUCommandEncoder {
  beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder;
  finish(): GPUCommandBuffer;
}

interface GPURenderPassEncoder {
  setPipeline(pipeline: GPURenderPipeline): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup): void;
  setVertexBuffer(slot: number, buffer: GPUBuffer, offset?: number, size?: number): void;
  draw(vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number): void;
  end(): void;
}

interface GPUCommandBuffer {}

interface GPUTexture {
  createView(): GPUTextureView;
  destroy(): void;
}

interface GPUTextureView {}

interface GPUBindGroupLayout {}

interface GPUBindGroup {
  layout: GPUBindGroupLayout;
}

interface GPUBindGroupLayoutDescriptor {
  entries: GPUBindGroupLayoutEntry[];
}

interface GPUBindGroupLayoutEntry {
  binding: number;
  visibility: number;
  buffer?: GPUBufferBindingLayout;
  texture?: GPUTextureBindingLayout;
}

interface GPUBufferBindingLayout {
  type?: 'uniform' | 'storage' | 'read-only-storage';
  hasDynamicOffset?: boolean;
  minBindingSize?: number;
}

interface GPUTextureBindingLayout {
  sampleType?: 'float' | 'unfilterable-float' | 'depth' | 'sint' | 'uint';
  viewDimension?: '1d' | '2d' | '2d-array' | 'cube' | 'cube-array' | '3d';
  multisampled?: boolean;
}

interface GPUBindGroupDescriptor {
  layout: GPUBindGroupLayout;
  entries: GPUBindGroupEntry[];
}

interface GPUBindGroupEntry {
  binding: number;
  resource: GPUBuffer | GPUTexture | GPUTextureView | GPUSampler;
}

interface GPUSampler {
  destroy(): void;
}

interface GPUSamplerDescriptor {
  addressModeU?: GPUAddressMode;
  addressModeV?: GPUAddressMode;
  addressModeW?: GPUAddressMode;
  magFilter?: GPUFilterMode;
  minFilter?: GPUFilterMode;
  mipmapFilter?: GPUFilterMode;
  maxAnisotropy?: number;
  compare?: GPUCompareFunction;
  lodMinClamp?: number;
  lodMaxClamp?: number;
  name?: string;
}

type GPUAddressMode = 'clamp-to-edge' | 'repeat' | 'mirror-repeat';
type GPUFilterMode = 'nearest' | 'linear';
type GPUCompareFunction = 'never' | 'less' | 'equal' | 'less-equal' | 'greater' | 'not-equal' | 'greater-equal' | 'always';

interface GPUTextureDescriptor {
  size: [number, number, number] | [number, number];
  format: GPUTextureFormat;
  usage: number;
  sampleCount?: number;
}

interface GPUCanvasConfiguration {
  device: GPUDevice;
  format: string;
  alphaMode?: 'opaque' | 'premultiplied' | 'unpremultiplied';
  colorSpace?: PredefinedColorSpace | string;
  size?: [number, number];
  usage?: number;
}

interface HTMLCanvasElement {
  getContext(contextId: 'webgpu'): GPUCanvasContext | null;
  getContext(contextId: string): CanvasRenderingContext2D | WebGLRenderingContext | GPUCanvasContext | null;
}

// 确保类型兼容性
type GPUSupportedLimitsKeys = keyof GPUSupportedLimits;
type GPULimitsKeys = keyof GPULimits;

// 扩展 BufferSource 类型以支持 Float32Array
type BufferSource = ArrayBufferView | ArrayBuffer;
