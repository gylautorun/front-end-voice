# AI SSE 流式打字机面试整理

本文基于当前 `src/pages/sse/ai-typed` 和 `server/sse-ai-typed` 实现，整理成可直接用于面试的回答。重点不是背 API，而是说明为什么这样设计、解决了什么问题、相对其他方案有什么优势，以及生产环境还需要补什么。

## 1. 30 秒回答

> 我实现了一个基于 SSE 的 AI 流式打字机。服务端把完整回答切成带 `messageId` 和连续 `seq` 的增量事件，并缓存分片用于断点续传。前端没有在每个网络分片到达时直接更新正文，而是使用 `received -> pending -> displayed` 三层状态，把网络接收和打字动画解耦，再按固定频率批量更新 React。连接中断后使用相同 `messageId` 和最后确认的 `lastSeq` 恢复，客户端同时负责去重和断层检测。Markdown 在流式阶段只做基础解析，等内容完全显示后再执行代码高亮，并通过安全清洗防止 XSS。这样能够同时解决弱网续传、频繁渲染、打字速度不可控和 Markdown 高亮卡顿问题。

## 2. 两分钟完整回答

这个功能主要解决四类问题：

1. AI 输出是流式的，如果每到一个 token 就 `setState`，React 会频繁渲染，Markdown 也会被反复完整解析。
2. 网络速度不稳定，如果打字速度直接跟着网络分片走，页面会忽快忽慢，甚至一段一段跳出来。
3. SSE 断线后可能重复收到旧事件，也可能重新生成回答，因此仅靠字符串追加不能保证内容正确。
4. Markdown 代码高亮、GFM 和安全清洗都需要额外处理，尤其高亮不适合每个字符执行。

我的实现分为三层：

- 传输层：支持原生 `EventSource` 和 `@microsoft/fetch-event-source` 两种客户端，对应 Node 原生 `res.write()` 和 `better-sse`。
- 业务流层：统一处理 `messageId`、`seq`、去重、断层、超时、重连和可重放会话。
- 展示层：网络数据先进入内存缓冲，打字机按固定周期消费，再交给 Markdown 渲染。

断线时不会清空已有正文。客户端保存最后确认的 `lastSeq`，按照指数退避重新连接；服务端从第一条 `seq > lastSeq` 的缓存事件继续发送。收到 `done` 只表示网络完成，必须等 `pending` 全部显示完，页面才进入最终完成状态并执行代码高亮。

## 3. 问题拆解

### 3.1 为什么逐 token 更新 React 会卡

最直接的写法通常是：

```ts
source.onmessage = (event) => {
  const chunk = JSON.parse(event.data);
  setDisplayed((current) => current + chunk.delta);
};
```

这段代码逻辑上没有错，但有三个性能问题：

- 每个网络事件都触发 React 更新，网络事件越碎，渲染次数越多。
- `react-markdown` 会重新解析不断增长的完整字符串，成本不是只处理新增字符。
- 未闭合的 Markdown 和代码围栏会不断改变语法树，造成 DOM 结构反复变化。

当前方案让网络回调只追加正文缓冲，正文 DOM 最多每 `50ms` 更新一次，从网络频率变成可控的渲染频率。

### 3.2 为什么网络速度不能等于打字速度

网络分片速度受模型、服务端合批、代理缓冲和网络质量影响。直接按网络到达展示会产生：

- 网络快时整段跳出。
- 网络慢时长时间停顿。
- 重连后缓存分片快速补发，页面瞬间刷出大量内容。

因此需要把它们拆成两个时钟：

```text
网络时钟：决定 pending 增长多快
显示时钟：决定 displayed 增长多快
```

用户调整打字速度时，只影响 `pending -> displayed`，不会修改服务端分片间隔。

### 3.3 为什么 TCP 可靠还需要业务序号

TCP 保证单条连接内字节有序可靠，但无法解决：

- HTTP 连接已经断开，客户端不知道服务端最后成功写到了哪里。
- 服务端已经 `write`，但客户端可能还没有解析出完整 SSE 事件。
- 重连时服务端可能重放旧事件。
- 相同请求可能重新生成不同回答。
- 多实例环境中可能命中不同服务节点。

所以需要业务级协议：

```text
messageId + seq + lastSeq + 可重放缓存
```

## 4. 整体架构

```text
Node 回答/模拟数据
  -> createChunks：生成连续 seq
  -> session-store：按 messageId 缓存
  -> native-sse / plugin-sse
  -> SSE id + JSON payload
  -> 前端 transport adapter
  -> messageId 与 seq 校验
  -> received
  -> pending
  -> 50ms 定时批量消费
  -> displayed
  -> ReactMarkdown
  -> done 后代码高亮
```

前端模块边界：

```text
index.tsx
  -> hooks/use-ai-typed-stream.ts   状态机和缓冲
  -> view.tsx                       页面视图
       -> stream-markdown/          Markdown 与光标
  -> transports/                    两种 SSE 适配器
  -> config/                        配置和协议类型
```

后端模块边界：

```text
app.js                              应用入口和依赖注入
  -> utils/service.js               Express 路由组装
  -> utils/session-store.js         会话缓存与 TTL
  -> utils/stream-protocol.js       分片和共享协议
  -> routes/native-sse.js           res.write 实现
  -> routes/plugin-sse.js           better-sse 实现
```

