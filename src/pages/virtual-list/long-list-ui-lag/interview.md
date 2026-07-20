
# React 长列表不卡顿：面试回答手册

这份文档对应当前目录中的 React 18 实现，可以直接作为面试口述稿使用。回答时先讲问题和决策，再讲算法细节，最后说明边界和取舍。不要一上来堆 `ResizeObserver`、`Fenwick Tree`、 ``requestAnimationFrame``等名词。

## 1. 一句话总结

> 我把完整列表拆成逻辑数据、滚动坐标和可见 DOM 三层：
>
> - 固定高度用 O(1) 公式计算窗口，不定高度用预估高度、ResizeObserver 和稀疏 Fenwick Tree 做 O(log n) 修正；
> - React 滚动热路径通过 passive scroll 和 requestAnimationFrame 每帧最多提交一次状态；
> - 超大数据再通过物理、逻辑坐标压缩绕过浏览器最大元素高度限制。

## 2. 30 秒回答

面试官问：“长列表为什么卡，你怎么解决？”

可以直接回答：

> 长列表卡顿不是一个点的问题，主要有四类成本：全量 DOM 创建、滚动事件高频触发 React 更新、不定高度反复测量导致布局修正，以及浏览器无法承载数千万像素以上的占位元素。
>
> 我的方案首先只渲染视口和 overscan（预渲染缓冲区） 区域。
>
> - 固定高度通过 `scrollTop / itemHeight` 以 O(1) 计算起止索引；
> - 不定高度先用预估高度，DOM 挂载后由 ResizeObserver 获取真实高度，再通过稀疏Fenwick Tree 以 O(log n) 更新累计偏移和定位项目。
> - 滚动事件只写 ref，在 rAF 中每帧最多提交一次 React 状态。
> - 数据量特别大时，再把浏览器物理滚动高度限制在安全值，用比例映射到完整逻辑坐标。
> - 这样 DOM 数量与总条数解耦，滚动计算也不会线性扫描完整列表

## 3. 两分钟标准回答

> 我先分析卡顿来源，而不是直接套虚拟列表库。浏览器一帧通常只有 16.7ms，如果一次创建几万个 DOM，或者每次 scroll 都 setState，主线程会持续做 React reconciliation、style、layout 和 paint，滚动就会掉帧。
>
> 第一层是减少工作量。页面只保留一个产生滚动条的占位层，以及一个包含视口附近少量节点的可见层。可见层使用 `translate3d` 移到它在完整列表中的逻辑位置。
>
> 第二层按高度模型选择算法。固定高度的索引和偏移都可以直接计算，时间复杂度是 O(1)。不定高度在项目进入 DOM 前没有真实高度，所以先用预估值；当前窗口挂载后使用 ResizeObserver 测量。普通前缀和虽然查询快，但改一项高度要更新后面所有前缀，单次是 O(n)。我使用 Fenwick Tree，让单项高度更新、前缀偏移查询和根据 scrollTop 定位项目都保持 O(log n)。
>
> 当前实现进一步使用稀疏 Fenwick Tree。10 亿条只是逻辑数量，不创建 10 亿长度的高度数组；未测量项的高度通过 `index * estimatedHeight` 隐式计算，Map 只保存实际浏览过项目相对预估值的高度差。因此内存取决于已测量项目数，而不是逻辑总条数。
>
> 第三层控制 React 更新。原生 scroll 监听是 passive 的，事件中只记录最新位置，同一帧内无论触发多少次都只申请一个 requestAnimationFrame，在帧回调中更新 React 状态。固定高度还会根据每帧滚动距离，把 overscan 控制在 6 到 28 条之间。
>
> 第四层处理浏览器边界。浏览器对单元素高度有限制，所以我将物理占位高度限制为 800 万像素，同时维护 physicalScrollTop 和 logicalScrollTop，通过可滚动距离比例映射。虚拟模型始终使用逻辑坐标查询，DOM 只使用安全的物理坐标。
>
> 最后我会明确边界：这个 Demo 的十亿条数据可由索引推导，不代表真实加载十亿条业务对象。生产系统仍应结合服务端分页、搜索和游标加载。

## 4. 我是如何拆分设计的

