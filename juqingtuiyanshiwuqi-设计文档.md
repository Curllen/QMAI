# 剧情推演室五期 — 设计文档

> 分支：`juqingtuiyanshierqi`（在四期基础上叠加）
> 日期：2026-07-04
> 范围：5 个任务（引擎 + UI + 性能）

## 一、背景与目标

在剧情推演室四期（可视化增强）基础上，继续深化 5 个方向：

1. **传闻主动传播行动**：Agent 可主动选择传播传闻，形成多代传播链
2. **完整分支对比页面**：多分支并排对比，含雷达图、时间线对比、差异分析
3. **侦探板自由布局**：线索卡片自由拖拽、手动连线、画布缩放平移
4. **时间滑块 + 状态回放**：拖动滑块回到任意轮次，查看当时的关系状态
5. **Web Worker 性能优化**：计算密集型操作移到 Worker，避免阻塞主线程

## 二、Task 15：传闻主动传播行动

### 2.1 目标

Agent 可以主动选择「传播传闻」行动，将自己知道的传闻告诉其他角色，形成多代传播链。

### 2.2 ReAct 工具新增

在 `sim-agent-tools.ts` 中新增 `spread_rumor` 工具：

```
工具名称：spread_rumor
工具描述：把一条你知道的传闻告诉另一个角色。你可以选择告诉谁、说什么内容。
工具参数：
  - rumorId: string  要传播的传闻 ID
  - targetAgentId: string  目标角色 ID
  - message: string  你对传闻的描述/补充/评价
返回：传播结果（目标是否相信、失真度变化）
```

### 2.3 传播效果逻辑

在 `multi-agent-orchestrator.ts` 中实现 `spreadRumor` 函数：

**输入**：
- 源传闻（sourceRumor）
- 传播者 Agent ID（spreaderId）
- 目标 Agent ID（targetId）
- 传播者附加描述（message）

**处理**：
1. **生成新传闻**：
   - 新传闻 ID：`rumor-${Date.now()}-${random}`
   - 新内容：传播者 message 与原内容融合（取 message，如为空则用原内容）
   - 失真度调整：`newDistortion = Math.min(1, oldDistortion + 0.1~0.3 随机)`
   - 传播代次：`generation = oldGeneration + 1`
   - 父传闻 ID：`parentId = sourceRumor.id`
   - 传播者：`spreadBy = spreaderId`
   - 传播轮次：`spreadRound = currentRound`

2. **目标角色接收**：
   - 将新传闻加入目标角色的可见传闻
   - 初始相信概率计算：
     - 如果传播者是目标信任的人（好感度高），相信概率 +20%
     - 如果传播者可信度低（之前传播过假消息），相信概率 -20%
     - 基础相信概率 = `(1 - distortion) * 0.6`
   - 按概率决定目标是否相信

3. **传播者信誉系统**（简化版）：
   - 每个 Agent 有 `rumorCredibility: number`（初始 0.5）
   - 传播的传闻被证实为真 → credibility +0.1
   - 传播的传闻被证实为假 → credibility -0.2
   - 影响其他人对该 Agent 传播的传闻的相信概率

### 2.4 数据结构改动

```typescript
interface RumorEvent {
  // ... 已有字段
  parentId?: string              // 父传闻 ID
  spreadBy?: string              // 谁传播的
  spreadRound?: number           // 第几轮传播的
  generation: number             // 传播代次（0=原始，1=第1轮传播...）
}

interface AgentMemory {
  // ... 已有字段
  rumorCredibility: number       // 传播传闻的可信度（0-1）
}
```

### 2.5 UI 升级：传播链树

`rumor-propagation-panel.tsx` 升级：
- 传播链从线性时间线改为树形结构
- 显示多代传播关系（原始 → 第1代 → 第2代...）
- 每条传闻标注：传播者、传播轮次、代次
- 失真度用颜色渐变表示（越传越失真颜色越红）

