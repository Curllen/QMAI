# 剧情推演室四期 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在推演室过程观察面板中新增 4 个可视化 Tab（传闻传播链、角色关系图、调查线索板），以及多结局分支管理与对比功能。

**Architecture:** 全部为 UI 层增量，不改动核心仿真引擎。4 个面板组件独立，通过 props 接收 store 中的数据。多结局分支在 store 层新增状态管理。

**Tech Stack:** React + TypeScript + Zustand + Tailwind CSS + cytoscape.js（已 vendor 打包）

## Global Constraints

- 分支：`juqingtuiyanshierqi`（在三期基础上叠加）
- 所有面向用户的提示语使用中文
- 不删除已有函数和组件
- 不顺手重构无关代码
- 保持与现有代码风格一致
- 4 个任务全部为 UI/交互增强，不改动仿真引擎逻辑
- cytoscape 从 vendor 包引入，不新增依赖

---

## Task 10: 传闻传播链可视化面板

**Files:**
- Modify: `src/components/novel/story-simulation/story-simulation-view.tsx` — 过程观察面板加 Tab 切换，新增「传闻」Tab
- Create: `src/components/novel/story-simulation/rumor-propagation-panel.tsx` — 传闻传播面板组件
- Test: （纯 UI 组件，不写单测，通过 dev 模式手动验证）

**Interfaces:**
- Consumes:
  - `blackboard.rumors: RumorEvent[]` — 全部传闻
  - `blackboard.visibleRumorsByAgent: Map<string, RumorEvent[]>` — 各角色可见传闻
  - `blackboard.allAgents: Map<string, NovelAgent>` — 所有角色
  - `events: TimelineEvent[]` — 时间线事件（用于找源事件）
- Produces:
  - `RumorPropagationPanel` React 组件，props: `{ rumors, visibleRumorsByAgent, agents, events }`

- [ ] **Step 1: 确认数据来源**

先读 `types.ts` 确认 `RumorEvent` 结构，读 `story-simulation-view.tsx` 确认过程观察面板的 Tab 切换方式。

- [ ] **Step 2: 创建 RumorPropagationPanel 组件骨架**