```text
浏览器输入层
scroll / ResizeObserver
        ↓
React 适配层
ref / rAF / Set / Hook 生命周期
        ↓
框架无关核心层
FixedHeightVirtualizer
DynamicHeightVirtualizer
scroll-coordinate
        ↓
视图层
占位层 + translate3d 可见层 + 少量行 DOM
```

目录职责：

| 目录或文件                                    | 职责                           | 为什么这样拆                       |
| --------------------------------------------- | ------------------------------ | ---------------------------------- |
| `core/fixed-height-virtualizer.ts`          | 固定高区间计算                 | 纯数学模型，可独立测试和跨框架复用 |
| `core/dynamic-height-virtualizer.ts`        | 稀疏高度索引、偏移和定位       | 不依赖 React 与 DOM                |
| `core/scroll-coordinate.ts`                 | 物理、逻辑坐标换算             | 两种高度模式共同使用               |
| `fixed-height/use-fixed-height-list.ts`     | React 滚动状态和 rAF 调度      | 只处理框架生命周期                 |
| `dynamic-height/use-dynamic-height-list.ts` | DOM 测量、锚点补偿和观察器清理 | 浏览器相关逻辑留在适配层           |
| `shared/demo-data.ts`                       | 按索引生成演示数据             | 避免创建与逻辑总量等长的数组       |
| `index.tsx`                                 | 页面和行视图                   | 不承载虚拟化算法                   |

面试表达：

> 我没有把算法直接写进组件，也没有为了统一而把固定高和不定高塞进一个大类。固定高本质是几次除法和乘法，不定高需要高度索引结构。分开实现可以避免大量模式判断，也便于分别测试复杂度。

## 5. 固定高度方案解决什么问题

### 5.1 核心公式

```text
firstVisibleIndex = floor(logicalScrollTop / itemHeight)

visibleCount = ceil(viewportHeight / itemHeight)

startIndex = max(0, firstVisibleIndex - overscan)

endIndex = min(
    itemCount,
    firstVisibleIndex + visibleCount + overscan
)

offsetY = startIndex * itemHeight

totalHeight = itemCount * itemHeight
```

复杂度：

```text
计算起点：O(1)
计算偏移：O(1)
计算总高度：O(1)
DOM 数量：O(可见项 + overscan)
```

### 5.2 为什么固定高度优先

> 固定高度没有 DOM 测量、累计高度缓存、滚动锚点补偿和异步内容导致的二次修正，性能最好且行为最稳定。如果业务允许，我会优先限制文本行数，并为图片声明 width、height 或 aspect-ratio，让行高可预测。

### 5.3 动态 overscan 解决什么

慢速滚动时渲染太多节点没有收益；快速滚动时缓冲太小容易露白。当前实现根据相邻帧的逻辑滚动
距离调整缓冲：

```text
overscan = clamp(
    MIN_OVERSCAN + ceil(frameDistance / itemHeight),
    6,
    28
)
```

回答重点：

> overscan 不是越大越好。我给它设置上下限，慢速时减少 DOM，高速时降低滚动条追上渲染窗口的概率，同时避免触控板大幅移动时突然创建几百个节点。

## 6. 不定高度为什么更难

不定高度需要同时回答三个问题：

1. 项目没有进入 DOM 前，总高度怎么计算？
2. 某项真实高度变化后，后面项目的位置怎么更新？
3. 给定 `scrollTop`，如何快速找到对应项目？

当前流程：

```text
未渲染项目使用 estimatedItemHeight（预估项高度）
        ↓
根据逻辑 scrollTop 计算虚拟窗口
        ↓
只渲染视口和像素缓冲区域
        ↓
ResizeObserver 测量真实高度
        ↓
高度差写入稀疏 Fenwick Tree
        ↓
刷新累计偏移和虚拟窗口
        ↓
必要时补偿滚动锚点
```

### 6.1 为什么需要预估高度

> DOM 不存在时无法获得真实高度，但滚动条和首屏区间又必须先计算，所以必须先提供一个代表性基线。预估值不负责最终正确性，真实高度仍由 ResizeObserver 修正；它越接近真实分布，后续总高度变化、滚动锚点补偿和滚动条跳变就越少。

#### 6.1.1 当前 205px 是怎么计算的

当前实现将计算抽离为框架无关的 `estimateItemHeight()`：