## 5. 核心原理

### 5.1 SSE 的工作方式

SSE 是基于 HTTP 的服务端单向推送。响应使用：

```http
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

事件格式：

```text
id: 12
event: message
data: {"messageId":"message-1","seq":12,"delta":"新增文本","done":false}

```

SSE 的优势是协议简单、浏览器原生支持、天然适合服务端到客户端的 AI 文本输出，并且能使用普通 HTTP 基础设施。

### 5.2 三层文本状态

| 状态          | 含义                            | 是否触发正文渲染 |
| ------------- | ------------------------------- | ---------------- |
| `received`  | 已通过序号校验的完整网络正文    | 否               |
| `pending`   | 已收到但尚未展示的字符队列      | 否               |
| `displayed` | 已交给 React 和 Markdown 的正文 | 是               |

网络回调：

```ts
receivedRef.current += chunk.delta;
pendingRef.current.push(...Array.from(chunk.delta));
```

打字定时器：

```ts
const batch = pendingRef.current.splice(0, count).join('');
setDisplayed((current) => current + batch);
```

这里使用函数式更新，避免定时器闭包读取旧的 `displayed`，也避免并发更新互相覆盖。

### 5.3 打字速度计算

打字速度使用“字符额度”而不是每次固定一个字符：

```ts
typingCredit += typingSpeed * tickMs / 1000;
const count = Math.floor(typingCredit);
typingCredit -= count;
```

例如速度是每秒 10 字符，周期是 `50ms`，每次只获得 `0.5` 个字符额度。第一个周期不输出，第二个周期累计为 1，再输出一个字符。这样低速也能保持准确。

当前主要参数：

| 参数         | 值              |
| ------------ | --------------- |
| 默认打字速度 | 50 字符/秒      |
| 速度范围     | 10～500 字符/秒 |
| 消费周期     | 50ms            |
| 积压快照阈值 | 2000 字符       |

页面处于后台时停止正文渲染，但网络仍可继续写入缓冲。恢复可见后，如果积压超过阈值就直接追平，避免补播几分钟动画。

### 5.4 序号校验

```ts
if (chunk.messageId !== currentMessageId) return;
if (chunk.seq <= lastSeq) return;

if (chunk.seq !== lastSeq + 1) {
  reconnectFrom(lastSeq);
  return;
}

lastSeq = chunk.seq;
```

规则：

- `seq <= lastSeq`：重复事件，丢弃。
- `seq === lastSeq + 1`：合法增量，追加。
- `seq > lastSeq + 1`：出现断层，不能直接拼接。
- `messageId` 不一致：属于其他回答，丢弃。

### 5.5 断点续传

重连必须保持相同 `messageId`，并提交客户端实际确认的 `lastSeq`：

```text
GET /stream?messageId=message-1&lastSeq=12
```

服务端从第一条 `seq > 12` 的缓存分片继续。不能使用服务端“已经调用 write 的数量”作为客户端断点，因为最后一次写入可能在断线时没有形成客户端可解析的完整事件。

### 5.6 自定义重连状态机

原生 `EventSource` 有自动重连，但当前项目让公共 Hook 接管重连：

```text
disconnect
  -> 关闭旧连接
  -> 检查 mounted / done / paused
  -> 离线时等待 online
  -> 检查重试上限
  -> 指数退避 + 随机抖动
  -> 使用 lastSeq 新建连接
```

这样原生和插件模式能够共享：

- 有限次数重试。
- 首包超时、流空闲超时和总时长上限。
- 离线停止重试。
- 暂停和恢复。
- 统一业务断点协议。

### 5.7 Markdown 与代码高亮

处理链：

```text
Markdown
  -> react-markdown
  -> remark-gfm
  -> rehype-sanitize
  -> done 后 rehype-highlight
  -> 流式阶段 rehypeTypingCursor
  -> React DOM
```

只在 `status === 'done'` 后执行代码高亮，因为流式代码块经常没有闭合。每增加一个字符就高亮，会让 highlight.js 反复分析越来越长的代码。

安全方面使用 `rehype-sanitize` 清理危险节点和属性；外部链接增加：

```html
target="_blank" rel="noopener noreferrer"
```

### 5.8 光标为什么容易掉到下一行

如果把光标放在 `ReactMarkdown` 后面，它是 Markdown 块元素的兄弟节点，很容易独占下一行。

当前实现从 HAST 末尾反向查找最后一个可见字素，把“最后一个字素 + 光标”放进同一个 `inline-block`，并设置 `white-space: nowrap`。

使用 `Intl.Segmenter` 是为了避免把组合音标或 ZWJ emoji 从中间切开，例如：

```text
👨‍👩‍👧‍👦
```

## 6. 前端实现映射

| 文件                                  | 面试时说明的职责                           |
| ------------------------------------- | ------------------------------------------ |
| `index.tsx`                         | 只组合 Hook 和 View                        |
| `hooks/use-ai-typed-stream.ts`      | 缓冲、序号、超时、重连、打字机状态机       |
| `view.tsx`                          | 控件、状态、指标和页面结构                 |
| `transports/native-event-source.ts` | 封装原生 EventSource                       |
| `transports/fetch-event-source.ts`  | 封装 fetch-event-source 和 AbortController |
| `transports/index.ts`               | 根据模式选择 endpoint 和适配器             |
| `stream-markdown/index.tsx`         | Markdown、安全、高亮和光标                 |
| `config/index.ts`                   | 速度、超时、重试次数等参数                 |
| `config/types.ts`                   | 分片协议、状态和元数据类型                 |

传输适配器统一暴露：

```ts
interface StreamConnectionCallbacks {
  onOpen(): void;
  onMessage(data: string): void;
  onHeartbeat(): void;
  onDisconnect(): void;
}

