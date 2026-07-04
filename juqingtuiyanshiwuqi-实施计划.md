# 剧情推演室五期 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在四期基础上新增 5 项能力：传闻主动传播、完整分支对比、侦探板自由布局、时间滑块回放、Web Worker 性能优化。

**Architecture:** 引擎层（Task 15）→ 数据层（Task 18）→ UI 层（Task 16/17）→ 性能层（Task 19）。每层独立可测试。

**Tech Stack:** React + TypeScript + Zustand + Tailwind CSS + Web Worker (Vite 原生)

## Global Constraints

- 分支：`juqingtuiyanshierqi`（在四期基础上叠加）
- 所有面向用户的提示语使用中文
- 不删除已有函数和组件
- 不顺手重构无关代码
- 保持与现有代码风格一致
- 每个任务独立验证（typecheck + 相关测试）
- 不新增第三方图表库，雷达图用原生 SVG 手绘
- 侦探板不使用 cytoscape，全部手写拖拽/连线/画布

---

## Task 15: 传闻主动传播行动

**Files:**
- Modify: `src/lib/novel/story-simulation/types.ts` — RumorEvent 加 parentId/spreadBy/generation 等字段，AgentMemory 加 rumorCredibility
- Modify: `src/lib/novel/story-simulation/multi-agent-orchestrator.ts` — spreadRumor 函数 + 传播逻辑
- Modify: `src/lib/novel/story-simulation/sim-agent-tools.ts` — 新增 spread_rumor 工具
- Modify: `src/components/novel/story-simulation/rumor-propagation-panel.tsx` — 升级为传播树
- Create: `src/lib/novel/story-simulation/spread-rumor.spec.ts` — 测试

**Interfaces:**
- Consumes: RumorEvent, NovelAgent, SimulationBlackboard
- Produces:
  - `spreadRumor(blackboard, sourceRumorId, spreaderId, targetId, message): { newRumor, targetBelieved }`
  - `buildRumorFamilyTree(rumors): RumorTreeNode[]` — 构建传播树
  - ReAct 工具 `spread_rumor`

- [ ] **Step 1: 扩展 RumorEvent 类型**

在 types.ts 的 RumorEvent 中新增：
```typescript
export interface RumorEvent {
  // ... 已有字段
  parentId?: string
  spreadBy?: string
  spreadRound?: number
  generation: number
}
```

同时在 AgentMemory 中新增：
```typescript
export interface AgentMemory {
  // ... 已有字段
  rumorCredibility: number  // 0-1，初始 0.5
}
```

在 createNovelAgent 等初始化函数中，给 rumorCredibility 设默认值 0.5。
rumors 数组中新创建的 RumorEvent 默认 generation = 0。

- [ ] **Step 2: 实现 spreadRumor 函数**

在 multi-agent-orchestrator.ts 中新增：
```typescript
export function spreadRumor(
  blackboard: SimulationBlackboard,
  sourceRumorId: string,
  spreaderId: string,
  targetId: string,
  message: string,
): { newRumor: RumorEvent | null; targetBelieved: boolean }
```

