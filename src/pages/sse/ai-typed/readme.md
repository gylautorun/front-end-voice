# AI SSE 流式打字机与弱网优化

本文说明当前项目中 AI 流式打字机的设计与实现，重点解决以下问题：

- SSE 多次传输如何连续拼接，而不是覆盖或重新播放已有内容。
- Markdown 如何在流式阶段安全渲染。
- 网络断开、重复分片、后台积压和超时如何恢复。
- 打字速度如何与网络接收速度解耦。
- 代码高亮如何避免影响流式渲染性能。

核心思路是把网络接收和页面显示拆开，并为连接补齐可续传协议：

```text
服务端分片编号
  -> 前端持续接收并校验
  -> 写入内存缓冲区
  -> 打字机按固定频率消费
  -> 断线按最后序号续传
  -> 流结束后执行完整代码高亮
```

## 目录

1. [问题与目标](#1-问题与目标)
2. [整体架构](#2-整体架构)
3. [SSE 协议与断点续传](#3-sse-协议与断点续传)
4. [前端流式打字机](#4-前端流式打字机)
5. [Markdown 与代码高亮](#5-markdown-与代码高亮)
6. [弱网、后台与超时恢复](#6-弱网后台与超时恢复)
7. [服务端与网关](#7-服务端与网关)
8. [当前项目实现与运行方式](#8-当前项目实现与运行方式)
9. [验证清单](#9-验证清单)

## 1. 问题与目标

### 1.1 弱网流式输出的四个主要问题

| 问题 | 常见表现 | 关键处理方式 |
| --- | --- | --- |
| 回答残缺、断字 | 重连后少一段、汉字乱码、内容中间断层 | 流式解码、半包缓存、分片序号、断点续传 |
| 网络抖动 | SSE 反复重连、文字闪烁、整段重新显示 | 保留已有内容、增量追加、按序号去重 |
| 后台数据积压 | 切回页面后瞬间刷出大量内容，页面卡顿 | 接收与渲染分离、后台暂停渲染、前台分批追赶 |
| 超时无感知 | 页面长时间无变化，用户误以为卡死 | 心跳、空闲超时、状态机、有限次数指数退避 |

### 1.2 关于“网络丢分片”

基于 HTTP/TCP 时，底层丢包通常会自动重传。业务上看到的“分片丢失”更多来自：

- 连接中断后服务端无法从断点补发。
- 手写流读取时没有持续使用同一个 `TextDecoder`。
- 把一次网络 `read()` 错误地当成一条完整 SSE 事件。
- 没有缓存未结束的 SSE 半包。
- 重连时重新生成回答，导致新旧内容无法对齐。

因此目标不是保证连接永远不断，而是做到：

> 不丢、不重、可续、不卡，并且用户能感知当前状态。

## 2. 整体架构

### 2.1 三层文本状态

流式打字机的核心是区分下面三层状态：

| 状态 | 含义 | 更新时机 |
| --- | --- | --- |
| `received` | 已经通过序号校验的完整网络内容 | 每收到一个合法 SSE 分片时追加 |
| `pending` | 已收到但尚未显示的字符缓冲区 | SSE 到达时写入，打字机定时消费 |
| `displayed` | 已经交给 React 和 Markdown 渲染的内容 | 每个打字机周期批量追加 |

数据流如下：

```text
SSE delta
  -> messageId 校验
  -> seq 去重与连续性校验
  -> received
  -> pending
  -> 按字符速度批量消费
  -> displayed
  -> ReactMarkdown
```

每次 SSE 到达只追加到 `received` 和 `pending`，不能直接覆盖 `displayed`，也不要为每个分片重建消息组件。

### 2.2 连接状态机

```text
idle
  -> connecting
  -> streaming
  -> reconnecting -> streaming
  -> stalled -> reconnecting
  -> done
  -> failed
```

状态只用于表达连接和任务进度。进入 `reconnecting` 或 `stalled` 时必须保留：

- 已显示的 `displayed`。
- 尚未显示的 `pending`。
- 当前回答的 `messageId`。
- 最近成功接收的 `lastSeq`。

只有用户开始一条全新回答时才清空这些数据。

## 3. SSE 协议与断点续传

### 3.1 SSE 事件格式

服务端为每个事件提供 SSE `id`，并在 JSON 数据中提供消息 ID 和业务序号：

```text
id: 1
data: {"messageId":"msg_001","seq":1,"delta":"## 标题\n\n","done":false}

id: 2
data: {"messageId":"msg_001","seq":2,"delta":"这是一段 **Markdown** 内容。","done":false}

id: 3
data: {"messageId":"msg_001","seq":3,"delta":"","done":true}

```

字段说明：

| 字段 | 作用 |
| --- | --- |
| `id:` | SSE 标准事件 ID，原生 `EventSource` 重连时可通过 `Last-Event-ID` 携带 |
| `messageId` | 标识一次回答，避免不同回答串流，并让服务端复用同一份生成结果 |
| `type` | `delta` 表示正文增量，`done` 表示结束事件 |
| `scenario` | 当前模拟内容场景，例如 `comprehensive`、`formats`、`long`、`unicode`、`security` |
| `seq` | 从 1 连续递增的业务序号，用于去重、断层检测和补发 |
| `delta` | 本次新增文本，只包含增量，不包含之前已经发送的内容 |
| `done` | 表示服务端已经没有更多分片；前端缓冲区可能还未显示完 |
| `sentAt` | 服务端写出该分片的 ISO 时间，用于分析链路延迟 |
| `meta` | 首包和结束包携带的流元数据，包括内容哈希、总字符数、总分片数和连接次数 |
| `finishReason` | 结束原因，当前模拟服务正常完成时为 `stop` |

首包返回的 `meta` 示例：

```json
{
  "scenario": "comprehensive",
  "scenarioLabel": "综合 Markdown",
  "contentHash": "87f...sha256",
  "totalCharacters": 2140,
  "totalChunks": 108,
  "createdAt": "2026-07-14T03:00:00.000Z",
  "connection": 2,
  "resumedFrom": 12
}
```

重连前后的 `contentHash` 应保持一致。`connection` 会递增，`resumedFrom` 应等于客户端提交的 `lastSeq`。

### 3.2 前端序号规则

客户端维护 `lastSeq`：

- `seq <= lastSeq`：重复分片，直接丢弃。
- `seq === lastSeq + 1`：合法分片，追加到缓冲区。
- `seq > lastSeq + 1`：出现断层，不拼接当前分片，从 `lastSeq` 重新连接。
- `messageId` 不匹配：属于其他回答，直接丢弃。

```ts
if (chunk.messageId !== currentMessageId) return;
if (chunk.seq <= lastSeq) return;

if (chunk.seq !== lastSeq + 1) {
  reconnectFrom(lastSeq);
  return;
}

lastSeq = chunk.seq;
pending.push(...Array.from(chunk.delta));
```

`Array.from` 按 Unicode 字符拆分，可避免普通 emoji 被拆成两个 UTF-16 代理项。

### 3.3 断点续传

重连时携带相同的 `messageId` 和最近确认的 `lastSeq`：

```ts
const params = new URLSearchParams({
  messageId,
  lastSeq: String(lastSeq),
});

const source = new EventSource(`/api/sse-ai-typed/stream?${params}`);
```

服务端必须：

1. 读取查询参数 `lastSeq`，同时兼容请求头 `Last-Event-ID`。
2. 从第一条 `seq > lastSeq` 的缓存事件继续发送。
3. 同一个 `messageId` 不重新调用模型生成。
4. 短期保存事件分片或当前完整快照。

若服务端无法保存全部 delta，可以保存完整文本快照和版本号，重连时返回快照，让前端原位校准。

### 3.4 自定义 fetch 流时的 UTF-8 与半包处理

当前项目使用原生 `EventSource`，浏览器会处理 UTF-8 解码和 SSE 事件边界。如果改成 `fetch + ReadableStream`，网络 chunk 边界与汉字、SSE 事件边界没有关系，必须复用同一个 `TextDecoder` 并缓存半包：

```ts
const decoder = new TextDecoder();
let eventBuffer = '';

function consumeChunk(chunk: Uint8Array) {
  eventBuffer += decoder.decode(chunk, {stream: true});

  const events = eventBuffer.split('\n\n');
  eventBuffer = events.pop() ?? '';

  for (const event of events) {
    parseSSEEvent(event);
  }
}

// 流结束时刷新 TextDecoder 内部尚未输出的字节。
eventBuffer += decoder.decode();
```

生产环境建议使用成熟的 SSE parser，避免遗漏多行 `data:`、CRLF 和注释心跳等边界情况。

## 4. 前端流式打字机

### 4.1 网络接收与页面渲染解耦

不要每收到一个 token 就执行一次 React 状态更新。网络回调只写 ref 缓冲区：

```ts
if (chunk.delta) {
  receivedRef.current += chunk.delta;
  pendingRef.current.push(...Array.from(chunk.delta));
}
```

独立定时器再批量更新 `displayed`：

```ts
const batch = pendingRef.current.splice(0, count).join('');
setDisplayed((current) => current + batch);
```

关键是使用函数式追加：

```ts
// 错误：覆盖已经显示的内容。
setDisplayed(chunk.delta);

// 正确：只追加本次打字机消费的内容。
setDisplayed((previous) => previous + batch);
```

消息组件的 React `key` 必须使用稳定的 `messageId`，不要使用 `displayed` 或随机数，否则组件会被重新挂载并从头显示。

### 4.2 打字速度控制

当前实现将网络速度和显示速度拆成两个设置：

| 设置 | 作用 |
| --- | --- |
| 服务端分片间隔 | 控制模拟服务端多久发送一个 SSE delta，只影响网络到达速度 |
| 打字机速度 | 控制每秒从 `pending` 追加多少 Unicode 字符到 `displayed` |

当前默认参数：

| 常量 | 当前值 | 含义 |
| --- | --- | --- |
| `DEFAULT_TYPING_SPEED` | `36` | 默认每秒显示字符数 |
| `MIN_TYPING_SPEED` | `10` | 滑块最慢速度 |
| `MAX_TYPING_SPEED` | `100` | 滑块最快速度 |
| `TYPING_SPEED_STEP` | `2` | 每次调整的速度步长 |
| `TYPING_TICK_MS` | `50ms` | 缓冲区消费周期，最多每秒更新 React 20 次 |
| `BACKLOG_SNAPSHOT_THRESHOLD` | `2000` | 超过该积压量时直接追平 |

每个周期增加的字符额度为：

```ts
typingCredit += typingSpeed * TYPING_TICK_MS / 1000;
const count = Math.floor(typingCredit);
typingCredit -= count;
```

小数额度保留到下一周期，使 `10 字符/秒` 这样的低速设置仍然准确。没有待显示内容时要清空额度，避免下一批内容突然跳出多个字符。

### 4.3 积压追赶策略

普通情况下严格按照用户选择的打字速度显示。页面长时间处于后台时，可能积累大量内容：

- 小量积压：继续按当前打字速度显示。
- 中等积压：可以适当增加每帧消费量。
- 大量积压：直接提交快照，不补播全部打字动画。

当前示例在积压超过 `2000` 个字符时直接追平。生产环境也可以按字节数分级：

- 小于 `2KB`：正常追加。
- `2KB–20KB`：每帧追加固定数量字符。
- 超过 `20KB`：直接提交快照。

恢复时不要逐字播放所有积压内容，否则只是把网络卡顿转化成渲染卡顿。

### 4.4 打字光标

将光标作为 `ReactMarkdown` 的块级兄弟节点，会导致它出现在下一行。HAST 根节点在最后一个块元素之后还可能包含纯换行文本，如果把它误认为最后正文，光标也会被插到根节点并另起一行。

当前实现通过自定义 rehype 插件，从 HAST 末尾反向查找最后一个非空白字素。使用 `Intl.Segmenter` 保证中文、组合音标和 ZWJ emoji 作为完整字素处理，再把“最后一个字素 + 光标”放入同一个 `inline-block`：

```ts
function rehypeTypingCursor() {
  return (tree: HastNode): void => {
    insertCursorAfterLastText(tree);
  };
}
```

对应样式使用 `white-space: nowrap`。行尾空间不足时，最后一个字素和光标会作为整体换行，不会只有光标落到下一行。旧浏览器没有 `Intl.Segmenter` 时回退到 Unicode code point 拆分。

rehype transformer 只能原地修改语法树并返回 `undefined`，或者返回一棵新语法树。不能返回查找函数的布尔结果，否则 unified 会把 `true` 当作语法树，产生下面的错误：

```text
Cannot use 'in' operator to search for 'children' in true
```

光标只在连接和生成阶段显示，`idle`、`done`、`failed` 状态隐藏。

## 5. Markdown 与代码高亮

### 5.1 Markdown 处理链

当前页面使用以下依赖：

| 依赖 | 所处阶段 | 作用 | 不负责的功能 |
| --- | --- | --- | --- |
| `react-markdown` | React 渲染入口 | 解析 Markdown、组织 remark/rehype 处理链并生成 React 元素 | 不内置 GFM，也不内置代码语法高亮 |
| `remark-gfm` | Markdown AST（mdast） | 支持表格、删除线、任务列表和自动链接 | 不负责安全过滤和代码高亮 |
| `rehype-sanitize` | HTML AST（hast） | 删除危险标签和属性，降低 XSS 风险 | 不负责 Markdown 扩展语法和代码着色 |
| `rehype-highlight` | HTML AST（hast） | 使用 highlight.js 为代码生成语法 token class | 需要额外引入主题 CSS 才有颜色 |

实际处理链：

```text
displayed Markdown
  -> react-markdown 解析 mdast
  -> remark-gfm 扩展 GFM
  -> 转换为 hast
  -> rehype-sanitize 清理危险节点
  -> done 时 rehype-highlight 生成高亮节点
  -> streaming 时 rehypeTypingCursor 插入光标
  -> React 元素
```

基础用法：

```tsx
<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  rehypePlugins={[
    rehypeSanitize,
    ...(enableCodeHighlight ? [rehypeHighlight] : []),
    ...(showTypingCursor ? [rehypeTypingCursor] : []),
  ]}
>
  {displayed}
</ReactMarkdown>
```

不要用 `dangerouslySetInnerHTML` 直接渲染未经清洗的模型输出。

外部链接通过 `components.a` 自定义渲染，在新标签页打开，并添加安全属性：

```tsx
function MarkdownLink({href = '', children, ...props}) {
  const isExternal = /^(?:https?:)?\/\//i.test(href);

  return (
    <a
      {...props}
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener noreferrer' : undefined}
    >
      {children}
    </a>
  );
}

<ReactMarkdown components={{a: MarkdownLink}}>
  {displayed}
</ReactMarkdown>
```

- `https://...`、`http://...` 和 `//...` 外部链接在新标签页打开。
- `./readme.md`、`/path` 和 `#anchor` 保持当前页面导航。
- `noopener` 防止新页面通过 `window.opener` 控制原页面。
- `noreferrer` 不向目标页面发送来源地址。

### 5.2 流式 Markdown 的边界

流式过程中经常出现尚未闭合的语法：

```md
正在生成 **粗体
```

在收到后续 `**` 之前，Markdown 节点结构可能变化。这是语法本身决定的，不代表已有文字重新播放。

建议：

- 普通 Markdown 可以实时解析。
- Markdown 更新频率与网络 token 到达频率解耦。
- 完整语法高亮、LaTeX 和 Mermaid 尽量在流结束后执行。
- 超长回答可固化已经完成的块，只重新解析最后一个活动块。

### 5.3 `rehype-highlight` 工作原理

`rehype-highlight` 不直接处理 Markdown，而是在转换为 HAST 后查找：

```html
<pre>
  <code class="language-ts">...</code>
</pre>
```

Markdown 代码围栏中的语言名会变成 `language-*` class：

````md
```ts
const message: string = '高亮 TypeScript';
```
````

插件根据 `language-ts` 选择 TypeScript 规则，并生成：

```html
<code class="hljs language-ts">
  <span class="hljs-keyword">const</span>
  message = <span class="hljs-string">'hello'</span>;
</code>
```

职责分工：

- `rehype-highlight` 识别语法并生成 `hljs-*` class。
- highlight.js 主题 CSS 为这些 class 设置颜色。
- 只安装插件但不引入主题，通常看不到明显的语法颜色。

当前项目使用 GitHub Dark 主题：

```tsx
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
```

更换主题只需替换 CSS import，例如 `github.css` 或 `atom-one-dark.css`。

### 5.4 高亮配置

| 配置 | 默认值 | 作用 | 当前建议 |
| --- | --- | --- | --- |
| `detect` | `false` | 未声明语言时自动猜测 | AI 长回答可能增加 CPU 开销和误判，保持关闭 |
| `subset` | 默认语言集合 | 限制自动检测的候选语言 | 仅在开启 `detect` 时使用 |
| `plainText` | `[]` | 指定始终不高亮的语言 | 可加入 `text`、`txt`、`log` |
| `prefix` | `hljs-` | 修改生成 class 的前缀 | 一般不要修改，否则主题无法匹配 |
| `languages` | 常用语言集合 | 自定义注册语言并缩小范围 | 对包体积敏感时使用 |
| `aliases` | `{}` | 为语言增加别名 | 模型可能返回非标准语言名时使用 |

如需自动检测，应限制候选语言：

```tsx
<ReactMarkdown
  rehypePlugins={[
    rehypeSanitize,
    [rehypeHighlight, {
      detect: true,
      subset: ['javascript', 'typescript', 'json', 'css', 'bash'],
      plainText: ['text', 'txt'],
    }],
  ]}
>
  {displayed}
</ReactMarkdown>
```

当前页面没有开启 `detect`，推荐模型始终生成带语言名的代码围栏。

### 5.5 高亮与流式打字的结合

不建议每增加一个字符就执行完整高亮，因为 highlight.js 会反复分析尚未闭合的代码：

```tsx
const enableCodeHighlight = status === 'done';

rehypePlugins={[
  rehypeSanitize,
  ...(enableCodeHighlight ? [rehypeHighlight] : []),
  ...(showTypingCursor ? [rehypeTypingCursor] : []),
]}
```

当前时序：

```text
SSE 分片到达
  -> pending
  -> 按打字速度追加 displayed
  -> 流式阶段只解析 Markdown
  -> 收到 done
  -> pending 消费完毕
  -> status 变为 done
  -> 执行一次完整代码高亮
```

### 5.6 插件顺序与安全

当前顺序：

```text
rehype-sanitize -> rehype-highlight -> rehypeTypingCursor
```

- `rehype-sanitize` 先清理外部流内容产生的危险节点。
- `rehype-highlight` 对已清理的代码文本添加可信的 `span` 和 `hljs-*` class。
- `rehypeTypingCursor` 最后插入光标，避免光标 class 被默认清洗规则删除。

如果把 `rehype-highlight` 放到 `rehype-sanitize` 前面，默认 schema 可能删除高亮 class。此时必须扩展 schema，显式允许 `hljs`、`language-*` 和 `hljs-*`。

## 6. 弱网、后台与超时恢复

### 6.1 重连不重置 UI

连接断开时只更新状态，不清空当前回答，也不创建新的消息组件。恢复后继续向同一个 `displayed` 追加。

自动重连使用指数退避和随机抖动：

```ts
const delay = Math.min(8000, 700 * 2 ** retryCount)
  + Math.random() * 300;
```

当前最多自动重试 `5` 次。离线时不持续发请求，也不消耗重试额度；监听 `online` 事件后再恢复。

### 6.2 页面后台处理

浏览器进入后台后，定时器和渲染会被节流，移动端还可能直接终止连接。需要处理两种情况：

- 连接仍在：继续写入内存缓冲，但暂停频繁渲染。
- 连接已断：保留 `lastSeq`，页面恢复可见后断点续传。

```ts
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    resumeOrReconnect();
  }
});
```

流式期间避免每个字符调用平滑滚动。只在用户原本位于底部附近时自动跟随。

### 6.3 分级超时

不要只依赖浏览器请求超时。生产环境通常需要：

| 超时 | 建议范围 | 作用 |
| --- | --- | --- |
| 首包超时 | `15–30s` | 连接建立后长时间没有第一个业务事件 |
| 流空闲超时 | `20–30s` | 长时间没有正文或心跳 |
| 总时长上限 | 按业务设置 | 防止连接永久占用资源 |

当前前端已经实现三类超时：

| 常量 | 当前值 | 行为 |
| --- | --- | --- |
| `FIRST_CHUNK_TIMEOUT_MS` | `15s` | 当前连接没有收到首个业务分片时进入恢复；heartbeat 不算首包 |
| `STREAM_IDLE_TIMEOUT_MS` | `12s` | 没有正文或 heartbeat 时恢复连接 |
| `TOTAL_STREAM_TIMEOUT_MS` | `2min` | 整条回答超过上限后停止连接并进入失败状态 |

用户状态提示应明确：

- `连接较慢，正在等待`
- `网络已中断，正在恢复`
- `恢复失败，可从断点继续`
- `回答可能不完整，重新生成`

## 7. 服务端与网关

### 7.1 会话缓存

服务端按 `messageId` 缓存：

- 已生成的全部 `chunks`。
- 当前连接次数，用于首次断流模拟。
- 最近访问时间，用于过期回收。

同一个 `messageId` 重连时复用缓存，不能重新生成一份回答。当前演示每分钟扫描一次，并删除超过 10 分钟没有访问的会话。

生产环境如果需要多实例部署，应将缓存放到共享存储，例如 Redis，并设置 TTL；当前单进程演示不需要数据库。

### 7.2 SSE 响应头

```http
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

- `text/event-stream` 声明 SSE 响应。
- `no-cache, no-transform` 防止缓存或转换层聚合内容。
- `keep-alive` 保持长连接。
- `X-Accel-Buffering: no` 告诉 Nginx 不要缓冲。
- `flushHeaders()` 立即发送响应头，让浏览器尽快进入流式状态。

### 7.3 心跳与发送节奏

服务端需要定期发送心跳，心跳间隔应短于网关空闲超时：

```text
event: heartbeat
data: 1710000000000

```

不建议逐 token 发包。通常每 `20–50ms` 或积累一定字符后合并发送，在实时感和小包开销之间平衡。

### 7.4 代理与部署检查

如果数据经常停几秒后一次出现一大段，通常是代理缓冲。需要检查：

- Nginx `proxy_buffering off`。
- CDN 是否聚合小响应。
- gzip/Brotli 是否延迟 flush。
- 服务端是否及时 flush。
- Serverless 平台是否真正支持流式响应。
- 网关空闲超时是否大于心跳间隔。

## 8. 当前项目实现与运行方式

### 8.1 文件职责

| 文件 | 职责 |
| --- | --- |
| [`index.tsx`](./index.tsx) | SSE 连接、序号校验、重连、打字缓冲、Markdown、高亮和光标 |
| [`style.module.scss`](./style.module.scss) | 页面布局、Markdown、代码块、光标和响应式样式 |
| [`../../../site-map.tsx`](../../../site-map.tsx) | 侧边栏菜单配置 |
| [`../../../routes.ts`](../../../routes.ts) | 页面懒加载路由 |
| [`../../../../vite.config.ts`](../../../../vite.config.ts) | `/api/sse-ai-typed` 开发代理 |
| [`../../../../server/sse-ai-typed/app.js`](../../../../server/sse-ai-typed/app.js) | SSE 会话缓存、模拟数据、心跳、断流和续传 |
| [`../../../../server/sse-ai-typed/mock-data.js`](../../../../server/sse-ai-typed/mock-data.js) | 综合、Markdown 全格式、长文本、Unicode 和安全清洗模拟数据 |
| [`../../../../server/sse-ai-typed/app.test.js`](../../../../server/sse-ai-typed/app.test.js) | Node 原生测试，真实读取 HTTP/SSE 流并验证协议 |

### 8.2 启动后端

在项目根目录执行：

```bash
cd server
npm run sse:ai-typed
```

默认服务地址：

```text
http://localhost:8082/api/sse-ai-typed/stream
```

可通过环境变量覆盖端口：

```bash
PORT=8085 npm run sse:ai-typed
```

### 8.3 启动前端

```bash
pnpm run dev
```

页面地址：

```text
http://localhost:9527/sse/ai-typed
```

Vite 将 `/api/sse-ai-typed` 转发到本地 SSE 服务，因此前端使用相对 URL，不需要硬编码后端域名。

### 8.4 演示参数

页面提供：

- 模拟内容：切换综合 Markdown、Markdown 全格式、长文本、Unicode 和安全清洗场景。
- 服务端分片间隔：模拟不同网络到达频率。
- 打字机速度：实时控制每秒显示字符数。
- 首次连接模拟断流：验证保留内容并从 `lastSeq` 继续。
- 暂停/继续：关闭当前连接并保留断点，继续时恢复。
- 接收、显示、SEQ 指标：观察网络缓冲和页面追赶状态。

Node 还提供场景发现接口：

```text
GET /api/sse-ai-typed/scenarios
```

每个场景的覆盖范围：

| 场景 | 内容与验证重点 |
| --- | --- |
| `comprehensive` | GFM 表格、任务列表、删除线、引用、链接、TS/JSON/Bash/CSS 代码块和 Unicode |
| `formats` | 六级标题、强调、换行、转义、嵌套列表、引用、URL、邮箱、引用式链接、图片、对齐表格及多语言代码块 |
| `long` | 18 个长章节，用于验证后台积压、打字速度和快照追赶 |
| `unicode` | 中文、代理项、组合字符、ZWJ emoji、多语言文本和无损重建 |
| `security` | `script`、事件属性、危险协议链接、正常 Markdown 和 HTML 代码围栏 |

## 9. 验证清单

### 9.1 执行自动化验证

```bash
cd server
npm run test:sse-ai-typed
```

测试使用 Node 内置 `node:test`，会在随机本地端口启动真实 Express 服务并读取 SSE 响应。目前包含 8 项：

| 自动化测试 | 验证内容 |
| --- | --- |
| 模拟场景完整性 | 五种场景存在，全格式数据包含 URL、图片、表格和多语言代码块，安全场景包含危险输入 |
| Unicode 分片重建 | `seq` 从 1 连续递增，全部 delta 可逐字符还原，无传输产生的替换字符 |
| 场景发现接口 | 返回默认场景、名称、描述和字符数 |
| 完整 SSE | 响应头、连续 SSE id、完整正文、首包 meta、done 和内容哈希 |
| 查询参数续传 | 同一 `messageId` 复用原场景，从 `lastSeq + 1` 开始，无重复事件 |
| 标准请求头续传 | `Last-Event-ID` 也能从下一条事件继续 |
| 强制断流恢复 | 首次连接中途断开，按客户端最后收到的 seq 重连后可无损拼回全文 |
| 心跳 | 正文发送间隔较长时收到结构化 heartbeat |

### 9.2 已由 Node 自动测试验证

- [x] `seq` 从 1 连续递增。
- [x] 重连响应不包含 `seq <= lastSeq` 的重复事件。
- [x] 查询参数 `lastSeq` 和请求头 `Last-Event-ID` 均从下一条事件开始。
- [x] 同一 `messageId` 重连时复用原场景和 `contentHash`，不会重新生成。
- [x] 首次连接主动断开后可以连续恢复并无损重建全文。
- [x] Unicode 内容跨不规则分片后与原文完全一致。
- [x] SSE 返回 `no-cache, no-transform` 和 `X-Accel-Buffering: no`。
- [x] 首包和 done 返回总字符数、总分片数、内容哈希、连接次数和续传位置。
- [x] 长间隔正文期间会发送结构化 heartbeat。

### 9.3 前端浏览器验收

下面项目依赖 React DOM、页面可见性或浏览器网络状态，不能由 Node SSE 测试代替：

- [ ] 序号断层不会直接拼接，UI 进入恢复状态。
- [ ] SSE 到达只写缓冲区，不直接逐 token 更新 React。
- [ ] `displayed` 始终函数式追加，不覆盖已有内容。
- [ ] 调整打字速度不会改变服务端分片速度。
- [ ] 长文本场景进入后台后不频繁渲染，恢复后不会长时间补播。
- [ ] 光标紧跟最后一个字符，不单独换行。
- [ ] GFM 表格、删除线和任务列表能够解析。
- [ ] 安全清洗场景中的脚本、事件属性和危险链接不会执行。
- [ ] 流式阶段不反复执行完整代码高亮。
- [ ] `done` 后带语言标记的代码块出现语法颜色。
- [ ] 首包、流空闲和总时长超时能进入对应恢复或失败状态。
- [ ] 浏览器离线期间不持续重试，恢复在线后继续连接。
- [ ] 自动重试达到上限后停止。

### 9.4 真实部署环境验收

这些项目必须在实际 Nginx、CDN 或 Serverless 环境验证：

- [ ] heartbeat 间隔小于网关空闲超时。
- [ ] 浏览器关闭连接后，Node 连接定时器被清理。
- [ ] Nginx 已设置 `proxy_buffering off`。
- [ ] CDN 和 gzip/Brotli 不会聚合 SSE 小响应。
- [ ] 连续运行时会话缓存按 TTL 回收，进程内存保持稳定。

最终推荐链路：

```text
模型输出
  -> 服务端 20–50ms 合批
  -> messageId + seq 编号
  -> SSE 及时 flush
  -> 前端持续接收并校验
  -> pending 内存缓冲
  -> 50ms 批量更新 displayed
  -> 断线按 lastSeq 续传
  -> pending 清空后完成 Markdown 与代码高亮
```