interface StreamConnection {
  close(): void;
}
```

因此业务 Hook 不需要知道底层使用的是 `EventSource.close()` 还是 `AbortController.abort()`。

## 7. 后端实现映射

### 7.1 可重放会话

服务端按 `messageId` 缓存：

- 完整内容。
- 内容哈希。
- 全部分片。
- 连接次数。
- 创建时间和最近访问时间。

缓存默认保留 10 分钟，每分钟扫描一次过期会话。

### 7.2 为什么使用依赖注入

`utils/session-store.js` 不直接依赖 `mock-data.js`。由 `app.js` 注入：

```js
createStreamServiceFactory(options, {
  defaultScenario,
  buildScenarioAnswer,
  listScenarios,
});
```

优势：

- 工具层不依赖具体模拟数据。
- 可替换为数据库、Redis 或真实模型生成器。
- 测试时容易传入可控数据源。
- 依赖方向从应用层指向工具层，模块边界更清晰。

### 7.3 两种 Node 写流方式

原生方式：

```js
res.write(`id: ${chunk.seq}\n`);
res.write(`data: ${JSON.stringify(payload)}\n\n`);
```

插件方式：

```js
betterSession.push(payload, 'message', String(chunk.seq));
```

两者只在协议文本写出方式上不同，会话缓存、业务 payload、`seq` 和续传规则完全共用。

## 8. 与其他实现方式对比

### 8.1 与“每个 token 直接 setState”对比

| 对比项         | 逐 token setState | 当前缓冲方案        |
| -------------- | ----------------- | ------------------- |
| React 更新频率 | 跟随网络事件      | 固定最多约 20 次/秒 |
| 显示速度       | 受网络影响        | 用户可控            |
| 重连补发       | 容易瞬间刷屏      | 继续按缓冲策略消费  |
| Markdown 解析  | 每个 token 触发   | 按显示周期触发      |
| 实现复杂度     | 低                | 较高，但行为稳定    |

### 8.2 与完全依赖 EventSource 自动重连对比

| 对比项          | 内置自动重连           | 当前业务重连     |
| --------------- | ---------------------- | ---------------- |
| 重试次数上限    | 不易统一控制           | 可控制           |
| 指数退避和抖动  | 主要依赖 retry         | 前端统一实现     |
| 离线暂停        | 需要额外处理           | 已纳入状态机     |
| 同一回答幂等    | 不能只靠 Last-Event-ID | 使用 messageId   |
| 断层检测        | 不负责                 | 使用 seq 校验    |
| 原生/插件一致性 | 两套行为               | 共用一套业务逻辑 |

### 8.3 与手写 fetch + ReadableStream 对比

手写 fetch 流需要自行正确处理：

- `TextDecoder` 的流式解码。
- 网络半包。
- CRLF 和多行 `data:`。
- `id`、`event`、`retry` 和注释帧。
- AbortSignal 和重试。

当前使用成熟解析器降低协议边界错误。只有在需要 POST、特殊鉴权或完全自定义流协议时，才值得手写或使用 fetch SSE 插件。

### 8.4 与 WebSocket 对比

| 对比项     | SSE                    | WebSocket          |
| ---------- | ---------------------- | ------------------ |
| 通信方向   | 服务端到客户端         | 双向               |
| 协议       | 普通 HTTP 流           | WebSocket 升级协议 |
| 浏览器 API | EventSource            | WebSocket          |
| 文本流场景 | 非常适合               | 可以，但能力偏重   |
| 代理和鉴权 | 通常复用 HTTP 基础设施 | 需要网关支持升级   |
| 自动重连   | EventSource 有基础能力 | 通常自行实现       |

AI 文本回答主要是单向推送，所以 SSE 更简单。如果需要客户端高频双向交互、语音实时帧或多人协作，再考虑 WebSocket。

### 8.5 与轮询对比

轮询需要客户端不断发请求，会产生额外请求头、延迟和服务端压力。SSE 保持一条长连接，服务端有数据时立即推送，更适合持续生成的回答。

## 9. 当前方案的优点

### 9.1 正确性

- 使用 `messageId` 保证同一回答幂等。
- 使用 `seq` 去重并检测断层。
- 使用 `lastSeq` 精确续传。
- 使用内容哈希检查重连前后是否为同一份回答。
- Unicode 分片按 code point 处理，避免普通代理项乱码。

### 9.2 性能

- 网络接收不直接驱动正文逐分片渲染。
- React 正文更新频率受 `TYPING_TICK_MS` 控制。
- Markdown 高亮推迟到完成阶段。
- 后台页面暂停正文渲染。
- 大量积压直接追平，避免长时间补动画。

### 9.3 可维护性

- View 和 Hook 分离。
- Markdown 子组件独立。
- 原生和插件传输使用统一接口。
- 两种 Node 路由共享协议和缓存。
- 模拟数据通过应用入口注入工具层。

### 9.4 用户体验

- 打字速度稳定，不受网络抖动直接影响。
- 断线时保留已经显示的内容。
- 页面显示连接、恢复、停滞和失败状态。
- 光标跟随最后一个可见字符。
- Markdown、表格、任务列表和代码高亮可正常展示。

## 10. 超时与弱网策略

| 策略       | 当前值                   | 目的                         |
| ---------- | ------------------------ | ---------------------------- |
| 首包超时   | 15 秒                    | 避免连接建立后一直无业务数据 |
| 流空闲超时 | 12 秒                    | 避免连接无正文也无心跳       |
| 总时长上限 | 2 分钟                   | 避免任务永久占用连接         |
| 最大重试   | 5 次                     | 避免服务异常时无限请求       |
| 重试延迟   | 指数退避 + 0～300ms 抖动 | 避免多个客户端同时重连       |
| 服务端心跳 | 默认 5 秒                | 保持连接并穿过空闲超时       |

随机抖动用于避免“惊群”：当服务恢复时，大量客户端不会在同一毫秒同时重连。

## 11. 测试思路

当前 Node 集成测试覆盖：

- `seq` 连续递增。
- Unicode 分片无损重建。
- 原生 SSE 响应头和完整流。
- 查询参数 `lastSeq` 续传。
- `Last-Event-ID` 请求头续传。
- 原生路由强制断流恢复。
- 结构化 heartbeat。
- better-sse 完整流。
- better-sse 静态断点续传。
- better-sse 异常断流恢复。

浏览器层还应使用 Playwright 验证：

- 页面离线和恢复在线。
- 页面切到后台后的渲染次数。
- 光标实际位置。
- GFM 和高亮的最终 DOM。
- 危险 Markdown 不执行脚本。
- 自动重试达到上限。

## 12. 当前实现的局限

面试中主动说明边界比声称“全部解决”更可信。

### 12.1 会话缓存是单进程内存

进程重启后续传数据会丢失，多实例也无法天然共享。生产环境应使用 Redis、数据库或支持 TTL 的共享缓存，并考虑：

- `messageId` 路由一致性。
- 分片列表或快照存储。
- 原子更新最后状态。
- 过期和容量控制。

### 12.2 重试次数是“连续建连失败”上限

当前连接成功后会把重试计数归零。如果服务端每次都成功 `open`，随后立刻断开，可能持续重连。更严格的生产方案应区分：

- 连续建连失败次数。
- 整个回答生命周期累计重连次数。
- 短时间内断开次数。

### 12.3 插件 keep-alive 是注释帧

`better-sse` 默认发送注释型 keep-alive，能够保持 HTTP 链路，但 `fetch-event-source` 不一定把注释暴露给业务 `onmessage`。当前演示正文间隔不超过空闲阈值，因此不受影响；生产环境可以增加结构化 heartbeat 事件供前端空闲计时器观察。

### 12.4 打字队列按 code point 消费

`Array.from` 能避免拆开 UTF-16 代理项，但 ZWJ emoji 可能由多个 code point 组成。光标定位已经使用 `Intl.Segmenter`，如果要求打字过程中也绝不短暂显示半个组合字素，`pending` 也应改成按 grapheme 分段。

### 12.5 部署配置尚需真实环境验证

代码设置了反缓冲响应头，但仍需验证：

- Nginx `proxy_buffering off`。
- CDN 是否聚合小包。
- gzip/Brotli 是否延迟 flush。
- Serverless 平台是否支持真正的流式响应。
- 网关空闲超时是否大于心跳间隔。

## 13. 常见面试追问

### 13.1 为什么选择 SSE，而不是 WebSocket？

AI 文本回答主要是服务端单向推送，SSE 基于普通 HTTP，协议和部署更简单，浏览器原生支持事件 ID 和基础重连。WebSocket 更适合高频双向通信，在这里只会增加连接管理复杂度。

### 13.2 SSE 只能使用 GET 吗？

原生 `EventSource` API 只方便发 GET，不能自定义请求体和大多数 header。需要 POST、Authorization header 或自定义请求时，可以使用 fetch-event-source，或者先 POST 创建任务，再用 EventSource GET 订阅任务流。

### 13.3 为什么同时需要 SSE id 和 JSON seq？

SSE `id` 服务于传输协议和 `Last-Event-ID`；JSON `seq` 服务于业务校验。显式业务序号便于跨客户端、跨插件、日志和测试统一验证，也能检测断层，而不仅是告诉服务端最后 ID。

### 13.4 为什么不能只保存完整字符串？

只保存完整字符串也可以做快照恢复，但增量续传时需要计算差异和版本一致性。保存分片能直接从 `lastSeq + 1` 重放。生产环境可以根据成本选择“分片日志 + 周期快照”的组合。

### 13.5 为什么收到 done 后页面还没有立即完成？

`done` 表示网络不再发送数据，但 `pending` 中可能还有未显示字符。必须等打字缓冲清空后再进入最终 `done`，否则会提前隐藏光标和执行高亮。

### 13.6 为什么高亮放到最后？

代码块在流式阶段可能未闭合，高亮器会反复解析越来越长的代码，CPU 成本高且 DOM 不稳定。完成后一次性高亮能够显著减少工作量。

### 13.7 页面切到后台怎么办？

后台定时器会被浏览器节流，所以正文渲染暂停，网络数据继续进入缓冲。恢复可见后继续消费；积压太多时直接追平，避免播放大量历史动画。如果连接已经断开，则从 `lastSeq` 恢复。

### 13.8 如何避免重复内容？

客户端丢弃所有 `seq <= lastSeq` 的事件，服务端重连只返回 `seq > lastSeq`。两侧同时约束，能够防御重放和并发重连造成的重复。

### 13.9 如何处理丢失分片？

收到 `seq > lastSeq + 1` 时不直接拼接，因为正文已经出现空洞。关闭当前连接，从最后合法的 `lastSeq` 重新请求缓存事件。

### 13.10 如何支持多实例？

将会话和分片放入 Redis 等共享存储，或者使用一致性路由让同一 `messageId` 命中同一实例。还需要处理实例故障、TTL、容量上限和分片写入原子性。

### 13.11 如何量化优化效果？

可以记录：

- 每秒网络事件数。
- 每秒 React commit 次数。
- Markdown 解析耗时。
- pending 最大长度。
- 首包时间和端到端完成时间。
- 重连次数和恢复耗时。
- 长任务数量与页面掉帧率。

优化目标不是只看“感觉不卡”，而是把网络频率和 React commit 频率从一一对应变成受控批量更新。

### 13.12 如果回答非常长怎么办？

可以进一步采用：

- 已完成 Markdown 块固化，只解析最后活动块。
- 虚拟化历史消息。
- 分段快照和增量日志。
- Web Worker 处理复杂解析。
- 限制单次回答长度和缓存容量。

## 14. STAR 项目表达

### Situation

AI 流式回答在弱网下会出现输出忽快忽慢、重连重复、Markdown 高频解析卡顿和光标错位。

### Task

设计一个能稳定展示 Markdown、支持断点续传、打字速度可控，并且兼容原生与插件 SSE 的方案。

### Action

- 设计 `messageId + seq + lastSeq` 协议和服务端可重放缓存。
- 使用三层文本状态解耦网络接收与 React 渲染。
- 使用固定周期和字符额度实现平滑打字。
- 增加指数退避、离线检测、三类超时和心跳。
- 抽象两种前后端传输适配器，共享业务逻辑。
- 将 Markdown 清洗、GFM、结束后高亮和字素级光标独立封装。
- 使用真实 HTTP 流集成测试验证原生和插件断流恢复。

### Result

正文渲染频率不再跟随 token 数量，打字速度与网络速度独立；连接中断后能从客户端最后确认序号继续，已有内容不会重播；Markdown 安全、高亮和光标行为也得到统一处理。

## 15. 白板答题关键词

只写关键词容易变成技术名词堆砌。白板答题应该按照“问题 -> 架构 -> 正确性 -> 性能 -> 弱网 -> 边界”的顺序，让面试官看到完整推导过程。

### 15.1 开场话术

可以这样开始：

> 这个需求表面上是 AI 打字机，实际上包含两个不同问题。第一个是网络流是否正确，也就是断线后能不能做到不丢、不重、可续；第二个是 UI 是否稳定，也就是网络分片再快、再抖，页面都不能逐 token 高频渲染。所以我的设计会把传输可靠性和渲染调度分开讨论。

这句话先明确你解决的不是单纯动画，而是数据流正确性和渲染性能。

### 15.2 第一张图：先画完整链路

白板先画一条主链：

```text
模型/服务端
  -> SSE 分片
  -> 传输适配器
  -> 序号校验
  -> pending 缓冲
  -> 打字调度器
  -> displayed
  -> Markdown DOM