实现逻辑：
1. 找到源传闻
2. 检查传播者是否知道这条传闻，目标是否存在
3. 生成新传闻：
   - id: `rumor-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
   - content: message || 源传闻 content
   - distortion: Math.min(1, sourceRumor.distortion + 0.1 + Math.random() * 0.2)
   - generation: sourceRumor.generation + 1
   - parentId: sourceRumorId
   - spreadBy: spreaderId
   - spreadRound: 当前轮次（从 blackboard 或事件中获取）
   - observableBy: [targetId]
   - believedBy: []
   - verifiedBy: []
4. 加入 blackboard.rumors 和 visibleRumorsByAgent.get(targetId)
5. 计算目标是否相信：
   - baseBelief = (1 - newRumor.distortion) * 0.6
   - spreader = blackboard.allAgents.get(spreaderId)
   - target = blackboard.allAgents.get(targetId)
   - credibilityBonus = (spreader.memory.rumorCredibility - 0.5) * 0.4
   - sentimentBonus = (target.memory.sentiments.get(spreaderId) ?? 0) / 200  // -0.5 到 0.5
   - finalProb = Math.max(0.1, Math.min(0.9, baseBelief + credibilityBonus + sentimentBonus))
   - believed = Math.random() < finalProb
   - 如果 believed，加入 believedBy
6. 返回结果

- [ ] **Step 3: ReAct 工具集新增 spread_rumor**

在 sim-agent-tools.ts 的 agentTools 中新增：
```typescript
spread_rumor: {
  description: "把一条你知道的传闻告诉另一个角色。可以加上你自己的描述和评价。",
  parameters: z.object({
    rumorId: z.string().describe("要传播的传闻 ID"),
    targetAgentId: z.string().describe("告诉谁（角色 ID）"),
    message: z.string().describe("你说的内容（对传闻的描述/补充/评价）"),
  }),
  execute: async (params, context) => {
    const result = spreadRumor(context.blackboard, params.rumorId, context.agent.characterId, params.targetAgentId, params.message)
    if (!result.newRumor) return { success: false, reason: "传播失败" }
    return {
      success: true,
      newRumorId: result.newRumor.id,
      targetBelieved: result.targetBelieved,
      newDistortion: result.newRumor.distortion,
    }
  }
}
```

- [ ] **Step 4: 传播链面板升级为树形展示**

改造 rumor-propagation-panel.tsx：
- 左侧列表保持不变
- 右侧传播链从线性时间线改为树形结构
- 显示传播代次：原始传闻 → 第1代传播 → 第2代...
- 每个节点显示：内容摘要、传播者、轮次、失真度颜色
- 用缩进 + 竖线表示层级，不用复杂的图形库

辅助函数 buildRumorFamilyTree：
```typescript
interface RumorTreeNode {
  rumor: RumorEvent
  children: RumorTreeNode[]
  spreaderName?: string
}

