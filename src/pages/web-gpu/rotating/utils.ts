/** 如果获取适配器失败，显示错误对话框。 */
export function quitIfAdapterNotAvailable(
  adapter: GPUAdapter | null
): asserts adapter {
  if (!('gpu' in navigator)) {
    fail('navigator.gpu 未定义 - 此浏览器不支持 WebGPU');
  }

  if (!adapter) {
    fail('requestAdapter 返回 null - 此示例无法在此系统上运行');
  }
}

export function quitIfLimitLessThan(
  adapter: GPUAdapter,
  limit: string,
  requiredValue: number,
  limits: Record<string, GPUSize32>
) {
  if (limit in adapter.limits) {
    const limitKey = limit as keyof GPUSupportedLimits;
    const limitValue = adapter.limits[limitKey] as number;
    if (limitValue < requiredValue) {
      fail(
        `此示例无法在此系统上运行。${limit} 值为 ${limitValue}，但此示例至少需要 ${requiredValue}。`
      );
    }
    limits[limit] = requiredValue;
  }
}

/**
 * 如果获取适配器失败或适配器不支持给定的功能列表，显示错误对话框。
 */
export function quitIfFeaturesNotAvailable(
  adapter: GPUAdapter | null,
  requiredFeatures: GPUFeatureName[]
): asserts adapter {
  quitIfAdapterNotAvailable(adapter);

  for (const feature of requiredFeatures) {
    if (!adapter.features.has(feature)) {
      fail(
        `此示例需要 '${feature}' 功能，此系统不支持。`
      );
      return;
    }
  }
}

/**
 * 检查是否支持直接缓冲区绑定
 * @param device - GPU 设备
 * @returns 是否支持直接缓冲区绑定
 */
function supportsDirectBufferBinding(device: GPUDevice): boolean {
  const buffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM,
  });
  const layout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: {} }],
  });

  try {
    device.createBindGroup({
      layout,
      entries: [{ binding: 0, resource: buffer }],
    });
    return true;
  } catch {
    return false;
  } finally {
    buffer.destroy();
  }
}

/**
 * 检查是否支持直接纹理绑定
 * @param device - GPU 设备
 * @returns 是否支持直接纹理绑定
 */
function supportsDirectTextureBinding(device: GPUDevice): boolean {
  const texture = device.createTexture({
    // size: [1],
    size: [1, 1],
    usage: GPUTextureUsage.TEXTURE_BINDING,
    format: 'rgba8unorm',
  });
  const layout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} }],
  });

  try {
    device.createBindGroup({
      layout,
      entries: [{ binding: 0, resource: texture }],
    });
    return true;
  } catch {
    return false;
  } finally {
    texture.destroy();
  }
}

/**
 * 检查是否支持直接纹理附件
 * @param device - GPU 设备
 * @returns 是否支持直接纹理附件
 */
function supportsDirectTextureAttachments(device: GPUDevice): boolean {
  const texture = device.createTexture({
    // size: [1],
    size: [1, 1],
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
    format: 'rgba8unorm',
    sampleCount: 4,
  });
  const resolveTarget = device.createTexture({
    // size: [1],
    size: [1, 1],
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
    format: 'rgba8unorm',
  });
  const depthTexture = device.createTexture({
    // size: [1],
    size: [1, 1],
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
    format: 'depth16unorm',
    sampleCount: 4,
  });
  const encoder = device.createCommandEncoder();
  try {
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: texture, resolveTarget, loadOp: 'load', storeOp: 'store' },
      ],
      depthStencilAttachment: {
        view: depthTexture,
        depthClearValue: 1.0,
        depthLoadOp: 'load',
        depthStoreOp: 'store',
      },
    });
    pass.end();
    return true;
  } catch (e) {
    console.error(e);
    return false;
  } finally {
    encoder.finish();
    texture.destroy();
    resolveTarget.destroy();
  }
}

/**
 * 如果获取适配器或设备失败，或者设备丢失或有未捕获的错误，显示错误对话框。
 * 还会检查是否支持直接缓冲区绑定、直接纹理绑定和直接纹理附件绑定。
 */
export function quitIfWebGPUNotAvailableOrMissingFeatures(
  adapter: GPUAdapter | null,
  device: GPUDevice | null
): asserts device {
  if (!device) {
    quitIfAdapterNotAvailable(adapter);
    fail('无法获取设备，原因未知');
    return;
  }

  device.lost.then((reason) => {
    fail(`设备丢失（"${reason.reason}"）：\n${reason.message}`);
  });
  device.addEventListener('uncapturederror', (ev) => {
    fail(`未捕获的错误：\n${ev.error.message}`);
  });

  if (
    !supportsDirectBufferBinding(device) ||
    !supportsDirectTextureBinding(device) ||
    !supportsDirectTextureAttachments(device)
  ) {
    fail(
      'WebGPU 的核心功能不可用。请将浏览器更新到较新版本。'
    );
  }
}

/** 通过显示控制台错误和可能的对话框来失败。 */
const fail = (() => {
  type ErrorOutput = { show(msg: string): void };

  function createErrorOutput() {
    if (typeof document === 'undefined') {
      // 在 worker 中未实现
      return {
        show(msg: string) {
          console.error(msg);
        },
      };
    }

    const dialogBox = document.createElement('dialog');
    dialogBox.close();
    document.body.append(dialogBox);

    const dialogText = document.createElement('pre');
    dialogText.style.whiteSpace = 'pre-wrap';
    dialogBox.append(dialogText);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '确定';
    closeBtn.onclick = () => dialogBox.close();
    dialogBox.append(closeBtn);

    return {
      show(msg: string) {
        // 当对话框仍打开时，不要覆盖对话框消息
        // （显示第一个错误，而不是最新的错误）
        if (!dialogBox.open) {
          dialogText.textContent = msg;
          dialogBox.showModal();
        }
      },
    };
  }

  let output: ErrorOutput | undefined;

  return (message: string) => {
    if (!output) output = createErrorOutput();

    output.show(message);
    throw new Error(message);
  };
})();