```

对应话术：

> 整条链路我分成三层。最左侧是服务端传输层，负责生成可重放的 SSE 分片；中间是前端业务流层，负责 `messageId`、序号校验和断点恢复；最右侧是展示层，负责按稳定速度消费缓冲并渲染 Markdown。三层只通过明确的数据结构通信，不让 EventSource 回调直接控制页面动画。

### 15.3 第二张图：解释三层文本状态

在前端部分画三个框：

```text
received -> pending -> displayed
```

话术：

> 我不会在每次 SSE 到达时直接修改正文，而是维护三层文本状态。`received` 表示已经通过业务序号校验的完整内容；`pending` 表示网络已经收到、但打字机还没显示的字符队列；`displayed` 才是交给 ReactMarkdown 的内容。网络只负责让 pending 增长，打字定时器负责让 displayed 增长，所以网络速度和打字速度互不影响。

继续说明为什么这样做：

> 如果每个 token 都直接 `setState`，React 更新次数会和网络事件数一一对应，而且 ReactMarkdown 会反复解析越来越长的完整字符串。改成固定 `50ms` 批量消费后，正文更新频率最多约 20 次每秒，网络即使瞬间补发很多分片，也只会先进入缓冲，不会直接造成 UI 跳动。

面试官追问低速为什么准确，可以回答：

> 我使用字符额度累计，而不是每个 tick 固定输出一个字符。比如每秒 10 个字符、tick 是 50ms，每次获得 0.5 个字符额度，累计到整数再消费，因此低速不会因为取整而失真。

### 15.4 第三张图：解释业务断点续传

在服务端和客户端之间画：

```text
messageId = answer-001