function buildRumorFamilyTree(rumors: RumorEvent[], targetRumorId: string): RumorTreeNode | null
```

- [ ] **Step 5: 测试**

新建 spread-rumor.spec.ts，覆盖：
- 基本传播功能（生成新传闻、加入目标可见列表）
- 失真度增加（新传闻 distortion >= 源传闻）
- generation 递增
- parentId/spreadBy 正确
- 边界情况：传播不存在的传闻、目标不存在
- 可信度影响相信概率（高可信度 vs 低可信度）

- [ ] **Step 6: 验证**
  - `npx vitest run src/lib/novel/story-simulation/spread-rumor.spec.ts` → 全部通过
  - `npx tsc --build --pretty` → 0 errors

---

## Task 18: 时间滑块 + 状态回放

**先做 Task 18 再做 Task 16/17**，因为历史快照数据是 UI 层的基础。

**Files:**
- Modify: `src/stores/story-simulation-store.ts` — 新增 history 状态、回放控制方法
- Modify: `src/components/novel/story-simulation/relationship-graph-panel.tsx` — 集成回放控件
- Modify: `src/components/novel/story-simulation/story-simulation-view.tsx` — 回放联动
- Test: （store 逻辑写单测，UI 不写）

**Interfaces:**
- Consumes: 当前仿真状态（每轮结束时的快照）
- Produces:
  - `history: SimulationHistoryEntry[]`
  - `historyIndex: number` (-1 = 实时)
  - `setHistoryIndex(index): void`
  - `togglePlayback(): void`
  - `playbackSpeed: number`

- [ ] **Step 1: 定义历史快照类型**

在 types.ts 或 store 中定义：
```typescript
export interface SimulationHistoryEntry {
  round: number
  nodeIndex: number
  nodeTitle: string
  agentStates: Record<string, {
    sentiments: [string, number][]
    knownSecrets: string[]
    observedEvents: string[]
  }>
  eventCount: number
  rumorCount: number
}
```

注意：用普通对象而不是 Map/Set，便于序列化和回放。

- [ ] **Step 2: 在 store 中新增历史记录状态**

新增状态：
```typescript
history: SimulationHistoryEntry[]
historyIndex: number  // -1 = 实时模式，>= 0 = 回放第 index 条
isPlaying: boolean
playbackSpeed: number  // 0.5 / 1 / 2 / 4
```

新增方法：
```typescript
addHistoryEntry: (entry: SimulationHistoryEntry) => void
setHistoryIndex: (index: number) => void
togglePlayback: () => void
setPlaybackSpeed: (speed: number) => void
clearHistory: () => void
```

**回放时的派生数据**：
回放模式下，UI 组件需要读取历史状态而不是实时状态。
在 store 中加 derived 方法或在组件中用 useMemo 计算：
```typescript
// 返回当前应该展示的状态（回放 or 实时）
getDisplayAgents(): Map<string, NovelAgent>
getDisplayEvents(): TimelineEvent[]
getDisplayRumors(): RumorEvent[]
```

简化方案：在组件中自己判断 historyIndex，从 history 中取数据。不改动 store 中的实时数据。

- [ ] **Step 3: 在仿真回调中添加历史快照**

在 story-simulation-view.tsx 的回调中，每轮事件处理完成后调用 `addHistoryEntry`。
从 currentAgents 中提取 sentiments、knownSecrets、observedEvents。

- [ ] **Step 4: 关系图面板加回放控件**

在 relationship-graph-panel.tsx 顶部加回放控制条：
- 左：后退一步
- 中：播放/暂停
- 右：前进一步
- 速度选择：0.5x / 1x / 2x / 4x
- 滑块：拖动跳转到任意轮次
- 实时模式按钮

播放实现：用 setInterval 或 requestAnimationFrame，按速度递增 historyIndex。

- [ ] **Step 5: 各面板联动回放**

确保以下面板在回放模式下显示历史数据：
- 关系图：从历史快照取 sentiments
- 线索板：从历史快照取 knownSecrets
- 时间线：只显示到当前轮次的事件
- 传闻面板：只显示到当前轮次的传闻

简化：先只让关系图支持回放，其他面板后续再加。
Task 18 只做关系图回放，验证机制可行后再扩展。

- [ ] **Step 6: 验证**
  - `npx tsc --build --pretty` → 0 errors
  - `npm run dev` → 手动测试回放功能

---

## Task 16: 完整分支对比页面

**Files:**
- Create: `src/components/novel/story-simulation/branch-compare-view.tsx` — 完整对比页面
- Modify: `src/components/novel/story-simulation/branch-manager-panel.tsx` — 加对比复选框
- Modify: `src/stores/story-simulation-store.ts` — 加 compareBranchIds, isCompareMode

**Interfaces:**
- Consumes: SimulationBranch[]
- Produces:
  - 雷达图组件（SVG 手绘）
  - 时间线并排对比组件
  - 关键差异分析函数

- [ ] **Step 1: Store 新增对比状态**

在 store 中新增：
```typescript
compareBranchIds: string[]
isCompareMode: boolean