```text
预估高度 =
    上下内边距
    + 标题行高
    + 标题与正文间距
    + 预计正文行数 × 正文行高
    + 边框
    + 安全余量
```

当前演示内容为 3～10 行，分布均匀，因此预计正文行数使用平均值：

```text
expectedContentLines = (3 + 10) / 2 = 6.5
```

结合当前 CSS：

```text
上下 padding：16 × 2             = 32px
标题行高：                         17px
标题下间距：                        7px
正文平均高度：6.5 × 22            = 143px
下边框：                            1px
字体取整和缩放安全余量：             5px
-----------------------------------------
合计：                             205px
```

代码位于：

```text
core/item-height-estimator.ts
dynamic-height/use-dynamic-height-list.ts
```

#### 6.1.2 真实业务完全不知道高度时怎么办

可以按下面顺序建立预估值。

第一步，根据能够确定的设计样式计算冷启动值：

```text
padding
+ 标题预计行数 × 标题 line-height
+ 正文预计行数 × 正文 line-height
+ 图片预留高度
+ gap / border
```

图片应优先提供 `width`、`height` 或 `aspect-ratio`，避免加载完成后才产生大幅高度变化。

当前演示交替使用两种互斥策略：`dimensions` 图片提供 HTML 固有宽高，`aspect-ratio` 图片不传
`width`、`height`，只通过 CSS 比例和展示宽度计算占位高度：

```tsx
<img
    width={image.layout === 'dimensions' ? image.width : undefined}
    height={image.layout === 'dimensions' ? image.height : undefined}
    style={image.layout === 'aspect-ratio'
        ? {aspectRatio: image.aspectRatio}
        : undefined}
/>
```

数据层使用可辨识联合类型，让一张图片只能选择其中一种策略，避免同时维护宽高和比例后出现配置
不一致。两种策略都在图片请求完成前确定布局尺寸，图片加载后仍由 ResizeObserver 校验实际行高。

第二步，使用真实业务数据抽样。在目标容器宽度下渲染 100～500 条典型数据，收集真实高度：

- 平均值：更适合让预估总高度接近真实总高度。
- P50：不容易被少量超高内容影响，适合作为稳定的典型高度。
- 截尾平均值：去掉两端异常值后求平均，通常兼顾总高度偏差与稳定性。

虚拟列表需要控制完整总高度偏差，因此不能机械地永远使用中位数。当前均匀分布使用平均行数；真实数据通常优先使用截尾平均值，再比较预估总高度是否持续偏高或偏低。

第三步，按内容类型和容器宽度分组。新闻卡片、图片卡片、代码块和通知行不应该共用一个估值；
移动端和桌面端的换行数量也不同。可以分别统计：

```text
estimate[type][breakpoint]
```

第四步，运行时继续收集 ResizeObserver 的实测结果，用滑动平均或指数移动平均观察预估偏差。

需要注意：修改全局预估高度会改变所有未测量项的逻辑位置，必须重建高度基线并补偿滚动锚点，不能在滚动过程中无条件频繁修改。

#### 6.1.3 为什么当前只计算统一基线

当前稀疏 Fenwick Tree 使用下面的 O(1) 基础公式：

```text
basePrefixHeight(index) = index × estimatedItemHeight
```

然后树只保存实测高度相对统一基线的差值。这样 10 亿条未测量数据不需要创建前缀数组。如果每个
项目都有任意不同的预估高度，就还需要为这些预估值建立可查询的前缀索引，会增加另一层数据结构。

因此当前抽离的是“统一代表性高度计算器”，而不是假装精确预测每一项。真实内容差异特别大时，可以按类型分段建立模型，或者采用支持逐项 estimate 的成熟虚拟列表库。

#### 6.1.4 面试直接回答

> 不确定真实高度时，我不会随便写一个常量。先根据 padding、标题行高、正文预计行数、正文行高、
> 图片比例和边框计算冷启动值；再用真实业务数据抽样，按内容类型和容器宽度统计截尾平均值或平均
> 高度。当前 3～10 行均匀分布，平均为 6.5 行，结合样式计算得到 205px。这个值只是未测量区域
> 的统一基线，项目挂载后仍由 ResizeObserver 获取真实高度，再用 Fenwick Tree 增量修正。预估
> 越准确，滚动条和锚点调整越少，但最终正确性不依赖它绝对准确。