树形展示用缩进 + 连接线的方式，不用复杂的图形库。

### 2.6 改动文件

- `src/lib/novel/story-simulation/types.ts` — RumorEvent 加字段，AgentMemory 加 rumorCredibility
- `src/lib/novel/story-simulation/sim-agent-tools.ts` — 新增 spread_rumor 工具
- `src/lib/novel/story-simulation/multi-agent-orchestrator.ts` — spreadRumor 函数
- `src/components/novel/story-simulation/rumor-propagation-panel.tsx` — 升级为传播树
- `src/lib/novel/story-simulation/spread-rumor.spec.ts` — 新增测试

## 三、Task 16：完整分支对比页面

### 3.1 目标

选中 2-3 个分支后，进入完整对比页面，从多维度对比分析。

### 3.2 页面结构

```
┌─ 分支对比 ─────────────────────────────────────┐
│  ← 返回分支管理  [分支A] vs [分支B]            │
├───────────┬───────────┬───────────────────────┤
│ 评分对比   │ 时间线对比 │ 关键差异              │
│ (雷达图)   │ (并排)    │ (列表)                │
├───────────┴───────────┴───────────────────────┤
│ 【推荐结论】                                    │
│  综合推荐分支 A，理由：...                      │
└───────────────────────────────────────────────┘
```

### 3.3 三个 Tab 详情

**Tab 1：评分对比（雷达图）**
- 7 维导演评分雷达图：剧情张力、节奏把控、角色发挥、人物弧光、信息密度、情感共鸣、逻辑自洽
- 2-3 条线分别代表不同分支
- 图例可点击显隐
- 用原生 SVG 手绘雷达图（不新增图表库依赖）

**Tab 2：时间线并排对比**
- 2-3 列并排时间线
- 每列显示一个分支的事件流
- 相同事件（内容相似度高）标绿色边框
- 独有事件标黄色边框
- 点击事件可以查看详情

**Tab 3：关键差异**
自动分析并列出：
- 角色结局差异（好感度对比、已知秘密对比）
- 事件数量与类型对比
- 剧情走向分歧点（从第几轮开始分岔）
- 评分差异最大的维度

### 3.4 推荐结论生成

基于评分差异自动生成文字推荐：
- 综合评分高的为推荐
- 列出 2-3 条主要优势
- 提示劣势分支的潜在问题

### 3.5 状态管理

在 store 中新增：
```typescript
compareBranchIds: string[]  // 选中用于对比的分支 ID 列表
isCompareMode: boolean      // 是否在对比模式
```

### 3.6 改动文件

- 新增 `src/components/novel/story-simulation/branch-compare-view.tsx` — 完整对比页面
- 修改 `src/components/novel/story-simulation/branch-manager-panel.tsx` — 加「对比」复选框和按钮
- 修改 `src/stores/story-simulation-store.ts` — 加对比状态

## 四、Task 17：侦探板自由布局

### 4.1 目标

线索板升级为侦探板风格：卡片可自由拖拽、手动连线、画布缩放平移。

### 4.2 核心功能

**1. 画布系统**
- 无限画布（可平移、缩放）
- 缩放范围：0.3x - 2x
- 拖拽画布平移
- 滚轮缩放（以鼠标位置为中心）

**2. 卡片系统**
- 线索卡片、角色卡片、事件卡片三种类型
- 卡片可自由拖动
- 卡片可选中、可删除
- 卡片显示：标题、类型标签、内容摘要
- 不同类型卡片不同颜色

**3. 连线系统**
- 手动连线：从卡片边缘拖出连线到另一张卡片
- 连线类型：关联、因果、矛盾、证实、证伪
- 连线上可加文字标签
- 连线可选中、可删除

**4. 布局操作**
- 自动布局：一键整理卡片位置（力导向算法简化版）
- 重置视图：回到初始位置
- 选中卡片对齐：左对齐、垂直居中等

