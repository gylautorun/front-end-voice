# 音频音乐 (audio-music)

基于 Web Audio API 的三种音源（默认音乐、上传音频、麦克风）切换与频谱可视化。

---

## 目录结构

```
audio-music/
├── index.tsx              # 页面组件：UI + 事件与状态
├── AudioContextManager.ts # 核心：AudioContext、音源连接、canvas 绘制
├── style.module.scss
├── 春涧.mp3               # 默认音乐
├── function/              # 其他实现（如 use-audio-music）
└── README.md
```

---

## 核心概念

### 三种音源

| 音源     | 类型               | 存储 key   | 说明                         |
|----------|--------------------|------------|------------------------------|
| 默认音乐 | `HTMLAudioElement` | 无（用 ref）| 页面 `<audio>`，不放入 map   |
| 上传音频 | `HTMLAudioElement` | `'uploaded'` | 用户选文件后 `new Audio()` 创建 |
| 麦克风   | `MediaStream`      | `'mic'`    | `getUserMedia({ audio: true })` |

同一时刻只有一路音源连接到分析器并输出到扬声器，切换时需先停/暂停其他路再连接当前路。

### Web Audio 约束

- **同一 `<audio>` 只能调用一次 `createMediaElementSource()`**  
  重复调用会报 `InvalidStateError`。因此 Manager 用 `WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>` 按元素缓存，同一元素只创建一次 source，后续复用。
- **不轻易关闭 AudioContext**  
  关闭后该 context 下的 MediaElementAudioSource 失效，对应 audio 无法再通过 Web Audio 播放。因此平时只做「断开源 + 停止绘制」，仅在组件卸载时 `destroy()` 里真正 `context.close()`。

---

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│  index.tsx (UI + 状态)                                            │
│  - currentAudio: 'default' | 'uploaded' | 'mic'                   │
│  - speaking / uploadedAudioPlaying；上传区显隐由 stream 是否有值决定 │
│  - 用户操作 → 调 Manager API → setAudioState(current)             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  AudioContextManager                                              │
│  - 单例 AudioContext + 单例 AnalyserNode                          │
│  - 当前仅一路：MediaElementSource 或 MediaStreamSource → Analyser │
│  - elementSourceCache: 每个 HTMLAudioElement 只对应一个 source 节点 │
│  - requestAnimationFrame 驱动 canvas 频谱条                        │
└─────────────────────────────────────────────────────────────────┘
```

- **index.tsx**：负责交互、状态（当前音源、是否说话、上传是否播放等），以及默认 `<audio>` 的 ref。
- **AudioContextManager**：负责创建/复用 Context、连接/断开音源、分析器、canvas 绘制与清理；不持有 React 状态。

---

## 状态与 UI 对应

| 状态                     | 含义                     | 典型 UI 表现                 |
|--------------------------|--------------------------|------------------------------|
| `currentAudio`           | 当前生效的音源类型       | 决定 canvas 画的是哪一路     |
| `speaking`               | 是否正在用麦克风         | 按钮「说话」/「静音」        |
| `uploadedAudioPlaying`   | 上传音频是否在播         | 上传区「播放」/「暂停」+ 禁用说话 |
| `stream`（实例属性）     | 上传文件的 blob URL     | 有值则显示「取消」「播放/暂停」  |

状态由 `setAudioState(current)` 统一推导 `speaking`、`uploadedAudioPlaying`；上传区是否显示由是否有上传文件决定（`this.stream` 是否有值）。

---

## 核心流程

### 1. 播放默认音乐

- 用户点击页面 `<audio>` 的播放 → `handlePlay`。
- `switchToElementAndPlay(defaultAudio)`：停麦克风、暂停上传、暂停默认（若在播），再 `ensureContext` → `connectMediaElementSource(defaultAudio)` → `audio.play()`。
- `setAudioState('default')`。

### 2. 播放上传音频

- 选文件 → `handleFileChange` → 创建 `Audio`、设 `src`，在 `oncanplay` 里：
  - 停麦克风、`closeAudioContext()`（断开并清画布）、`addAudioInstance('uploaded', audio)`；
  - `switchToElementAndPlay(uploadedAudio, defaultAudioRef)`（会暂停默认）；
  - `setAudioState('uploaded')`。
- 之后点「播放/暂停」→ `handleUploadedAudioPlayPause`：暂停时只调 `pauseAudio('uploaded')`；播放时再次 `switchToElementAndPlay(uploadedAudio, defaultAudioRef)`（复用已缓存的 source）。

### 3. 说话（麦克风）

- 点「说话」→ `startSpeaking`：
  - `pauseAllElementSources(defaultAudioRef)`（暂停默认 + 上传）；
  - `setState({ uploadedAudioPlaying: false })`；
  - `getUserMedia({ audio: true })` 成功后再 `closeAudioContext()`、`create()`、`addAudioInstance('mic', stream)`、`createMediaStreamSource(stream)`，`setAudioState('mic')`。
- 点「静音」→ `stopSpeaking`：`stopAudio('mic')`、`closeAudioContext()`、`setAudioState('default')`。

### 4. 取消上传

- `onCancel`：`cleanup()`、`deleteAudioInstance('uploaded')`、`revokeObjectURL(stream)`、清 input、`setAudioState('default')`。

---

## AudioContextManager 主要 API

| 方法 | 作用 |
|------|------|
| `switchToElementAndPlay(audio, defaultAudioRef?)` | 停麦克风、暂停上传（和默认），接上该 audio 并播放；切到上传时传默认 ref 以暂停默认 |
| `pauseAllElementSources(defaultAudioRef?)` | 暂停上传 + 默认；切到麦克风前调用 |
| `setupAudioContextAndPlay(audio)` | 仅确保 context、连接该 element、播放（不负责停其他路） |
| `closeAudioContext()` | 断开所有源、停止绘制、清空 canvas；不 close context |
| `create()` | 断开当前 element/stream 源，确保 context，准备接麦克风时用 |
| `createMediaStreamSource(stream)` | 断开当前 element 源，接上麦克风流 |
| `pauseAudio(key)` / `stopAudio(key)` | 按 key 暂停或停止（uploaded / mic） |
| `addAudioInstance(key, audio)` / `getAudioInstance(key)` / `deleteAudioInstance(key)` | 管理 `audioInstances` map |
| `cleanup()` | 同 `closeAudioContext()`，用于取消上传等 |
| `destroy()` | 断开所有、关闭 context、清空实例；仅在组件卸载时调用 |

---

## 设计要点小结

1. **单 Context、单 Analyser**：全局只一个 AudioContext 和一个 AnalyserNode，通过「断开/重连」切换音源，避免多 context 与重复 createMediaElementSource。
2. **Element Source 按元素缓存**：同一 `HTMLAudioElement` 只创建一次 `MediaElementAudioSourceNode`，后续复用，避免 InvalidStateError。
3. **切换前先停其他路**：播放默认/上传用 `switchToElementAndPlay`；切到麦克风前用 `pauseAllElementSources`，再 `closeAudioContext` + `create` + `createMediaStreamSource`。
4. **状态与音源一致**：用 `setAudioState(current)` 统一维护 `currentAudio`、`speaking`、`uploadedAudioPlaying`；上传区显隐只依赖「是否有上传文件」即 `this.stream` 是否有值，无需单独状态。
5. **上传播放时禁用说话**：`uploadedAudioPlaying === true` 时禁用「说话」按钮，避免两路同时占用。
