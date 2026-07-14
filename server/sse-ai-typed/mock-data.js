/**
 * 模拟不同类型的 AI 回答，用于验证 Markdown 全格式、Unicode、长文本积压和安全清洗。
 * 每个 build 都返回新字符串，服务端会按 messageId 缓存最终结果。
 */
const scenarioDefinitions = {
    // 综合场景：一次覆盖常用 GFM、代码语言、链接、Unicode 和协议说明。
    comprehensive: {
        // label 供前端下拉框和流 meta 展示。
        label: '综合 Markdown',
        // description 说明该场景的验证范围。
        description: '覆盖 GFM、代码块、Unicode、引用、链接和多段结构。',
        // build 延迟生成完整回答，避免模块加载时长期持有所有大字符串。
        build: () => `## AI 流式传输诊断报告

本回答用于验证 **SSE 增量拼接**、Markdown 渲染和断点续传。当前链路将网络接收与页面显示解耦，避免每个 token 都触发 React 更新。

### 本次检查范围

- [x] 连续序号与重复分片过滤
- [x] 断线后从 \`lastSeq\` 继续
- [x] GFM 表格、任务列表与删除线
- [x] TypeScript、JSON、Bash 和 CSS 代码围栏
- [ ] 真实 CDN 与 Nginx 配置需要部署后检查

> 连接可能中断，但同一个 \`messageId\` 对应的回答不会重新生成。客户端保留已经显示的内容，并继续消费尚未显示的缓冲区。

| 指标 | 当前策略 | 目的 |
| --- | --- | --- |
| 分片标识 | \`messageId + seq\` | 去重和断层检测 |
| 页面刷新 | 50ms 合批 | 降低 React 更新频率 |
| 自动恢复 | 指数退避 + 随机抖动 | 避免重试风暴 |
| 代码高亮 | 流结束后执行 | 避免逐字符重复分析 |

### TypeScript 示例

\`\`\`ts
interface StreamChunk {
  messageId: string;
  scenario: string;
  seq: number;
  delta: string;
  done: boolean;
}

function acceptChunk(chunk: StreamChunk, lastSeq: number) {
  if (chunk.seq <= lastSeq) return 'duplicate';
  if (chunk.seq !== lastSeq + 1) return 'gap';
  return 'append';
}
\`\`\`

### JSON 元数据

\`\`\`json
{
  "finishReason": "stop",
  "contentHash": "sha256",
  "totalCharacters": 2048,
  "resumedFrom": 12
}
\`\`\`

### 运维命令

\`\`\`bash
curl -N "http://localhost:8082/api/sse-ai-typed/stream?messageId=demo&scenario=comprehensive"
nginx -t
\`\`\`

### 样式示例

\`\`\`css
.streaming-answer {
  overflow-wrap: anywhere;
  contain: layout paint;
}
\`\`\`

### Unicode 边界

中文不会因为网络 chunk 边界而缺字。普通 emoji 使用 Array.from 可避免拆开 UTF-16 代理项：🚀、✅、🌍。组合字符和 ZWJ 序列还包括 cafe\u0301、👨‍👩‍👧‍👦、🏳️‍🌈。

你也可以查看 [MDN EventSource](https://developer.mozilla.org/docs/Web/API/EventSource) 了解浏览器原生 SSE 行为。~~重连时清空 UI~~ 是错误做法，正确方式是原位续写。

### 最终结论

只要服务端保存可重放分片，客户端严格校验连续序号，并将网络接收与显示缓冲分开，短暂断网就不会导致回答重复、缺失或从头播放。`,
    },
    // 全格式场景：集中覆盖 AI 回答中可能出现的 CommonMark、GFM、URL 和媒体格式。
    formats: {
        label: 'Markdown 全格式',
        description: '覆盖标题、强调、列表、引用、链接、图片、表格和多语言代码块。',
        build: () => {
            // Markdown 反引号通过变量插入，避免与 JavaScript 模板字符串边界冲突。
            const codeFence = '```';
            const inlineMarker = '`';
            const markdownEscape = String.fromCharCode(92);

            return `# 一级标题：Markdown 全格式

## 二级标题

### 三级标题

#### 四级标题

##### 五级标题

###### 六级标题

Setext 一级标题
===============

Setext 二级标题
---------------

## 文本与行内语法

普通段落可以包含 *斜体*、**粗体**、***粗斜体***、~~删除线~~、上文提到的普通文本，以及 ${inlineMarker}const inlineCode = true${inlineMarker} 行内代码。

使用反斜杠显示 Markdown 字面符号：${markdownEscape}*不是斜体${markdownEscape}*、${markdownEscape}# 不是标题、${markdownEscape}[不是链接${markdownEscape}]。

软换行只在源码中换行，通常仍属于同一段落。
这一行与上一行之间是软换行。

硬换行使用行尾反斜杠${markdownEscape}
这一行应该从新行开始显示。

下面是水平分隔线：

---

## URL、链接与邮箱

- 普通链接：[OpenAI](https://openai.com/ "OpenAI 官网")
- 带查询参数和锚点：[SSE 查询示例](https://example.com/api/stream?messageId=msg_001&lastSeq=12#response)
- URL 编码：[中文搜索](https://example.com/search?q=%E6%B5%81%E5%BC%8F%E8%BE%93%E5%87%BA&lang=zh-CN)
- 站内相对链接：[当前说明文档](./readme.md)
- 页面锚点：[跳转到代码块](#多语言代码块)
- 尖括号自动链接：<https://developer.mozilla.org/docs/Web/API/EventSource>
- GFM 裸 URL：https://example.com/docs/streaming/sse
- 邮箱自动链接：<stream-team@example.com>
- 引用式链接：[WHATWG Server-Sent Events][sse-standard]
- 简写引用链接：[MDN EventSource][]

[sse-standard]: https://html.spec.whatwg.org/multipage/server-sent-events.html "SSE 标准"
[MDN EventSource]: https://developer.mozilla.org/docs/Web/API/EventSource

## 图片

带替代文本和标题的远程图片：

![用于验证 Markdown 图片的随机示例](https://picsum.photos/seed/ai-sse-stream/720/320 "AI SSE 图片示例")

图片加载失败或被网络策略阻止时，必须显示 alt 文本，且不能影响后续流式内容。

## 列表

无序列表支持不同标记和嵌套：

- 第一项
  - 二级项目 A
    - 三级项目
  - 二级项目 B
- 第二项包含 **粗体** 和 [链接](https://example.com/list-item)

有序列表：

1. 建立 SSE 连接
2. 校验分片
   1. 校验 messageId
   2. 校验 seq
3. 写入显示缓冲

任务列表：

- [x] 已接收首包
- [x] 已验证连续序号
- [ ] 等待流结束

## 引用

> 一级引用可以包含 **Markdown**。
>
> > 二级嵌套引用包含 [参考链接](https://example.com/quote)。
>
> - 引用中的列表项
> - 第二个列表项

## 对齐表格

| 左对齐 | 居中 | 右对齐 | 混合内容 |
| :--- | :---: | ---: | --- |
| alpha | center | 100 | **粗体** |
| beta | 中文 | 2,048 | [详情](https://example.com/table?id=2) |
| gamma | ${inlineMarker}inline${inlineMarker} | 99.5% | ~~旧值~~ 新值 |

## 多语言代码块

### JavaScript

${codeFence}javascript
const source = new EventSource('/api/sse-ai-typed/stream');
source.onmessage = ({data}) => console.log(JSON.parse(data));
${codeFence}

### TSX

${codeFence}tsx
export function Status({done}: {done: boolean}) {
  return <span>{done ? '完成' : '生成中'}</span>;
}
${codeFence}

### Python

${codeFence}python
def resume_stream(message_id: str, last_seq: int) -> dict:
    return {"messageId": message_id, "lastSeq": last_seq}
${codeFence}

### SQL

${codeFence}sql
SELECT message_id, MAX(seq) AS last_seq
FROM stream_chunks
GROUP BY message_id;
${codeFence}

### YAML

${codeFence}yaml
sse:
  heartbeatMs: 5000
  retry:
    maxAttempts: 5
${codeFence}

### Diff

${codeFence}diff
- setDisplayed(chunk.delta)
+ setDisplayed((current) => current + batch)
${codeFence}

### Mermaid 源码

${codeFence}mermaid
flowchart LR
  SSE --> Pending
  Pending --> Displayed
${codeFence}

当前项目会把 Mermaid 当作普通代码块高亮，不会执行图表渲染。

## 特殊字符与边界

- HTML 实体作为文本：&lt;div&gt;safe text&lt;/div&gt;
- 括号与 URL：https://example.com/a_(b)/c
- 标点：中文，English, 日本語。Emoji：🔗 🖼️ 📋
- 很长的 URL：https://example.com/reports/2026/streaming-performance/details?environment=production&region=asia-east&feature=sse-typed-markdown

## 当前未启用的扩展

数学公式、脚注、定义列表和 Mermaid 图表渲染不属于 ${inlineMarker}remark-gfm${inlineMarker} 的能力。没有安装对应插件时，下列内容应作为普通文本或普通代码显示，而不是产生运行时错误：

- 数学源码：$E = mc^2$
- 脚注源码：[^stream-note]
- Mermaid：保留为带 ${inlineMarker}language-mermaid${inlineMarker} 的代码块

格式场景结束。最终的段落、链接或图片之后，打字机光标都应紧跟最后一个可见字素。`;
        },
    },
    // 长文本场景：制造超过前端积压阈值的数据量。
    long: {
        label: '长文本积压',
        description: '生成多章节长回答，用于验证后台积压和快速追赶。',
        build: () => {
            // 18 个带独立序号的章节既保持内容可核验，也达到约 5KB 压力规模。
            const sections = Array.from({length: 18}, (_, index) => `### 性能观察 ${index + 1}

第 ${index + 1} 段用于制造稳定的长文本缓冲。网络层持续接收增量，页面层按照用户设置的字符速度消费。页面进入后台时停止频繁渲染，恢复可见后根据积压量决定继续动画还是直接提交快照。

| 序号 | 网络职责 | 渲染职责 |
| --- | --- | --- |
| ${index + 1} | 校验 messageId 与 seq，写入 pending | 从 pending 批量追加到 displayed |

\`\`\`ts
const section${index + 1} = {
  pending: true,
  strategy: 'buffer-then-render',
};
\`\`\``);

            return `## 长回答与后台积压压力测试

本场景包含 ${sections.length} 个重复结构但内容序号不同的章节，用于观察缓冲区增长、打字速度控制和超过阈值后的快照追赶。

${sections.join('\n\n')}

## 压力测试完成

所有章节已经生成。前端应在 pending 清空后再进入 done，并只在完成状态执行一次完整语法高亮。`;
        },
    },
    // Unicode 场景：验证 code point 分片与多语言内容无损重建。
    unicode: {
        label: 'Unicode 边界',
        description: '覆盖中文、代理项、组合字符、ZWJ emoji 和多语言文本。',
        build: () => `## Unicode 与分片边界验证

### 中文

弱网环境下仍应完整显示：春江潮水连海平，海上明月共潮生。

### Emoji 与组合字符

- 普通 emoji：😀 😎 🚀 🧠 ✅
- 肤色修饰：👋🏽 👍🏿
- ZWJ 家庭：👨‍👩‍👧‍👦 👩‍💻
- 国旗与彩虹旗：🇨🇳 🇺🇳 🏳️‍🌈
- 组合音标：cafe\u0301, nai\u0308ve, A\u030A

### 多语言

- English: Streaming text remains continuous.
- 日本語：ストリーミング表示を確認します。
- 한국어: 스트리밍 텍스트를 확인합니다.
- العربية: اختبار عرض النص المتدفق.

\`\`\`js
const codePoints = Array.from('👨‍👩‍👧‍👦');
console.log(codePoints.length, codePoints.join(''));
\`\`\`

最终拼接后的字符串必须与服务端原文逐字符一致，不能出现 Unicode 替换字符。`,
    },
    // 安全场景：输入危险 HTML，交由前端 Markdown 安全链路过滤。
    security: {
        label: '安全清洗',
        description: '包含潜在危险 HTML 和正常 Markdown，用于验证 sanitize。',
        build: () => `## Markdown 安全清洗验证

下面的内容模拟模型意外返回 HTML。页面不能执行其中的脚本或事件属性：

<script>window.__unsafe_stream_script__ = true;</script>

<img src="invalid-image" onerror="window.__unsafe_stream_image__ = true" alt="危险图片测试">

<a href="javascript:alert('unsafe')">危险协议链接</a>

正常 Markdown 必须继续工作：

- **粗体内容**
- [安全链接](https://example.com)
- \`<code>textContent</code>\`

\`\`\`html
<button onclick="alert('code blocks must stay text')">代码示例</button>
\`\`\`

安全目标：危险 HTML 不执行，代码围栏内容保持纯文本，普通 Markdown 正常渲染。`,
    },
};