**5. 持久化**
- 卡片位置、连线信息存在 store 中
- 切换分支时重置

### 4.3 技术实现

**不使用 cytoscape**，全部手写：
- 画布：transform + translate/scale 实现
- 拖拽：mousedown / mousemove / mouseup 事件
- 连线：SVG path + 贝塞尔曲线
- 自动布局：简单的排斥力 + 吸引力算法（50 行代码足够）

**性能优化**：
- requestAnimationFrame 统一渲染
- 卡片多时用 CSS transform 而非 top/left
- 连线用 SVG 元素，不重绘全部

### 4.4 数据结构

```typescript
interface DetectiveBoard {
  cards: DetectiveCard[]
  connections: DetectiveConnection[]
  viewport: { x: number; y: number; scale: number }
}

interface DetectiveCard {
  id: string
  type: "clue" | "character" | "event"
  title: string
  content: string
  x: number
  y: number
  width: number
  sourceId?: string  // 对应原始数据 ID
}

interface DetectiveConnection {
  id: string
  fromCardId: string
  toCardId: string
  type: "related" | "cause" | "contradiction" | "proves" | "disproves"
  label?: string
}
```

### 4.5 改动文件

- 重写 `src/components/novel/story-simulation/clue-board-panel.tsx` → 侦探板
- 或新增 `detective-board-panel.tsx`，保留旧线索板作为备选
- 修改 `story-simulation-store.ts` — 加侦探板状态
- 修改 `story-simulation-view.tsx` — 集成侦探板

## 五、Task 18：时间滑块 + 状态回放

### 5.1 目标

可以拖动时间滑块回到任意轮次，查看当时的关系状态、已知秘密、事件进展。

### 5.2 历史快照系统

**数据结构**：
```typescript
interface SimulationHistoryEntry {
  round: number
  nodeIndex: number
  nodeTitle: string
  agentStates: Map<string, {
    sentiments: Map<string, number>
    knownSecrets: Set<string>
    observedEvents: string[]
  }>
  eventCount: number
  rumorCount: number
}
```

**存储方式**：
- 在 `story-simulation-store` 中新增 `history: SimulationHistoryEntry[]`
- 每轮事件处理完成后，保存当前状态快照
- 最多保存 50 轮（超出取最早的丢弃）
- 只存增量还是全量？全量存，简单可靠，50 轮内存可接受

### 5.3 回放控制

**UI 组件**：
```
┌─ 回放控制 ────────────────────────────────────┐
│ ◀◀  │  ▶/⏸  │ ▶▶   速度: 1x │  实时模式    │
│ ○────●────────○──────○──────○               │
│ R1   R3       R5     R7     R9              │
│  ↑ 当前第 3 轮 / 共 9 轮                     │
└──────────────────────────────────────────────┘
```

**功能**：
- 滑块拖动：实时跳转到对应轮次
- 播放/暂停：自动从当前位置播放
- 前进/后退：单步前进后退
- 速度调节：0.5x / 1x / 2x / 4x
- 实时模式：退出回放，跟随最新状态
- 轮次标记：滑块上标记节点边界

### 5.4 回放影响范围

回放时更新哪些面板？
- ✅ 关系图（显示当时的关系状态）
- ✅ 线索板（显示当时已知的线索）
- ✅ 时间线（显示到该轮为止的事件）
- ✅ 传闻面板（显示当时的传闻）
- ❌ 不影响分支管理
- ❌ 不影响仿真引擎（只读回放，不修改引擎状态）

### 5.5 改动文件

- `src/stores/story-simulation-store.ts` — 新增 history 状态、回放控制方法
- `src/components/novel/story-simulation/relationship-graph-panel.tsx` — 集成回放控件
- `src/components/novel/story-simulation/timeline-panel.tsx`（如果有独立的话）— 回放适配
- 修改 `story-simulation-view.tsx` — 回放状态联动各面板