setCompareMode: (enabled: boolean) => void
toggleCompareBranch: (branchId: string) => void
clearCompareSelection: () => void
```

- [ ] **Step 2: 分支管理面板加对比功能**

在 branch-manager-panel.tsx 中：
- 每个分支卡片加复选框（点击选中用于对比）
- 底部加「对比选中的分支」按钮（选中 2-3 个时启用）
- 点击按钮进入对比模式

- [ ] **Step 3: 创建对比页面组件**

新建 branch-compare-view.tsx，三个 Tab：
1. **评分对比**（默认）：SVG 雷达图 + 各维度分数表
2. **时间线对比**：2-3 列并排时间线
3. **关键差异**：自动分析的差异列表

顶部：返回按钮 + 分支名称标签

雷达图实现（原生 SVG）：
- 7 边形网格背景
- 2-3 条多边形线
- 图例可点击显隐
- 纯 SVG，不依赖任何库

时间线并排：
- flex 布局，2-3 列
- 每列是一个分支的事件列表
- 事件卡片样式复用时间线的卡片样式

关键差异分析（纯函数）：
```typescript
function analyzeBranchDiff(branches: SimulationBranch[]): BranchDiff
```

分析内容：
- 各维度评分差异
- 独有事件数量
- 角色结局差异（好感度对比）
- 从第几轮开始明显分岔

- [ ] **Step 4: 集成到主视图**

在 story-simulation-view.tsx 中：
- isCompareMode 为 true 时显示对比页面
- 对比页面占满过程观察区域
- 顶部返回按钮退出对比模式

- [ ] **Step 5: 验证**
  - `npx tsc --build --pretty` → 0 errors
  - `npm run dev` → 手动测试对比功能

---

## Task 17: 侦探板自由布局

**Files:**
- Create: `src/components/novel/story-simulation/detective-board-panel.tsx` — 侦探板组件
- Modify: `src/stores/story-simulation-store.ts` — 加侦探板状态
- Modify: `src/components/novel/story-simulation/story-simulation-view.tsx` — 集成侦探板

**Interfaces:**
- Consumes: currentAgents, currentRumors, timelineEvents
- Produces:
  - 画布系统（平移/缩放）
  - 可拖拽卡片
  - SVG 连线
  - 自动布局算法

**这是五期工作量最大的任务，拆成 3 个子步骤实现：**

### Subtask 17a: 画布系统 + 卡片拖拽

- [ ] **Step 1: 定义数据类型**

```typescript
interface DetectiveBoardState {
  cards: DetectiveCard[]
  connections: DetectiveConnection[]
  viewport: { x: number; y: number; scale: number }
  selectedCardId: string | null
  selectedConnectionId: string | null
}

interface DetectiveCard {
  id: string
  type: "clue" | "character" | "event"
  title: string
  content: string
  x: number
  y: number
  width: number
  sourceId?: string
}

interface DetectiveConnection {
  id: string
  fromCardId: string
  toCardId: string
  type: "related" | "cause" | "contradiction" | "proves" | "disproves"
  label?: string
}
```

- [ ] **Step 2: 实现画布容器**

画布组件：
- 外层容器：overflow: hidden，position: relative
- 内层内容层：transform: translate(x, y) scale(scale)
- 鼠标滚轮：以鼠标位置为中心缩放
- 鼠标拖拽空白区域：平移画布
- 缩放范围：0.3 - 2.0

- [ ] **Step 3: 实现可拖拽卡片**

卡片组件：
- position: absolute，left/top 由 x/y 决定
- 鼠标按下卡片标题栏：开始拖拽
- 鼠标移动：更新卡片位置（用 transform 性能更好）
- 鼠标抬起：结束拖拽
- 点击卡片：选中（高亮边框）
- 不同类型卡片不同颜色边框

- [ ] **Step 4: 自动生成初始卡片**

从 agent/rumor/event 数据自动生成卡片：
- 每个角色 → 角色卡片
- 每个已知秘密 → 线索卡片
- 每个关键事件 → 事件卡片
- 初始位置：简单的网格布局

### Subtask 17b: SVG 连线系统

- [ ] **Step 1: SVG 连线层**

- SVG 元素覆盖整个画布，position: absolute, pointer-events: none
- 每条连线是一个 path 元素
- 贝塞尔曲线连接两张卡片的中心
- 不同类型连线不同颜色

- [ ] **Step 2: 手动连线**

- 卡片边缘加连线手柄（小圆圈）
- 拖拽手柄到另一张卡片 → 创建连线
- 连线时显示临时线跟随鼠标

- [ ] **Step 3: 连线操作**

- 点击连线选中
- 删除键删除选中的连线
- 右键或双击编辑连线类型和标签

### Subtask 17c: 自动布局 + 工具栏

- [ ] **Step 1: 简化力导向布局算法**

```typescript
function autoLayout(cards, connections): { id: string; x: number; y: number }[]
```

算法（约 50 行）：
- 节点间排斥力（距离越近斥力越大）
- 有连线的节点间吸引力
- 迭代 50-100 次
- 冷却因子：每次迭代步长减小

- [ ] **Step 2: 工具栏**

顶部工具栏：
- 自动布局按钮
- 重置视图按钮
- 缩放显示（+ / - / 100%）
- 删除选中按钮

- [ ] **Step 3: 集成到过程观察面板**

替换线索板 Tab 的内容为侦探板。
或者保留线索板，新增「侦探板」Tab（这样 Tab 就太多了，还是替换吧）。

替换「线索」Tab 为「侦探板」。

- [ ] **Step 4: 验证**
  - `npx tsc --build --pretty` → 0 errors
  - `npm run dev` → 手动测试拖拽、连线、缩放、平移

---

## Task 19: Web Worker 性能优化

**Files:**
- Create: `src/workers/simulation-worker.ts` — Worker 入口
- Create: `src/hooks/use-simulation-worker.ts` — Worker 封装 Hook
- Modify: 侦探板、分支对比 — 改用 Worker 计算

**Interfaces:**
- Consumes: 线索列表、分支数据、卡片数据
- Produces: 关联计算结果、差异分析结果、布局坐标

- [ ] **Step 1: 创建 Worker 文件**

新建 `src/workers/simulation-worker.ts`：
```typescript
import type { WorkerMessage, WorkerResult } from "@/lib/novel/story-simulation/types"

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { id, type, payload } = e.data
  let result: WorkerResult["payload"]

  switch (type) {
    case "calc-clue-relations":
      result = calcClueRelations(payload.clues)
      break
    case "calc-branch-diff":
      result = calcBranchDiff(payload.branchA, payload.branchB)
      break
    case "calc-board-layout":
      result = calcBoardLayout(payload.cards, payload.connections)
      break
  }

  self.postMessage({ id, type, payload: result })
}
```

把对应的计算函数移到 Worker 中（或在 Worker 中重新实现）。

- [ ] **Step 2: Worker 消息类型定义**

在 types.ts 中新增：
```typescript
export interface WorkerRequest {
  id: string
  type: "calc-clue-relations" | "calc-branch-diff" | "calc-board-layout"
  payload: any
}