### 6.2 ResizeObserver 解决什么，不解决什么

解决：

- 获取已经挂载项目的真实 border-box 高度。
- 内容、容器宽度或字体变化后重新通知高度。
- 一次回调批量返回多个变化项目。

不解决：

- 不能测量尚未创建的几百万项。
- 不能直接计算某项之前的累计高度。
- 不能根据 scrollTop 定位数据索引。

口述回答：

> ResizeObserver 是真实高度的数据来源，不是完整的虚拟列表算法。区间定位仍然需要高度索引结构。

## 7. 为什么使用 Fenwick Tree

不定高度需要支持：

| 操作             | 普通数组逐项求和 | 普通前缀和 |            Fenwick Tree |
| ---------------- | ---------------: | ---------: | ----------------------: |
| 单项高度更新     |             O(1) |       O(n) |                O(log n) |
| 查询某项顶部偏移 |             O(n) |       O(1) |                O(log n) |
| 根据偏移定位项目 |             O(n) |   O(log n) | O(log n) binary lifting |

普通前缀和的问题是：项目高度改变后，后面所有前缀值都要修改。不定高项目会持续被测量，因此更新
成本比单次查询更关键。

### 7.1 Fenwick Tree 原理口述版

> Fenwick Tree 通过 `lowbit(i) = i & -i`，让每个节点保存一段长度为 2 的幂的区间和。更新某项
> 时通过 `i += lowbit(i)` 访问所有包含它的父区间；查询前缀时通过 `i -= lowbit(i)` 把目标前缀
> 拆成互不重叠的区间。两个过程最多经过树高数量的节点，所以是 O(log n)。

### 7.2 为什么定位也是 O(log n)

如果普通二分查找每一步都调用一次 O(log n) 前缀查询，总体会变成 O(log² n)。当前实现使用
binary lifting：

1. 从不超过项目数量的最高 2 次幂开始。
2. 尝试向右跳当前步长。
3. 候选累计高度不超过 offset 就接受，否则拒绝。
4. 步长每次减半，直到 1。

每个二进制位只检查一次，因此定位是 O(log n)。

## 8. 为什么是“稀疏”Fenwick Tree

传统实现会创建和项目数同长度的高度数组与树。10 亿项即使每项只使用 8 字节，也需要数 GB
内存，浏览器不可行。

当前实现使用预估高度作为隐式基线：

```text
prefixHeight(index)
    = index * estimatedItemHeight
    + measuredDeltaPrefix(index)
```

只保存两个 Map：

```text
measuredHeights[index] = 真实高度

tree[node] = 当前 Fenwick 区间内
             所有实测高度相对预估高度的差值
```

未访问项目不占用高度数组空间。更新一个已测量项目时，只会创建 O(log n) 个稀疏树节点。

面试回答：

> 这是十亿级逻辑数量能够成立的关键。项目的基础累计高度可以用乘法得到，树只维护相对预估值的
> delta。内存复杂度不再是 O(itemCount)，而是近似 O(measuredCount × log itemCount)，实际还会
> 因多个项目共享 Fenwick 节点而更少。

必须主动说明限制：

> 未测量区域仍然是预估高度，只有用户实际浏览过的项目会逐步变准确。它适合虚拟滚动定位，不等于
> 提前获得了十亿项真实高度。

## 9. 高度修正为什么会导致跳动

假设用户正在看第 100 项，而第 20 项从预估 100px 修正为 140px。第 100 项的逻辑位置会向下移动
40px。如果只更新总高度，用户正在看的内容会突然移动。

当前处理：

```text
如果被修正项目的底部位于当前逻辑视口上方：

nextLogicalScrollTop = oldLogicalScrollTop + heightDelta
```

这样视口内容相对用户的位置保持不变。位于视口内部或下方的项目不补偿，因为它们没有改变当前
锚点之前的累计高度。

面试表达：

> 不定高虚拟列表不能只修正 totalHeight，还要维护滚动锚点。否则高度越不稳定，用户感受到的跳动
> 越明显。

## 10. React 滚动热路径如何设计

### 10.1 为什么不在每次 scroll 中 setState

