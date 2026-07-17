# React 长列表滚动卡顿解决方案

本目录参考 Vue 版本的功能，用 React 18 重新实现固定高度与不定高度虚拟列表。现有
`height-fixed`、`height-auto` 页面继续保留，便于对比不同实现。

## 目录职责

```text
long-list-ui-lag/
├── core/                    # 与 Vue、React 无关的纯 TypeScript 算法
├── shared/                  # 公共演示数据和数据规模控件
├── fixed-height/            # 固定高度 React Hook 与页面
├── dynamic-height/          # 不定高度 React Hook 与页面
└── style.module.scss        # 两个页面共用的视觉样式
```

`core` 不导入 React，可以直接被 Vue 页面、React 页面、单元测试或其他前端框架复用：

- `FixedHeightVirtualizer`：通过除法以 O(1) 计算渲染区间和偏移。
- `DynamicHeightVirtualizer`：使用预估高度和稀疏 Fenwick Tree，以 O(log n) 更新高度、查询累计偏移和定位项目。
- `estimateItemHeight`：根据内边距、标题、预计正文行数、行高和边框计算未测量项目的初始基线。
- `scroll-coordinate`：负责百万级列表的物理/逻辑滚动坐标压缩及渲染偏移换算。

## React 层实现

固定高度页面将高频 `scroll` 事件先写入 `ref`，再由 `requestAnimationFrame` 每帧最多提交一次
React 状态。滚动越快，`overscan` 越大，但始终限制在 6 至 28 条，避免快速滚动白屏或突然创建
大量 DOM。

不定高度页面只通过一个 `ResizeObserver` 测量当前渲染的少量节点。实测高度批量写入 Fenwick
Tree；当视口上方项目高度发生变化时，同步补偿滚动位置，避免正在阅读的内容跳动。
滚动容器只使用 passive `scroll` 监听，并通过 `overscroll-behavior: contain` 隔离滚动链；不注册
非 passive `wheel` 监听，避免滚轮输入等待主线程处理而产生卡顿。

两种页面的选择状态都使用完整列表项目的稳定 `id` 保存在独立 `Set` 中，不依赖当前 DOM。列表项
滚出虚拟窗口后可以被正常销毁，再次滚回时仍会恢复选择状态；选择按钮采用固定尺寸，状态变化不会
干扰动态行高测量。

固定高度和不定高度页面都不会创建与总数等长的数据数组，只根据当前虚拟区间即时生成几十条
演示数据。不定高度模型也只保存已渲染项目的实测高度和对应的稀疏 Fenwick 增量节点，因此可以
选择 500 万、1,000 万、2,000 万、5,000 万、1 亿和 10 亿条逻辑数据。

当完整逻辑高度超过浏览器安全范围时，DOM 占位高度限制为 8,000,000px，并将物理
`scrollTop` 映射为完整逻辑坐标。两个页面都能定位超大逻辑列表中的末尾项目，同时不会把数百亿
像素直接写入 DOM 高度和 `transform`。

## 页面地址

```text
/virtual-list/long-list-ui-lag/fixed-height
/virtual-list/long-list-ui-lag/dynamic-height
```

## 生产环境取舍

本演示的数据可由索引推导，因此不需要真实存储十亿条对象；实际业务数据仍会产生接口传输和内存
成本。固定高度优先使用本目录的简单模型；涉及动态高度、吸顶、反向列表或复杂滚动恢复时，应
优先评估 TanStack Virtual。服务端数据超过约 1,000 条时，通常还应结合搜索、筛选、分页或游标加载。