export interface WorkerResponse {
  id: string
  type: string
  payload: any
}
```

- [ ] **Step 3: 封装 useSimulationWorker Hook**

新建 `src/hooks/use-simulation-worker.ts`：
```typescript
export function useSimulationWorker() {
  const calcClueRelations = async (clues) => { ... }
  const calcBranchDiff = async (a, b) => { ... }
  const calcBoardLayout = async (cards, connections) => { ... }
}
```

内部实现：
- 创建 Worker 实例（单例）
- 用 Map 存待处理请求（id → resolve）
- 每次调用生成唯一 id，postMessage，返回 Promise
- onmessage 中根据 id 找到对应 resolve 并调用

- [ ] **Step 4: 迁移计算到 Worker**

把以下计算移到 Worker：
- 侦探板：自动布局计算
- 分支对比：差异分析
- （线索关联如果还需要的话）

主线程只负责渲染，计算全部交给 Worker。

- [ ] **Step 5: 降级策略**

Worker 加载失败时，降级为主线程计算（用 setTimeout 分批处理）。
不影响功能使用，只是性能差点。

- [ ] **Step 6: 验证**
  - `npx tsc --build --pretty` → 0 errors
  - `npm run dev` → 手动测试功能正常，控制台无 Worker 错误

---

## Task 20: 最终验证 + 更新日志 + 打包

- [ ] **Step 1: 全量 typecheck**
  - `npx tsc --build --pretty` → 0 errors

- [ ] **Step 2: 核心测试**
  - `npx vitest run src/lib/novel/story-simulation/` → 全部通过

- [ ] **Step 3: vite build**
  - `npm run build` → build 成功

- [ ] **Step 4: 打包便携版**
  - `npm run build:portable` → 生成 release-portable/QMaiWrite.exe

- [ ] **Step 5: 更新日志**
  - 在 GenxinLOG/更新日志.md 顶部添加五期更新内容
