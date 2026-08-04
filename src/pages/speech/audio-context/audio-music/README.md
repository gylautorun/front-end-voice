# 音频输入切换与频谱可视化

该示例使用 Web Audio API，在网页默认音频、用户上传音频和麦克风之间互斥切换，并将当前输入绘制为实时频谱柱图。

## 文件职责

```text
audio-music/
├── index.tsx              # React 状态、媒体事件和用户交互
├── AudioContextManager.ts # 音频节点连接、资源生命周期和 Canvas 绘制
├── style.module.scss      # 频谱区域与三路控件布局
├── 春涧.mp3               # 默认示例音乐
└── README.md
```

`index.tsx` 只处理界面状态与异步操作是否仍然有效。`AudioContextManager` 不持有 React 状态，只管理浏览器媒体对象。

## 持久化音频图

组件首次收到用户操作时创建一套共享节点，切换音源时不关闭它们：

```text
默认 audio ─┬─> destination（正常播放）
上传 audio ─┘
      │
      └─> AnalyserNode ─> GainNode(gain = 0.000001) ─> destination
                              ↑
麦克风 ───────────────────────┘
```

实际连接关系中三种输入同一时刻只保留一种：

- 默认音频和上传音频同时连接 `AnalyserNode` 与 `destination`，因此既能分析也能正常发声。
- 麦克风只连接 `AnalyserNode`。分析器经过 `0.000001`（约 -120 dB）的非零增益接到输出，保证不同浏览器持续处理麦克风支路；该电平远低于可听阈值，不会产生可听回放或啸叫。
- `AudioContext` 和 `AnalyserNode` 只创建一次；音源激活时会取消旧动画帧并立即安排唯一新帧，避免麦克风权限弹窗留下失效的帧 ID。

## 为什么切换后不能重建 Context

同一个 `HTMLAudioElement` 只能被 `createMediaElementSource()` 包装一次。重复包装会抛出 `InvalidStateError`，关闭旧 Context 后再包装同一个元素也不能可靠恢复。

管理器用 `WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>` 缓存节点。切换时调用 `disconnect()`，再次使用时把缓存节点重新连接到共享分析器和输出。

## 三种输入流程

### 默认网页音频

`<audio>` 的 `onPlay` 调用 `activateMediaElementSource('default', audio)`。管理器暂停其他音频、停止麦克风并连接默认音频。暂停或播放结束只更新页面状态，不销毁绘制循环。

### 上传音频

选择文件时立即调用 `prepare()`，让 `AudioContext` 在用户手势内创建或恢复；真正播放前会再次等待它进入 `running`。文件转为 Blob URL 并注册为 `'uploaded'`，媒体可播放后调用 `playAudio('uploaded')`。

取消上传只释放上传元素和 Blob URL，不影响默认音频、分析器或 Canvas 循环。

### 麦克风

点击开始时在同一个点击调用栈内立即并行执行 `prepare()` 与 `getUserMedia()`，避免等待 Context 恢复后再请求权限而导致浏览器不弹授权。采集约束会按浏览器支持情况以 `ideal: false` 关闭回声消除、降噪和自动增益，防止短促声音被预处理抹掉；不支持这些约束时回退为 `{audio: true}`。两者成功后校验音轨仍为 `live`，再次确认 Context 状态，再调用 `activateMediaStream('mic', stream)`。

授权成功后通过 `enumerateDevices()` 展示实际可用的麦克风。切换设备会停止旧轨道，并使用选中 `deviceId` 重新创建流。页面每 100 ms 从分析器读取一次时域 RMS：连续两秒为零时显示“无输入”，轨道 `muted` 时显示“设备静音”，后续检测到声音会自动恢复为“有输入”。

停止说话或系统结束轨道时调用 `stopMicrophone()`，关闭所有媒体轨道、断开麦克风节点并清空画布。绘制循环仍然存在，下一种输入可立即复用。

## 竞态处理

上传加载和麦克风授权都是异步操作。组件用两个递增编号避免旧回调覆盖新操作：

- `transitionId` 标记最近一次音源操作。较早返回的麦克风授权会立即停止其流，不能抢回当前音源。
- `uploadId` 标记最近一次上传。被替换文件的 `canplay`、`error` 等事件不能修改当前状态。
- 组件卸载时设置 `isUnmounted`，禁止异步回调继续 `setState()`。

## Canvas 绘制

- Canvas 的物理缓冲尺寸按 CSS 尺寸和设备像素比实时同步，避免默认 `300 x 150` 缓冲被拉伸。
- 柱数随容器宽度变化，固定间距后反算柱宽，因此桌面和移动端都能铺满。
- 每根低频柱至少使用一个独立 FFT bin，高频逐步合并多个 bin，避免左侧多根柱高度完全相同。
- 麦克风模式聚焦 8 kHz 以下的人声频段，并只在绘制层提高可视增益，短促说话或咳嗽也能产生明显变化。
- 柱高混合区间峰值与平均值，兼顾节拍响应和视觉连续性。
- 最大柱高预留顶部间距，避免频谱紧贴画布顶边。
- 单帧绘制放在 `try/finally` 中，即使 Canvas 在某帧发生状态变化，下一帧仍会继续；音源切换还会重新安排一次绘制，且始终只保留一个循环。

## 主要 API

| 方法 | 作用 |
| --- | --- |
| `prepare()` | 在用户手势内创建或恢复共享 AudioContext，并等待状态变为 `running` |
| `activateMediaElementSource(key, audio)` | 互斥激活默认或上传音频，不自动播放 |
| `playAudio(key)` | 激活并播放已注册的 HTMLAudioElement |
| `activateMediaStream(key, stream)` | 互斥激活麦克风流 |
| `pauseAudio(key)` | 暂停音频但保留节点和绘制循环 |
| `stopMicrophone()` | 停止轨道并断开麦克风输入 |
| `addAudioInstance()` / `deleteAudioInstance()` | 注册或释放指定媒体实例 |
| `destroy()` | 组件卸载时释放全部节点、动画和 Context |

## 资源清理边界

普通播放、暂停和音源切换不能调用 `AudioContext.close()`，也不能停止全局绘制循环。只有 `componentWillUnmount()` 调用 `destroy()` 完全释放资源；上传取消只释放上传一路，麦克风停止只释放麦克风一路。