```tsx
// src/components/novel/story-simulation/rumor-propagation-panel.tsx
import { useState, useMemo } from "react"
import type { RumorEvent, NovelAgent, TimelineEvent } from "@/lib/novel/story-simulation/types"

type RumorFilter = "all" | "unverified" | "confirmed" | "debunked"

interface RumorPropagationPanelProps {
  rumors: RumorEvent[]
  visibleRumorsByAgent: Map<string, RumorEvent[]>
  agents: Map<string, NovelAgent>
  events: TimelineEvent[]
}

export function RumorPropagationPanel({ rumors, visibleRumorsByAgent, agents, events }: RumorPropagationPanelProps) {
  const [filter, setFilter] = useState<RumorFilter>("all")
  const [selectedRumorId, setSelectedRumorId] = useState<string | null>(null)

  const filteredRumors = useMemo(() => {
    return rumors.filter((r) => {
      if (filter === "all") return true
      if (filter === "unverified") return r.verifiedBy.length === 0
      if (filter === "confirmed") return r.verifiedBy.length > 0 && r.believedBy.length > 0
      if (filter === "debunked") return r.verifiedBy.length > 0 && r.believedBy.length === 0
      return true
    })
  }, [rumors, filter])

  const selectedRumor = useMemo(
    () => rumors.find((r) => r.id === selectedRumorId) || null,
    [rumors, selectedRumorId],
  )

  if (rumors.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border bg-muted/30 p-6 text-xs text-muted-foreground">
        暂无传闻数据
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      {/* 左侧：传闻列表 */}
      <div className="flex w-1/3 flex-col gap-2 overflow-hidden">
        {/* 筛选标签 */}
        <div className="flex gap-1 text-xs">
          {[
            { key: "all", label: "全部" },
            { key: "unverified", label: "未验证" },
            { key: "confirmed", label: "已验证" },
            { key: "debunked", label: "已证伪" },
          ].map((f) => (
            <button
              key={f.key}
              type="button"
              className={`rounded px-2 py-1 ${filter === f.key ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
              onClick={() => setFilter(f.key as RumorFilter)}
            >
              {f.label}
            </button>
          ))}
        </div>
        {/* 传闻卡片列表 */}
        <div className="flex-1 space-y-2 overflow-y-auto">
          {filteredRumors.map((rumor) => (
            <div
              key={rumor.id}
              className={`cursor-pointer rounded-md border p-2 text-xs ${
                selectedRumorId === rumor.id ? "border-primary bg-primary/5" : "bg-background/70 hover:bg-background"
              }`}
              onClick={() => setSelectedRumorId(rumor.id)}
            >
              <div className="mb-1 flex items-center gap-1">
                <span
                  className={`rounded px-1 py-0.5 text-[10px] ${
                    rumor.distortion < 0.3
                      ? "bg-green-100 text-green-700"
                      : rumor.distortion < 0.6
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-red-100 text-red-700"
                  }`}
                >
                  失真 {Math.round(rumor.distortion * 100)}%
                </span>
                <span className="text-[10px] text-muted-foreground">R{rumor.round + 1}</span>
              </div>
              <div className="line-clamp-2">{rumor.content}</div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {rumor.believedBy.length} 人相信 · {rumor.verifiedBy.length} 人验证
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧：传播链详情 */}
      <div className="flex-1 overflow-y-auto rounded-md border bg-background/50 p-3">
        {!selectedRumor ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            点击左侧传闻查看传播链
          </div>
        ) : (
          <div className="space-y-3 text-xs">
            <div>
              <div className="mb-1 text-[11px] font-medium text-muted-foreground">传闻内容</div>
              <div className="rounded bg-muted/50 p-2 text-sm">{selectedRumor.content}</div>
            </div>

            <div>
              <div className="mb-2 text-[11px] font-medium text-muted-foreground">传播链时间线</div>
              <div className="space-y-2">
                {/* 第 N 轮：生成 */}
                <div className="flex gap-2">
                  <div className="flex flex-col items-center">
                    <div className="h-3 w-3 rounded-full bg-primary" />
                    <div className="w-px flex-1 bg-border" />
                  </div>
                  <div className="pb-3">
                    <div className="text-[11px] text-muted-foreground">第 {selectedRumor.round + 1} 轮 · 传闻生成</div>
                    <div className="mt-0.5">
                      {selectedRumor.sourceId
                        ? `来源事件: ${events.find((e) => e.id === selectedRumor.sourceId)?.content?.slice(0, 30) || "未知"}...`
                        : "来源不明"}
                    </div>
                  </div>
                </div>

                {/* 角色可见 */}
                {Array.from(visibleRumorsByAgent.entries())
                  .filter(([_, rs]) => rs.some((r) => r.id === selectedRumor.id))
                  .map(([agentId, _]) => {
                    const agent = agents.get(agentId)
                    const isVerified = selectedRumor.verifiedBy.includes(agentId)
                    const believes = selectedRumor.believedBy.includes(agentId)
                    return (
                      <div key={agentId} className="flex gap-2">
                        <div className="flex flex-col items-center">
                          <div
                            className={`h-3 w-3 rounded-full ${
                              isVerified
                                ? believes
                                  ? "bg-green-500"
                                  : "bg-red-500"
                                : "bg-muted-foreground"
                            }`}
                          />
                          <div className="w-px flex-1 bg-border" />
                        </div>
                        <div className="pb-3">
                          <div className="text-[11px] text-muted-foreground">
                            {agent?.name || agentId} 看到传闻
                          </div>
                          {isVerified && (
                            <div className="mt-0.5">
                              调查结果：
                              <span className={believes ? "text-green-600" : "text-red-600"}>
                                {believes ? "确认属实" : "证伪"}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 在 story-simulation-view.tsx 中集成**

1. 在 `SimulationInProgressPanel` 组件的 props 中新增所需数据（rumors, visibleRumorsByAgent, agents）
2. 过程观察面板的 Tab 从 `timeline | debug` 扩展为 5 个 Tab，新增子 Tab 切换

**具体改动**：
- `activeStreamView` 保持 `timeline | debug`（顶层 Tab）
- 在 debug 视图内，`ProcessDebugPanel` 内部加二级 Tab：概览 / 传闻 / 关系 / 线索
- 或者：直接把顶层 Tab 扩展为 5 个

推荐方案：在 `ProcessDebugPanel` 内部加二级 Tab，保持顶层「时间线 / 过程观察」不变。

- [ ] **Step 4: 给 ProcessDebugPanel 传数据**

从 store 获取 rumors 和 agents 数据，传给 `ProcessDebugPanel`，再传给 `RumorPropagationPanel`。

数据来源：
- 目前 store 中没有 rumors 和 allAgents，需要从 debugTraces 的最新一条中提取
- 或者：在 store 中新增 `currentBlackboard` 状态，仿真过程中实时更新

**简化方案**：从 `latestTrace.blackboard` 中提取数据（需要确认 SimulationDebugTrace 中有没有完整 rumors 数据）。如果没有，新增字段到 trace 里。

先检查 `SimulationDebugTrace` 的结构，确认能否获取 rumors 和 agents。

- [ ] **Step 5: 验证**

Run: `npm run dev`
- 打开推演室，开启仿真
- 切换到过程观察 → 传闻 Tab
- 确认传闻列表显示正确
- 点击传闻卡片，右侧传播链正常显示

Run: `npx tsc --noEmit`
Expected: 0 errors

---

## Task 11: 角色关系图动态更新

**Files:**
- Create: `src/components/novel/story-simulation/relationship-graph-panel.tsx` — 关系图组件
- Modify: `src/components/novel/story-simulation/story-simulation-view.tsx` — 集成「关系」Tab

**Interfaces:**
- Consumes:
  - `agents: Map<string, NovelAgent>` — 所有角色及其 sentiments
- Produces:
  - `RelationshipGraphPanel` React 组件，props: `{ agents }`

- [ ] **Step 1: 确认 cytoscape 可用方式**

检查项目中 cytoscape 的引入方式（vendor 打包），确认 import 语句。

- [ ] **Step 2: 创建 RelationshipGraphPanel 组件**

```tsx
// src/components/novel/story-simulation/relationship-graph-panel.tsx
import { useEffect, useRef } from "react"
import cytoscape from "cytoscape"
import type { NovelAgent } from "@/lib/novel/story-simulation/types"

interface RelationshipGraphPanelProps {
  agents: Map<string, NovelAgent>
}

function sentimentToColor(value: number): string {
  if (value >= 60) return "#10b981" // 深绿 - 亲密盟友
  if (value >= 20) return "#34d399" // 浅绿 - 友好
  if (value >= -20) return "#9ca3af" // 灰 - 中立
  if (value >= -60) return "#f87171" // 浅红 - 敌对
  return "#ef4444" // 深红 - 死敌
}

function sentimentToWidth(value: number): number {
  const abs = Math.abs(value)
  return Math.max(1, Math.min(5, abs / 25 + 1))
}

function sentimentToLabel(value: number): string {
  if (value >= 60) return "亲密盟友"
  if (value >= 20) return "友好"
  if (value >= -20) return "中立"
  if (value >= -60) return "敌对"
  return "死敌"
}

export function RelationshipGraphPanel({ agents }: RelationshipGraphPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // 构建节点和边
    const nodes: cytoscape.ElementDefinition[] = []
    const edges: cytoscape.ElementDefinition[] = []

    agents.forEach((agent, id) => {
      nodes.push({
        data: { id, label: agent.name },
      })
    })

    // 收集所有关系对（去重，A-B 和 B-A 只取一次）
    const seenPairs = new Set<string>()
    agents.forEach((agent, id) => {
      agent.memory.sentiments.forEach((value, targetId) => {
        const pairKey = [id, targetId].sort().join("-")
        if (seenPairs.has(pairKey)) return
        seenPairs.add(pairKey)

        // 双向取平均
        const reverseValue = agents.get(targetId)?.memory.sentiments.get(id) ?? value
        const avgValue = (value + reverseValue) / 2

        edges.push({
          data: {
            id: pairKey,
            source: id,
            target: targetId,
            label: sentimentToLabel(avgValue),
            color: sentimentToColor(avgValue),
            width: sentimentToWidth(avgValue),
            value: Math.round(avgValue),
          },
        })
      })
    })

    // 初始化或更新 cytoscape
    if (!cyRef.current) {
      cyRef.current = cytoscape({
        container: containerRef.current,
        elements: [...nodes, ...edges],
        style: [
          {
            selector: "node",
            style: {
              "background-color": "#6366f1",
              "label": "data(label)",
              "text-valign": "center",
              "text-halign": "center",
              "color": "#fff",
              "font-size": "11px",
              "width": "40px",
              "height": "40px",
            },
          },
          {
            selector: "edge",
            style: {
              "width": "data(width)",
              "line-color": "data(color)",
              "target-arrow-color": "data(color)",
              "target-arrow-shape": "none",
              "curve-style": "bezier",
              "label": "data(label)",
              "font-size": "9px",
              "text-rotation": "autorotate",
              "color": "#6b7280",
            },
          },
        ],
        layout: {
          name: "cose",
          animate: true,
          animationDuration: 500,
        },
        wheelSensitivity: 0.2,
      })
    } else {
      // 更新数据
      cyRef.current.elements().remove()
      cyRef.current.add([...nodes, ...edges])
      cyRef.current.layout({ name: "cose", animate: true, animationDuration: 300 }).run()
    }

    return () => {
      // 组件卸载时不销毁，由 useEffect 下次更新复用
    }
  }, [agents])

  return (
    <div className="flex flex-1 flex-col gap-2">
      {/* 图例 */}
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded bg-emerald-500" />
          友好
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded bg-gray-400" />
          中立
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded bg-red-500" />
          敌对
        </span>
      </div>
      {/* 关系图容器 */}
      <div
        ref={containerRef}
        className="min-h-0 flex-1 rounded-md border bg-background/50"
        style={{ minHeight: "300px" }}
      />
    </div>
  )
}
```

- [ ] **Step 3: 在 ProcessDebugPanel 中集成「关系」Tab**

在 ProcessDebugPanel 内的二级 Tab 中新增「关系」，点击显示 RelationshipGraphPanel。

- [ ] **Step 4: 验证**

Run: `npm run dev`
- 打开推演室，开启仿真
- 切换到过程观察 → 关系 Tab
- 确认关系图正常渲染，节点和连线显示正确
- 拖动节点、缩放功能正常

Run: `npx tsc --noEmit`
Expected: 0 errors

**注意事项**：
- cytoscape 需要 DOM 容器有确定的高度，确保 flex 布局下容器能正确获取高度
- agents 更新时可能触发频繁重绘，考虑加 debounce 或只在每轮结束时更新

---

## Task 12: 多结局分支对比与推荐

**Files:**
- Modify: `src/stores/story-simulation-store.ts` — 新增 branches 状态和方法
- Create: `src/components/novel/story-simulation/branch-manager-panel.tsx` — 分支管理面板
- Modify: `src/components/novel/story-simulation/story-simulation-view.tsx` — 集成分支面板入口
- Test: （UI 组件不写单测，store 方法可写测试）

**Interfaces:**
- Consumes: 当前仿真状态（timelineEvents, agents, directorEvaluations 等）
- Produces:
  - `SimulationBranch` 类型
  - store 方法：`saveBranch(name)`, `deleteBranch(id)`, `renameBranch(id, name)`, `switchToBranch(id)`, `getBranchScore(id)`
  - `BranchManagerPanel` React 组件

- [ ] **Step 1: 在 types.ts 中新增 SimulationBranch 类型**

```typescript
export interface SimulationBranch {
  id: string
  name: string
  frameworkId: string
  mode: SimulationMode
  createdAt: string
  timelineEvents: TimelineEvent[]
  rumors: RumorEvent[]
  finalAgentSnapshots: { agentId: string; name: string; knownSecrets: string[]; sentiments: [string, number][] }[]
  directorEvaluations: DirectorEvaluation[]
  overallScore: number
  scoreDetails: {
    avgDirectorScore: number
    eventCount: number
    characterDiversity: number
    plotProgression: number
  }
}
```

- [ ] **Step 2: 在 store 中新增分支管理状态**

新增状态字段：
```typescript
branches: SimulationBranch[]
activeBranchId: string | null
```

新增方法：
```typescript
saveCurrentAsBranch: (name: string) => void
deleteBranch: (id: string) => void
renameBranch: (id: string, name: string) => void
switchToBranch: (id: string) => void
clearBranches: () => void
```

**综合评分计算函数**（纯函数，便于测试）：
```typescript
export function calculateBranchScore(
  directorEvaluations: DirectorEvaluation[],
  eventCount: number,
  activeAgentCount: number,
  totalAgentCount: number,
  goalProgress: number, // 0-1
): { overallScore: number; details: {...} } {
  const avgDir = directorEvaluations.length > 0
    ? directorEvaluations.reduce((s, e) => s + e.totalScore, 0) / directorEvaluations.length
    : 3.0
  const eventScore = Math.min(5, eventCount / 4) // 20 条事件 = 5 分
  const charScore = totalAgentCount > 0 ? (activeAgentCount / totalAgentCount) * 5 : 3
  const plotScore = goalProgress * 5

  const overall = avgDir * 0.5 + eventScore * 0.2 + charScore * 0.15 + plotScore * 0.15
  return {
    overallScore: Math.round(overall * 10) / 10,
    details: {
      avgDirectorScore: Math.round(avgDir * 10) / 10,
      eventCount,
      characterDiversity: Math.round(charScore * 10) / 10,
      plotProgression: Math.round(plotScore * 10) / 10,
    },
  }
}
```

- [ ] **Step 3: 创建 BranchManagerPanel 组件**

```tsx
// src/components/novel/story-simulation/branch-manager-panel.tsx
import { useState } from "react"
import type { SimulationBranch } from "@/lib/novel/story-simulation/types"

interface BranchManagerPanelProps {
  branches: SimulationBranch[]
  activeBranchId: string | null
  onSaveBranch: (name: string) => void
  onDeleteBranch: (id: string) => void
  onRenameBranch: (id: string, name: string) => void
  onSwitchBranch: (id: string) => void
  onCompare?: (ids: string[]) => void
}

export function BranchManagerPanel({
  branches,
  activeBranchId,
  onSaveBranch,
  onDeleteBranch,
  onRenameBranch,
  onSwitchBranch,
}: BranchManagerPanelProps) {
  const [newName, setNewName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")

  const sortedBranches = [...branches].sort((a, b) => b.overallScore - a.overallScore)
  const bestScore = sortedBranches[0]?.overallScore ?? 0

  return (
    <div className="flex flex-1 flex-col gap-3">
      {/* 保存新分支 */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="分支名称"
          className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          onClick={() => {
            if (newName.trim()) {
              onSaveBranch(newName.trim())
              setNewName("")
            }
          }}
          disabled={!newName.trim() || branches.length >= 10}
        >
          保存当前结果
        </button>
      </div>

      {branches.length >= 10 && (
        <div className="text-[10px] text-amber-600">分支数量已达上限（10 个），请删除旧分支后再保存</div>
      )}

      {/* 分支列表 */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {sortedBranches.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">暂无保存的分支</div>
        ) : (
          sortedBranches.map((branch, idx) => (
            <div
              key={branch.id}
              className={`rounded-md border p-2 text-xs ${
                activeBranchId === branch.id ? "border-primary bg-primary/5" : "bg-background/70"
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                {idx === 0 && branches.length > 1 && (
                  <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700">推荐</span>
                )}
                {editingId === branch.id ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => {
                      if (editName.trim()) onRenameBranch(branch.id, editName.trim())
                      setEditingId(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (editName.trim()) onRenameBranch(branch.id, editName.trim())
                        setEditingId(null)
                      }
                    }}
                    className="flex-1 rounded border px-1 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                    autoFocus
                  />
                ) : (
                  <span className="flex-1 font-medium">{branch.name}</span>
                )}
                <span className="text-[11px] font-semibold text-primary">{branch.overallScore.toFixed(1)}</span>
              </div>
              <div className="mb-2 text-[10px] text-muted-foreground">
                {branch.mode === "free" ? "自由涌现" : branch.mode === "event-driven" ? "事件驱动" : "决策树"} · {new Date(branch.createdAt).toLocaleString()}
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="rounded bg-muted px-2 py-0.5 text-[10px] hover:bg-muted/80"
                  onClick={() => onSwitchBranch(branch.id)}
                >
                  查看
                </button>
                <button
                  type="button"
                  className="rounded bg-muted px-2 py-0.5 text-[10px] hover:bg-muted/80"
                  onClick={() => {
                    setEditingId(branch.id)
                    setEditName(branch.name)
                  }}
                >
                  重命名
                </button>
                <button
                  type="button"
                  className="rounded bg-red-100 px-2 py-0.5 text-[10px] text-red-700 hover:bg-red-200"
                  onClick={() => {
                    if (confirm(`确定删除分支"${branch.name}"？`)) {
                      onDeleteBranch(branch.id)
                    }
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 在推演室主视图中集成分支面板**

在推演完成后的报告阶段或推演过程中，侧边栏新增「分支管理」入口。

具体集成位置：在 `story-simulation-view.tsx` 中，找到右侧面板区域，新增 BranchManagerPanel。

- [ ] **Step 5: 验证**

Run: `npm run dev`
- 打开推演室，完成一次仿真
- 保存当前结果为分支 A
- 再做一次仿真，保存为分支 B
- 确认分支列表正确排序，最高分的标「推荐」
- 切换查看不同分支，时间线正确切换
- 重命名、删除功能正常

Run: `npx tsc --noEmit`
Expected: 0 errors

---

## Task 13: 调查线索板

**Files:**
- Create: `src/components/novel/story-simulation/clue-board-panel.tsx` — 线索板组件
- Modify: `src/components/novel/story-simulation/story-simulation-view.tsx` — 集成「线索」Tab

**Interfaces:**
- Consumes:
  - `agents: Map<string, NovelAgent>` — 所有角色（knownSecrets, observedEvents, sentiments）
  - `visibleRumorsByAgent: Map<string, RumorEvent[]>` — 各角色可见传闻
  - `rumors: RumorEvent[]` — 全部传闻（用于找验证状态）
- Produces:
  - `ClueBoardPanel` React 组件，props: `{ agents, visibleRumorsByAgent, rumors }`

- [ ] **Step 1: 创建 ClueBoardPanel 组件**

```tsx
// src/components/novel/story-simulation/clue-board-panel.tsx
import { useState, useMemo } from "react"
import type { NovelAgent, RumorEvent } from "@/lib/novel/story-simulation/types"

type ClueType = "observed" | "confirmed" | "rumor" | "told"

interface ClueItem {
  id: string
  content: string
  type: ClueType
  source: string
  round: number
  agentId: string
  agentName: string
}

interface ClueBoardPanelProps {
  agents: Map<string, NovelAgent>
  visibleRumorsByAgent: Map<string, RumorEvent[]>
  rumors: RumorEvent[]
}

function clueTypeLabel(type: ClueType): string {
  switch (type) {
    case "observed": return "亲眼所见"
    case "confirmed": return "调查证实"
    case "rumor": return "传闻得知"
    case "told": return "他人告知"
  }
}

function clueTypeColor(type: ClueType): string {
  switch (type) {
    case "observed": return "border-green-400 bg-green-50 text-green-700"
    case "confirmed": return "border-blue-400 bg-blue-50 text-blue-700"
    case "rumor": return "border-yellow-400 bg-yellow-50 text-yellow-700"
    case "told": return "border-purple-400 bg-purple-50 text-purple-700"
  }
}

export function ClueBoardPanel({ agents, visibleRumorsByAgent, rumors }: ClueBoardPanelProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(
    agents.size > 0 ? agents.keys().next().value : null,
  )
  const [selectedClueId, setSelectedClueId] = useState<string | null>(null)

  // 构建所有线索
  const cluesByAgent = useMemo(() => {
    const result = new Map<string, ClueItem[]>()

    agents.forEach((agent, agentId) => {
      const clues: ClueItem[] = []

      // 1. knownSecrets → 已证实线索
      agent.memory.knownSecrets.forEach((secret, idx) => {
        clues.push({
          id: `${agentId}-secret-${idx}`,
          content: secret,
          type: "confirmed",
          source: "调查证实",
          round: 0,
          agentId,
          agentName: agent.name,
        })
      })

      // 2. 未验证的传闻 → 待验证线索
      const visible = visibleRumorsByAgent.get(agentId) ?? []
      visible.forEach((rumor) => {
        const isVerified = rumor.verifiedBy.includes(agentId)
        if (!isVerified) {
          clues.push({
            id: `${agentId}-rumor-${rumor.id}`,
            content: rumor.content,
            type: "rumor",
            source: `第 ${rumor.round + 1} 轮听到`,
            round: rumor.round,
            agentId,
            agentName: agent.name,
          })
        }
      })

      result.set(agentId, clues)
    })

    return result
  }, [agents, visibleRumorsByAgent])

  const currentClues = selectedAgentId ? cluesByAgent.get(selectedAgentId) ?? [] : []

  // 计算关联（简化版：关键词重叠）
  const relatedClues = useMemo(() => {
    if (!selectedClueId || !selectedAgentId) return []
    const selected = currentClues.find((c) => c.id === selectedClueId)
    if (!selected) return []

    const selectedWords = new Set(
      selected.content.split(/\s+|，|。|？|！|、|的|了|是|在|有/).filter((w) => w.length >= 2),
    )
    if (selectedWords.size === 0) return []

    return currentClues
      .filter((c) => c.id !== selectedClueId)
      .map((c) => {
        const cWords = new Set(
          c.content.split(/\s+|，|。|？|！|、|的|了|是|在|有/).filter((w) => w.length >= 2),
        )
        let overlap = 0
        for (const w of selectedWords) {
          if (cWords.has(w)) overlap++
        }
        return { clue: c, score: overlap / Math.max(selectedWords.size, cWords.size) }
      })
      .filter(({ score }) => score >= 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
  }, [selectedClueId, selectedAgentId, currentClues])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* 角色 tabs */}
      <div className="flex flex-wrap gap-1 border-b pb-2">
        {Array.from(agents.values()).map((agent) => (
          <button
            key={agent.characterId}
            type="button"
            className={`rounded px-2 py-1 text-xs ${
              selectedAgentId === agent.characterId
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/80"
            }`}
            onClick={() => {
              setSelectedAgentId(agent.characterId)
              setSelectedClueId(null)
            }}
          >
            {agent.name}
            <span className="ml-1 text-[10px] opacity-70">({cluesByAgent.get(agent.characterId)?.length ?? 0})</span>
          </button>
        ))}
      </div>

      {/* 类型图例 */}
      <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
        <span className="rounded border border-green-300 bg-green-50 px-1.5 py-0.5 text-green-700">🟢 亲眼所见</span>
        <span className="rounded border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-blue-700">🔵 调查证实</span>
        <span className="rounded border border-yellow-300 bg-yellow-50 px-1.5 py-0.5 text-yellow-700">🟡 传闻得知</span>
        <span className="rounded border border-purple-300 bg-purple-50 px-1.5 py-0.5 text-purple-700">🟣 他人告知</span>
      </div>

      {/* 线索卡片墙 */}
      <div className="flex-1 overflow-y-auto">
        {currentClues.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">该角色暂无线索</div>
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
            {currentClues.map((clue) => (
              <div
                key={clue.id}
                className={`cursor-pointer rounded-md border p-2 text-xs ${
                  selectedClueId === clue.id
                    ? "border-primary ring-1 ring-primary"
                    : `${clueTypeColor(clue.type)} border-opacity-60 hover:border-opacity-100`
                }`}
                onClick={() => setSelectedClueId(selectedClueId === clue.id ? null : clue.id)}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-medium">{clueTypeLabel(clue.type)}</span>
                  <span className="text-[10px] opacity-70">R{clue.round + 1}</span>
                </div>
                <div className="line-clamp-3">{clue.content}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 选中线索详情 + 关联 */}
      {selectedClueId && (
        <div className="max-h-40 overflow-y-auto rounded-md border bg-muted/20 p-2 text-xs">
          <div className="mb-1 text-[11px] font-medium text-muted-foreground">选中线索</div>
          <div className="mb-2">{currentClues.find((c) => c.id === selectedClueId)?.content}</div>
          {relatedClues.length > 0 && (
            <>
              <div className="mb-1 text-[11px] font-medium text-muted-foreground">关联线索</div>
              <div className="space-y-1">
                {relatedClues.map(({ clue, score }) => (
                  <div
                    key={clue.id}
                    className="cursor-pointer rounded bg-background/70 px-2 py-1 hover:bg-background"
                    onClick={() => setSelectedClueId(clue.id)}
                  >
                    <span className="text-[10px] text-muted-foreground">({Math.round(score * 100)}%) </span>
                    <span className="line-clamp-1">{clue.content}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 在 ProcessDebugPanel 中集成「线索」Tab**

在 ProcessDebugPanel 的二级 Tab 中新增「线索」Tab，点击显示 ClueBoardPanel。

- [ ] **Step 3: 验证**

Run: `npm run dev`
- 打开推演室，开启仿真
- 切换到过程观察 → 线索 Tab
- 切换不同角色，确认线索数量正确
- 点击线索卡片，查看详情和关联线索

Run: `npx tsc --noEmit`
Expected: 0 errors

---

## Task 14: 最终集成 + 打包验证

**Files:**
- Modify: `GenxinLOG/更新日志.md` — 添加四期更新内容

- [ ] **Step 1: 4 个面板全部集成后，做一次完整的 dev 模式测试**

Run: `npm run dev`
手动验证：
- 时间线 Tab 正常
- 过程观察 → 概览 Tab 正常
- 过程观察 → 传闻 Tab 正常
- 过程观察 → 关系 Tab 正常
- 过程观察 → 线索 Tab 正常
- 分支管理面板正常（保存/切换/删除）
- 各 Tab 切换流畅，无报错

- [ ] **Step 2: 全量 typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: 全量测试**

Run: `npx vitest run src/lib/novel/story-simulation/`
Expected: 全部通过

- [ ] **Step 4: build**

Run: `npm run build`
Expected: build 成功（chunk 大小警告可以忽略）

- [ ] **Step 5: 打包便携版**

Run: `npm run build:portable`
Expected: `release-portable/QMaiWrite.exe` 生成成功

- [ ] **Step 6: 更新日志**

在 `GenxinLOG/更新日志.md` 顶部添加四期更新内容。