seq: 1  2  3  4  5 ... done
                ^
             lastSeq=4
```

话术：

> TCP 只能保证单条连接内字节可靠，连接断开以后，业务层仍然不知道客户端最后完整解析到了哪个事件。所以每个回答有稳定的 `messageId`，每个业务分片有连续的 `seq`，客户端只在完整解析并校验成功后更新 `lastSeq`。

然后讲三条校验规则：

> 如果 `seq <= lastSeq`，说明是重复事件，直接丢弃；如果 `seq === lastSeq + 1`，说明连续，可以追加；如果 `seq > lastSeq + 1`，说明中间有断层，这个分片不能直接拼接，必须从最后合法序号重新请求。

重连话术：

> 重连时保持相同 `messageId`，并提交客户端实际确认的 `lastSeq`。服务端不是重新调用模型，而是复用该 messageId 对应的分片缓存，从第一条 `seq > lastSeq` 的事件继续发送。

这里可以强调一个容易加分的细节：

> 断点必须以客户端最后完整解析的序号为准，不能用服务端已经调用 `write` 的次数。因为服务端 write 成功只表示数据进入了底层缓冲，不代表浏览器已经拿到并解析成完整 SSE 事件。

### 15.5 第四张图：解释重连状态机

```text
streaming
  -> disconnect
  -> close old connection
  -> offline? wait online
  -> retry limit?
  -> exponential backoff + jitter
  -> reconnect(lastSeq)