滚动事件频率可能高于屏幕刷新率。如果每个事件都更新 state，会重复触发 React 渲染与虚拟区间
计算，而浏览器一帧最终只能展示一次。

当前处理：

```text
scroll 事件
    ↓
只把最新 scrollTop 写入 ref
    ↓
同一帧只申请一个 requestAnimationFrame
    ↓
rAF 回调读取最新值并 setState
```

口述回答：

> ref 承接高频、无需立即渲染的数据，state 只保存真正提交给视图的帧状态。这样不丢最后位置，
> 同时保证一帧最多触发一次 React 更新。

### 10.2 为什么不用 debounce

> debounce 会等待滚动停止后才更新，滚动过程中列表内容会明显落后甚至白屏。固定间隔 throttle
> 与浏览器帧率不一致，也可能一帧更新多次或跨过多帧。rAF 更适合视觉更新，因为它和绘制节奏同步。

### 10.3 passive listener 解决什么

> passive 明确告诉浏览器监听器不会调用 preventDefault，浏览器可以先执行滚动和合成，不必等待
> JavaScript。它不会减少事件次数，所以仍然需要 rAF 合帧。

当前动态页面不注册非 passive `wheel` 监听。原因是实际验证中，拖动滚动条正常但滚轮偶发卡顿，
差异正是 wheel 监听会让浏览器等待主线程。边界滚动链交给 CSS：

```css
overscroll-behavior: contain;
```

这段可以作为性能排查案例回答：

> 当滚动条拖拽流畅但触控板或滚轮卡顿时，我会优先对比 wheel 专属路径，包括非 passive 监听、
> preventDefault 和额外业务计算，而不是继续调整虚拟列表算法。

## 11. 为什么使用 translate3d

DOM 结构：

```text
滚动容器
└── 物理高度占位层
    └── translate3d 定位的可见层
        └── 当前窗口的少量行
```

占位层负责滚动范围，可见层负责真实渲染。虚拟窗口变化后，可见层需要移动到对应偏移：

```text
固定高 logicalRangeOffset = startIndex * itemHeight

不定高 logicalRangeOffset = prefixHeight(startIndex)
```

使用 transform 的原因：

- 不改变正常文档流占位。
- 只移动一个父层，不逐项更新位置。
- 高频位移通常更适合在合成阶段处理。
- 可以保留不定高累计偏移中的亚像素。

严谨回答：

> `translate3d` 不保证一定开启 GPU 加速，是否创建合成层由浏览器决定。`will-change` 也只是提示，
> 不能大范围给每个列表项使用。真正的收益首先来自减少 DOM 和控制更新次数。

## 12. 为什么需要物理、逻辑两套坐标

### 12.1 浏览器边界

浏览器对单个元素的可布局高度存在上限。即使 JavaScript 计算出数百亿像素，DOM 高度也可能被
静默钳制，导致滚动条无法到达后半段。

### 12.2 当前公式

```text
physicalTotalHeight = min(logicalTotalHeight, 8_000_000)

physicalScrollable = physicalTotalHeight - viewportHeight

logicalScrollable = logicalTotalHeight - viewportHeight

scrollScale = logicalScrollable / physicalScrollable

logicalScrollTop = physicalScrollTop * scrollScale
```

使用“可滚动距离”而不是两个总高度直接相除，可以保证：

```text
物理顶部 0 → 逻辑顶部 0
物理底部 → 逻辑底部
```

### 12.3 为什么不能直接把 logical offset 写给 transform

10 亿条固定高记录的逻辑高度可以达到数百亿像素，直接写入 transform 可能遇到浏览器坐标范围和
浮点精度问题。当前使用局部补偿：

```text
renderOffsetY =
    physicalScrollTop
    - (logicalScrollTop - logicalRangeOffset)
```

最终 DOM transform 始终处在物理滚动范围附近，而模型仍保留完整逻辑位置。

## 13. “支持 10 亿条”应该怎么严谨回答

正确说法：

> 支持 10 亿条可按索引推导的逻辑记录进行窗口定位和首尾边界计算，页面不会创建 10 亿个对象、
> 10 亿个 DOM 或 10 亿长度的高度数组。

不能说：

> 浏览器真实加载并保存了 10 亿条业务数据。

演示数据通过当前索引即时生成：