## 六、Task 19：Web Worker 性能优化

### 6.1 目标

把计算密集型操作移到 Web Worker，避免阻塞主线程，保证 UI 流畅。

### 6.2 识别可移到 Worker 的操作

| 操作 | 计算量 | 是否移 Worker | 说明 |
|---|---|---|---|
| 线索关联计算 | 中 | ✅ | 纯数据处理，无 DOM |
| 分支差异对比 | 中 | ✅ | 纯数据处理 |
| 侦探板自动布局 | 中 | ✅ | 纯计算 |
| 雷达图数据预处理 | 小 | ❌ | 不值得 |
| 时间轴快照计算 | 小 | ❌ | 不值得 |
| cytoscape 布局 | 大 | ❌ | cytoscape 依赖 DOM |

### 6.3 Worker 设计

**文件结构**：
```
src/workers/
  └── simulation-worker.ts      // Worker 入口
```

**Worker 支持的消息类型**：
```typescript
type WorkerMessage =
  | { type: "calc-clue-relations"; payload: { clues: ClueItem[] } }
  | { type: "calc-branch-diff"; payload: { branchA: SimulationBranch; branchB: SimulationBranch } }
  | { type: "calc-board-layout"; payload: { cards: DetectiveCard[]; connections: DetectiveConnection[] } }
```

**返回类型**：
```typescript
type WorkerResult =
  | { type: "clue-relations"; payload: { pairs: [string, string, number][] } }
  | { type: "branch-diff"; payload: DiffAnalysis }
  | { type: "board-layout"; payload: { cards: { id: string; x: number; y: number }[] } }
```

### 6.4 Vite Worker 配置

Vite 原生支持 Web Worker：
```typescript
import SimulationWorker from "@/workers/simulation-worker?worker"

const worker = new SimulationWorker()
worker.postMessage({ type: "calc-clue-relations", payload: ... })
worker.onmessage = (e) => { ... }
```

### 6.5 封装 Hook

创建 `useSimulationWorker` hook，封装 Worker 通信：
```typescript
function useSimulationWorker() {
  const calcClueRelations = (clues: ClueItem[]) => Promise<...>
  const calcBranchDiff = (a: Branch, b: Branch) => Promise<...>
  const calcBoardLayout = (cards, connections) => Promise<...>
}
```

内部用 request id 匹配请求响应，支持并发请求。

### 6.6 降级策略

Worker 加载失败或不支持时，降级为主线程计算（用 setTimeout 分批处理，避免长时间阻塞）。

### 6.7 改动文件

- 新增 `src/workers/simulation-worker.ts` — Worker 入口
- 新增 `src/hooks/use-simulation-worker.ts` — Worker 封装 Hook
- 修改线索板、分支对比、侦探板 — 使用 Worker 计算

## 七、整体改动清单

| 任务 | 新增文件 | 修改文件 |
|---|---|---|
| 15 主动传播 | 1 测试 | types.ts / sim-agent-tools.ts / orchestrator / rumor-panel |
| 16 分支对比 | 1 组件 | branch-manager-panel / store |
| 17 侦探板 | 1 组件（重写） | store / main-view |
| 18 时间回放 | - | store / relationship-graph / main-view |
| 19 Web Worker | 1 Worker + 1 Hook | 线索板 / 分支对比 / 侦探板 |

**合计**：新增约 6 个文件，修改约 10 个文件

## 八、风险与注意事项

1. **侦探板工作量最大**：拖拽 + 连线 + 画布，bug 多，调试难
2. **引擎改动需谨慎**：主动传播涉及仿真引擎，需充分测试防止回归
3. **Web Worker 增加复杂度**：异步通信、状态同步、调试困难
4. **内存占用**：时间快照 + 侦探板状态，内存可能上升
5. **向后兼容**：所有改动不破坏已有功能
6. **分批验证**：5 个任务虽然一起做，但每个任务独立验证，不等到最后