```

话术：

> 原生 EventSource 虽然有自动重连，但我没有完全依赖它，因为我还需要统一控制最大重试次数、离线暂停、三类超时和 fetch SSE 插件模式。因此两种传输只负责通知 `onDisconnect`，真正的恢复策略由公共 Hook 处理。

解释指数退避：

> 重试延迟按 700ms、1.4s、2.8s 逐步增加，并加入 0 到 300ms 的随机抖动。退避避免服务不可用时持续打满接口，抖动避免大量客户端在服务恢复后同一时间重连形成惊群。

解释三类超时：

> 我把超时拆成首包超时、流空闲超时和任务总时长。首包超时判断连接建立后是否一直没有业务数据；流空闲超时判断生成过程中是否既没有正文也没有心跳；总时长则防止一条回答永久占用连接。

### 15.6 第五张图：解释 Markdown 渲染策略

```text
displayed
  -> react-markdown
  -> remark-gfm
  -> rehype-sanitize
  -> done 后 rehype-highlight
  -> streaming 时 cursor plugin
```

话术：

> Markdown 解析也分阶段。GFM 负责表格、任务列表和删除线；sanitize 负责过滤危险节点和属性；代码高亮只在网络完成且 pending 消费完后执行。因为流式代码块经常未闭合，如果每增加一个字符都运行 highlight.js，会反复分析越来越长的代码，既浪费 CPU，也会让 DOM 结构不稳定。

光标话术：

> 光标不能简单放在 ReactMarkdown 后面，否则它是块级兄弟节点，很容易掉到下一行。我会从 HAST 末尾找到最后一个可见字素，把最后字素和光标放在同一个 `inline-block` 中，并用 `Intl.Segmenter` 避免拆开组合字符或 ZWJ emoji。

### 15.7 解释为什么选择 SSE

面试官问为什么不用 WebSocket，可以回答：

> 这个场景的核心是服务端向客户端单向推送文本，SSE 基于普通 HTTP，浏览器原生支持，能复用现有鉴权、代理和网关体系，协议复杂度比 WebSocket 低。WebSocket 更适合高频双向通信，例如语音帧、协同编辑或实时游戏。这里使用 WebSocket 能实现，但能力偏重。

如果追问原生 EventSource 的限制：

> 原生 EventSource 适合简单 GET 流，但不方便自定义 header、POST body 和响应状态校验。因此项目同时封装 fetch-event-source；它支持 AbortController 和自定义请求，但两种实现最终复用同一个业务序号和缓冲状态机。

### 15.8 解释方案优势

不要只说“性能更好”，可以按四个维度回答：

> 正确性上，`messageId + seq + lastSeq` 保证回答幂等、事件去重和断层恢复；性能上，三层缓冲把正文更新限制为固定批次，高亮延迟到完成阶段；体验上，打字速度不受网络抖动影响，断线也不会清空已有内容；维护性上，原生和插件传输使用统一适配器，View、状态 Hook、Markdown 和 Node 路由都有独立边界。

### 15.9 主动说明生产边界

话术：

> 当前演示的会话缓存是单进程 Map，适合验证协议，但生产多实例需要 Redis 或数据库共享分片和 TTL。代码已经设置 `no-transform` 和 `X-Accel-Buffering: no`，不过 Nginx、CDN 和压缩层是否真正不缓冲，仍然必须在部署环境验证。另外，当前重试上限主要限制连续建连失败；如果连接每次成功后马上断开，还需要增加整个回答生命周期的累计重连上限。

主动说明边界不会减分，反而表明你清楚演示代码与生产系统的区别。

### 15.10 三分钟完整口述版本

下面这段可以直接练习：

> 这个项目表面上是 AI 打字机，但我主要解决的是流式数据的正确性和 React 渲染性能。
>
> 服务端会把一条完整回答切成多个 SSE 增量，每个回答有稳定的 messageId，每个分片有从 1 连续递增的 seq。服务端按 messageId 缓存分片，因此客户端断线后可以携带最后确认的 lastSeq，从下一条分片继续，而不是重新生成整条回答。
>
> 客户端收到事件以后先做三类校验：messageId 不一致直接丢弃；seq 小于等于 lastSeq 说明重复，直接去重；seq 大于 lastSeq 加一说明出现断层，不能直接拼接，需要从最后合法序号恢复。这里使用客户端实际解析成功的序号作为断点，而不是服务端 write 的数量，因为 write 不代表浏览器已经收到完整事件。
>
> 在渲染层，我没有每收到一个 token 就更新正文，而是维护 received、pending 和 displayed 三层状态。网络回调只把合法正文写入 pending，独立的 50ms 定时器按照用户设置的字符速度批量追加 displayed。这样网络速度和打字速度解耦，React 正文更新最多约 20 次每秒，重连后即使快速补发很多数据，也不会让页面瞬间刷屏。
>
> Markdown 使用 react-markdown 和 GFM，外部内容先做 sanitize。代码高亮只在服务端 done 且 pending 消费完成后执行，避免对未闭合代码块反复高亮。光标则通过 HAST 插件插入最后一个可见字素后面，并使用 Intl.Segmenter 处理组合字符。
>
> 弱网方面，两种传输都交给公共 Hook 处理重连，支持离线暂停、指数退避、随机抖动、最大重试，以及首包、空闲和总时长三类超时。原生 EventSource 和 fetch-event-source 只负责不同的底层连接方式，业务协议和状态机完全复用。
>
> 相比逐 token setState，这个方案的渲染频率更稳定；相比只依赖 EventSource 自动重连，它能保证同一回答幂等并检测业务断层；相比 WebSocket，SSE 更适合当前单向文本推送场景。生产环境下一步需要把单进程缓存替换为 Redis，并验证 Nginx、CDN 和压缩层不会缓冲流式响应。

### 15.11 一分钟压缩版本

> 我把 AI 流式回答拆成传输、业务流和展示三层。服务端为每个回答生成 messageId 和连续 seq，并缓存分片；客户端用 lastSeq 去重、检测断层和断点续传。前端使用 received、pending、displayed 三层缓冲，让网络只负责接收，50ms 调度器负责稳定打字，因此不会每个 token 都触发正文渲染。Markdown 流式阶段只做基础解析和安全清洗，pending 清空后再执行代码高亮。连接层支持原生 EventSource 和 fetch SSE，并统一实现离线检测、三类超时、指数退避与有限重试。核心价值是把不稳定的网络增量转换成可校验、可恢复、可控速率的 UI 数据流。

### 15.12 关键词检查清单

完成口述后，可以用下面的关键词检查是否有遗漏：

```text
SSE / text-event-stream
messageId / seq / lastSeq
幂等 / 去重 / 断层 / 重放
received / pending / displayed
批量更新 / 函数式 setState
指数退避 / jitter / heartbeat / timeout
EventSource / fetch-event-source / AbortController
ReactMarkdown / GFM / sanitize / highlight
Intl.Segmenter / grapheme
TTL / Redis / proxy buffering
```

最终收尾：

> 将不稳定的网络增量转换成可校验、可恢复、可控速率的 UI 数据流。

## 16. 如何写在简历上

### 16.1 项目名称

可以根据简历整体风格选择：

- AI 流式回答与弱网续传方案
- 基于 SSE 的 AI Markdown 流式渲染系统
- AI 对话流式打字机与断点续传优化
- SSE 流式传输与前端渲染性能优化

不要只写“打字机效果”。打字动画只是表面功能，真正有技术价值的是协议可靠性、渲染调度、弱网恢复和 Markdown 性能优化。

### 16.2 技术栈

```text
React 18、TypeScript、SSE、EventSource、fetch-event-source、
Node.js、Express、better-sse、ReactMarkdown、remark-gfm、
rehype-sanitize、rehype-highlight、highlight.js
```

简历空间有限时可以缩短为：

```text
React + TypeScript + SSE + Node.js + Express + ReactMarkdown
```

### 16.3 一句话项目描述

> 设计并实现 AI Markdown 流式回答方案，通过业务分片序号、可重放会话和前端分层缓冲，实现弱网断点续传、稳定打字速度与低频批量渲染。

更偏前端岗位：

> 实现 React AI 流式回答组件，将 SSE 网络接收与页面渲染解耦，解决逐 token 更新导致的频繁渲染、Markdown 重复解析和弱网输出跳动问题。

更偏全栈岗位：

> 搭建 React + Node.js SSE 流式回答链路，设计 `messageId + seq + lastSeq` 续传协议，并实现服务端分片缓存、心跳、超时和两种 SSE 传输适配。

### 16.4 推荐简历版本

下面这版适合直接放在项目经历中：

**AI 流式回答与弱网续传方案**技术栈：React、TypeScript、SSE、Node.js、Express、ReactMarkdown

- 设计 `messageId + seq + lastSeq` 业务协议和服务端可重放分片缓存，实现重复事件去重、序号断层检测及连接中断后的增量续传，避免回答重新生成或重复展示。
- 设计 `received -> pending -> displayed` 三层文本状态，将 SSE 接收频率与 React 渲染频率解耦，使用 `50ms` 定时批量消费和字符额度算法实现可调速、稳定的打字效果。
- 将 Markdown 安全清洗、GFM 解析与代码高亮分阶段执行，流式阶段避免反复运行 highlight.js，待缓冲区消费完成后再执行完整语法高亮。
- 封装原生 `EventSource` 与 `fetch-event-source` 统一传输接口，并在 Node 端同时实现 Express 原生 SSE 与 `better-sse` 路由，共享会话、序号和续传逻辑。
- 补充首包、流空闲、总时长超时，结合心跳、离线检测、指数退避和随机抖动提升弱网恢复能力；使用真实 HTTP 流集成测试覆盖原生及插件断流续传。

### 16.5 精简版简历描述

简历空间只允许 3 条时使用：

- 基于 SSE 实现 AI Markdown 流式回答，设计 `messageId + seq + lastSeq` 协议及可重放缓存，支持事件去重、断层检测和弱网断点续传。
- 使用三层文本缓冲和 `50ms` 批量调度解耦网络与 React 渲染，实现独立可调的打字速度，并避免逐 token 更新造成的 Markdown 高频解析。
- 封装原生/插件两套 SSE 适配器，补充心跳、三类超时、离线恢复及指数退避，集成 GFM、安全清洗与完成后代码高亮。

### 16.6 校招或初级前端写法

重点说明实现过程和技术理解，不要堆过多架构词：

- 使用 React、TypeScript 和 EventSource 实现 AI 回答流式展示，支持 Markdown 表格、任务列表和代码高亮。
- 通过内存缓冲和定时批量更新实现可调速打字效果，避免每个 SSE 分片直接触发正文渲染。
- 使用分片序号记录接收进度，连接断开后从最后序号继续，并增加重复分片过滤和超时重试。

### 16.7 中高级前端写法

重点说明设计决策、边界和可扩展性：

- 负责 AI 流式渲染链路设计，以业务序号和可重放日志补足 EventSource 内置重连的幂等与断层校验能力，实现跨原生/Fetch SSE 的统一恢复语义。
- 将网络 IO、业务流状态和 Markdown 视图拆分为传输适配器、状态 Hook 与独立渲染组件，降低两种传输实现对业务层的侵入。
- 通过批量调度、后台积压快照、完成后高亮和字素级光标定位优化长文本输出体验，并建立真实 HTTP 流集成测试覆盖异常断流恢复。

### 16.8 全栈岗位写法

- 设计 React + Express SSE 全链路方案，服务端按 `messageId` 缓存带连续序号的增量分片，客户端按最后确认序号执行幂等续传。
- 抽象 Express 原生 SSE 与 `better-sse` 两套路由，共享请求解析、payload、会话缓存和模拟断流规则；通过依赖注入隔离模拟数据与通用协议工具。
- 实现响应反缓冲头、heartbeat、连接关闭清理和 TTL 回收，并通过 Node 集成测试验证响应头、Unicode 重建及原生/插件异常恢复。

### 16.9 如何添加量化结果

没有采集数据时不要编造“性能提升 80%”。可以先通过 React Profiler、Performance API 或埋点获得真实指标，再替换下面的占位符：

```text
- 将正文 React 更新频率从平均每秒 [网络事件数] 次降低到最多约 20 次，
  长回答场景主线程长任务减少 [X%]。