```text
renderedItems = createDataRange(startIndex, endIndex, createItem)
```

因此数据对象数量也是 O(可见项 + 缓冲)，但真实接口数据仍然需要服务端分页、缓存和内存治理。

## 14. 选择状态为什么滚动后还在

虚拟列表会销毁滚出窗口的行组件。如果选择状态只存在行组件内部，DOM 销毁后状态也会丢失。

当前实现：

```text
selectedIds: Set<number>

toggleSelected(id):
    使用函数式 setState 创建新的 Set
```

行重新进入窗口时，通过稳定 `id` 查询状态：

```text
selected = selectedIds.has(item.id)
```

同时行使用 `React.memo`，选择一个项目时，其他可见行的 `selected` 没变化，可以跳过不必要渲染。
动态高度页面的选择按钮尺寸固定，状态文字变化不会改变行高测量结果。

可直接回答：

> 虚拟化只管理 DOM 生命周期，业务状态必须提升到虚拟窗口之外。选中、展开、编辑草稿都应该用
> 稳定 id 保存在 Set、Map、数据层或全局状态中。

## 15. 为什么不用 Web Worker 处理滚动定位

> 固定高度只需要几次算术，不定高度查询是 O(log n)，通常远低于一帧预算。把每次滚动位置发给
> Worker 会增加消息调度和序列化成本，而且 Worker 不能访问 DOM、ResizeObserver 或 scrollTop。
> Worker 更适合耗时的排序、过滤、聚合和文本处理，而不是轻量的每帧区间定位。

## 16. 为什么不直接使用成熟库

可以回答：

> 生产项目中，如果涉及吸顶、反向列表、滚动恢复、SSR、复杂动态测量，我会优先评估 TanStack
> Virtual 等成熟库。这次自己实现的目的，一是针对物理高度上限和稀疏十亿级逻辑数据做定制，二是
> 把算法抽成框架无关核心，三是完整理解滚动锚点和性能边界。是否自研取决于需求差异和维护成本，
> 不是为了排斥成熟库。

常见方案对比：

| 方案             | 适用场景             | 局限                               |
| ---------------- | -------------------- | ---------------------------------- |
| 固定高自研       | 行高稳定、需求简单   | 不适合复杂布局能力                 |
| TanStack Virtual | 动态高度、生产级交互 | 仍需处理业务状态和数据加载         |
| react-window     | 固定高或相对简单列表 | 动态测量能力需要额外处理           |
| 服务端分页/游标  | 真实远程大数据       | 页面内仍可能需要小规模虚拟化       |
| Canvas           | 极高密度纯绘制       | 可访问性、文本选择和组件交互成本高 |

## 17. 复杂度与内存总结

| 能力         | 固定高度         | 不定高度稀疏 Fenwick      |
| ------------ | ---------------- | ------------------------- |
| 定位可见起点 | O(1)             | O(log n)                  |
| 查询项目偏移 | O(1)             | O(log n)                  |
| 更新单项高度 | 不需要           | O(log n)                  |
| 数据对象     | O(可见项 + 缓冲) | O(可见项 + 缓冲)          |
| DOM          | O(可见项 + 缓冲) | O(可见项 + 缓冲)          |
| 高度模型内存 | O(1)             | 近似 O(已测量项 × log n) |

## 18. 常见追问与直接回答

### 18.1 虚拟列表为什么仍然可能卡

> 虚拟列表只控制 DOM 数量。如果行组件本身很重、scroll 中执行同步布局、存在非 passive wheel
> 监听、图片持续解码、选择器复杂或每帧触发多次 React 更新，仍然会卡。需要用 Performance 面板
> 区分 scripting、layout、paint 和 event handler 的实际耗时。

### 18.2 为什么滚动条拖拽流畅，滚轮卡顿

> 两者共同触发 scroll，但只有滚轮会经过 wheel 监听。优先检查非 passive listener、
> preventDefault 和 wheel 回调中的同步工作。当前项目移除了非 passive wheel 监听，使用 passive
> scroll 加 CSS overscroll 隔离。

### 18.3 overscan 太小或太大会怎样

> 太小容易在快速滚动时露白；太大会增加 DOM、React reconciliation 和布局成本。固定高可以按条数
> 动态调整，不定高因为项目高度不同，更适合使用像素缓冲。