const DEFAULT_SCENARIO = 'comprehensive';

/** 非法或未知场景统一回退到综合场景，保证接口始终可响应。 */
function resolveScenario(scenarioId) {
    return scenarioDefinitions[scenarioId] ? scenarioId : DEFAULT_SCENARIO;
}

/**
 * 生成指定场景的一份完整回答。
 * 返回值包含场景元数据和 content；真正的会话缓存由 app.js 管理。
 */
function buildScenarioAnswer(scenarioId) {
    const resolvedId = resolveScenario(scenarioId);
    return {
        // 规范化后的场景 ID。
        id: resolvedId,
        // 合并 label、description 和 build，便于调用方保留定义信息。
        ...scenarioDefinitions[resolvedId],
        // build 的结果才是后续分片的原始正文。
        content: scenarioDefinitions[resolvedId].build(),
    };
}

/** 返回不含 build 函数的场景摘要，供 JSON 发现接口使用。 */
function listScenarios() {
    return Object.entries(scenarioDefinitions).map(([id, definition]) => ({
        // 场景稳定 ID，作为 stream 查询参数。
        id,
        // 前端可读名称。
        label: definition.label,
        // 场景验证目的。
        description: definition.description,
        // Unicode code point 数量，帮助判断数据规模。
        characters: Array.from(definition.build()).length,
    }));
}

module.exports = {
    DEFAULT_SCENARIO,
    buildScenarioAnswer,
    listScenarios,
    resolveScenario,
};