- 在 [弱网配置] 下完成 [N] 次断流恢复测试，最终内容哈希一致，
  重复分片展示次数为 0。

- 将 [N] 字符 Markdown 回答的流式阶段高亮次数从 [原次数] 降为完成后 1 次，
  流式阶段平均脚本耗时降低 [Xms/X%]。
```

当前代码本身可以直接说明的确定性指标：

- 正文缓冲消费周期为 `50ms`，理论上正文更新最多约 20 次/秒。
- 自动重试上限配置为 5 次连续失败。
- 首包、空闲和总时长超时分别为 15 秒、12 秒和 2 分钟。
- 服务端会话默认保留 10 分钟，每分钟扫描一次过期数据。
- Node 集成测试覆盖 11 个协议和恢复场景。

### 16.10 简历中应避免的写法

不推荐：

```text
- 使用 SSE 实现了打字机效果。
- 使用 ReactMarkdown 展示 AI 内容。
- 优化了页面性能，提升了用户体验。
```

问题是只描述了技术名词或结果，没有说明难点、方案和可验证价值。

推荐改成：

```text
- 使用三层文本缓冲和固定周期批量调度解耦 SSE 接收与 React 渲染，
  解决逐分片更新导致的 Markdown 高频解析和输出速度抖动。
```

同时避免以下过度表述：

- 不要写“保证数据绝不丢失”，当前缓存仍是单进程内存。
- 不要写“支持无限重连”，有限重试才是更合理的故障策略。
- 不要写“已解决所有 Nginx/CDN 缓冲问题”，除非真实部署环境已经验证。
- 不要写“完全按字素播放”，当前正文队列主要按 Unicode code point 消费。

### 16.11 面试官看到简历后可能继续追问

准备好回答：

1. 为什么不用 WebSocket？
2. TCP 已经可靠，为什么还需要 `seq`？
3. 服务端已经 write 的序号为什么不能直接作为客户端断点？
4. 为什么收到 `done` 后不能立即结束 UI？
5. 如何证明 React 渲染次数减少？
6. 多实例部署后会话缓存放在哪里？
7. EventSource 内置重连为什么不够？
8. Markdown 高亮为什么只在最后执行？
9. 如何处理 ZWJ emoji 和组合字符？
10. Nginx 或 CDN 缓冲 SSE 时如何排查？

这些问题的答案都可以从本文前面的原理、对比和局限章节展开。