### 18.4 为什么不定高使用像素 overscan

> 10 个 40px 项目和 10 个 400px 项目代表的缓冲距离完全不同。像素缓冲能直接表达视口外需要
> 覆盖的视觉距离。

### 18.5 图片加载后高度变化怎么办

> 首选给图片声明尺寸或 aspect-ratio 预留空间。无法预知时由 ResizeObserver 修正高度，并对视口
> 上方的高度差做锚点补偿。HTML width/height 适合接口能够返回原图尺寸的场景；CSS aspect-ratio
> 适合卡片比例由产品规范确定、接口不提供原图尺寸的场景。

### 18.6 为什么忽略小于 0.5px 的高度差

> 字体、缩放和亚像素布局可能产生微小测量噪声。每次都更新会造成 ResizeObserver 抖动和无收益
> 重渲染，设置阈值可以稳定高度模型。

### 18.7 为什么行必须使用稳定 key

> key 决定 React 如何复用节点。使用数组窗口内下标会导致滚动后错误复用组件状态；应该使用完整
> 数据中的稳定业务 id。

### 18.8 为什么不能把 scrollTop 直接放进 Context 或全局状态

> scrollTop 是高频、页面局部的瞬时状态。放进大范围共享状态会扩大订阅和重渲染范围。当前先写 ref，
> 每帧只向局部 Hook 提交一次。

### 18.9 10 亿数据为什么滚轮一次会跨很多记录

> 物理滚动范围只有 800 万像素，而逻辑高度可能是数百亿像素，压缩比例很大。因此物理 1px 会映射
> 到很多逻辑像素。这是有限滚动条表达超大空间的精度取舍。真实产品通常不会让用户线性浏览十亿条，
> 而会提供搜索、筛选、跳转和服务端游标。

### 18.10 数据量变化时需要重置什么

> 需要重置滚动坐标、选择状态、已测量索引、观察器中的旧节点和动态高度模型。否则新数据可能继承
> 旧索引的高度或选择状态，导致定位错误。

### 18.11 如何验证没有内存泄漏

> 往返滚动并切换数据规模，观察 DOM 节点数、JS heap、ResizeObserver 引用和已测量 Map 是否持续
> 无上限增长；组件卸载时要取消 rAF、断开观察器并释放 DOM 引用。

### 18.12 为什么不是所有状态都放进列表项组件

> 列表项是可回收视图，不是业务状态所有者。需要跨滚动保留的状态必须位于虚拟窗口外；只有悬停等
> 短生命周期视觉状态适合留在行内部。

### 18.13 为什么当前最大选项是 10 亿，不继续无限增大

> 除了产品上没有线性浏览更大列表的意义，当前 Fenwick Tree 的 `lowbit` 使用 JavaScript 位运算。
> JavaScript 位运算会转换为 32 位有符号整数，10 亿仍处于当前实现的正数安全范围；如果需要超过
> 这一范围，应该把树索引运算改成不依赖 32 位位运算的数据结构或分段索引，而不是只增加下拉选项。

## 19. 如何证明优化有效

在 Chrome Performance 与 Memory 面板验证：

1. 记录快速滚动，检查是否持续出现超过 50ms 的 Long Task。
2. 对比优化前后的 DOM 节点数，确认不会随逻辑总数线性增长。
3. 检查 scroll 和 wheel handler 是否阻塞主线程。
4. 检查滚动热路径是否出现 forced reflow。
5. 观察 scripting、rendering、painting 各阶段耗时。
6. 使用 CPU throttling 验证低性能设备。
7. 往返滚动后检查 heap 和 DOM 引用是否持续增长。
8. 验证顶部、随机位置和底部索引是否正确。
9. 验证选择状态滚出再滚回仍然存在。
10. 验证动态高度修正后当前内容没有明显跳动。

量化结果必须来自真实测试，不要在简历或面试中编造 FPS、耗时或提升比例。

## 20. 容易说错的地方

- 错误：使用虚拟列表后所有操作都是 O(1)。不定高度定位与更新是 O(log n)。
- 错误：页面真实加载了 10 亿条数据。当前是 10 亿条逻辑索引，数据按可见区生成。
- 错误：ResizeObserver 能测量全部项目。它只能测量已经存在的 DOM。
- 错误：translate3d 一定开启 GPU。是否建合成层由浏览器决定。
- 错误：will-change 可以解决滚动卡顿。它不能减少 DOM 和 JavaScript 工作量。
- 错误：passive 会减少 scroll 事件。passive 只表示不阻止默认滚动。
- 错误：拦截 wheel 可以让滚动更稳定。非 passive wheel 可能让滚动等待主线程。
- 错误：虚拟列表解决了网络和数据内存。它主要解决渲染数量。
- 错误：Worker 能操作 DOM 或 ResizeObserver。Worker 没有页面 DOM 环境。
- 错误：占位层高度可以无限增大。浏览器存在元素布局高度上限。

## 21. 白板答题顺序

面试现场可以按下面顺序画：

```text
1. 全量数据或逻辑 itemCount
            ↓
2. logicalScrollTop + viewportHeight
            ↓
3. Virtualizer 计算 startIndex / endIndex / offsetY
            ↓
4. slice 或按索引生成可见数据
            ↓
5. 占位层产生滚动范围
            ↓
6. translate3d 移动可见层
            ↓
7. 不定高 DOM 测量回写 Fenwick Tree
            ↓
8. 高度变化时补偿滚动锚点
```

再补充两套坐标：

```text
physicalScrollTop
    × scrollScale
        ↓
logicalScrollTop
        ↓
虚拟模型定位完整数据
```

## 22. 面试官深入追问时的展开方式

### 追问层级一：为什么不卡

回答 DOM 数量、rAF 合帧、passive scroll、overscan。

### 追问层级二：不定高怎么定位

回答预估高度、ResizeObserver、Fenwick Tree、O(log n)、滚动锚点。

### 追问层级三：十亿条怎么实现

回答按索引生成数据、稀疏 delta 树、物理/逻辑坐标压缩，并主动说明不是真实加载十亿对象。

### 追问层级四：为什么不用库或分页

回答自研边界、成熟库适用场景，以及真实业务仍需分页、搜索和游标。

### 追问层级五：如何证明

回答 Performance、Memory、DOM 数量、Long Task、首尾正确性与状态持久化。

## 23. 推荐收尾话术

> 这套方案的重点不是做一个能滚动的 Demo，而是分层控制成本：先用虚拟化减少 DOM，再用 rAF 和
> passive 监听控制每帧更新，用合适的数据结构解决不定高度，用两套坐标处理浏览器极限，最后明确
> 虚拟列表和服务端数据治理的边界。业务允许时我优先固定高度和服务端分页；只有确实需要不定高和
> 超大逻辑空间时，才引入测量、Fenwick Tree 和坐标压缩。

## 24. 项目代码对应关系

| 面试内容               | 当前 React 文件                               |
| ---------------------- | --------------------------------------------- |
| 固定高度 O(1) 算法     | `core/fixed-height-virtualizer.ts`          |
| 稀疏 Fenwick Tree      | `core/dynamic-height-virtualizer.ts`        |
| 代表性预估高度计算     | `core/item-height-estimator.ts`             |
| 物理、逻辑坐标压缩     | `core/scroll-coordinate.ts`                 |
| 固定高 React 调度      | `fixed-height/use-fixed-height-list.ts`     |
| 不定高测量与锚点补偿   | `dynamic-height/use-dynamic-height-list.ts` |
| 固定高视图和 memo 行   | `fixed-height/index.tsx`                    |
| 不定高视图、选择持久化 | `dynamic-height/index.tsx`                  |
| 按索引即时生成数据     | `shared/demo-data.ts`                       |
| 页面设计说明           | `readme.md`                                 |

## 25. 最后背诵提纲

```text
问题：全量 DOM / 高频更新 / 不定高 / 浏览器高度上限

固定高：除法定位 O(1) / 动态 overscan

不定高：预估高度 / ResizeObserver / 稀疏 Fenwick O(log n)

React：ref 接事件 / rAF 合帧 / memo / 函数式 Set

渲染：占位层 / 可见层 / translate3d

超大数据：按索引生成 / physical-logical 坐标压缩

边界：十亿是逻辑数据 / 真实业务仍需分页搜索

验证：Performance / Memory / DOM 数量 / Long Task / 首尾正确性
```
