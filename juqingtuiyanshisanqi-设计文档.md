# 剧情推演室三期 — 设计文档

> 分支：`juqingtuiyanshierqi`（在二期基础上叠加）
> 日期：2026-07-04

## 一、背景与目标

在剧情推演室二期 6 项能力基础上，继续增强 3 个方向：

1. **investigate 工具验证传闻反馈闭环**：让 ReAct 的 investigate 工具真正能验证传闻，结果写入 Agent 记忆
2. **导演 Agent 多维度评分**：从 3 维度扩展为 7 维度综合评分
3. **事件池按节点阶段差异化生成**：动态事件池按起/承/转/合四阶段分类

## 二、任务 7：investigate 工具验证传闻反馈闭环

### 2.1 目标

Agent 通过 ReAct 调用 `investigate` 工具验证传闻真伪，验证结果立即写入 Agent 记忆，形成闭环。

### 2.2 方案

采用**当场判定真伪**方案：基于 `rumor.distortion` 概率当场判定，零额外 LLM 调用。

### 2.3 详细设计

#### investigate 工具定义

```typescript
// sim-agent-tools.ts
{
  name: "investigate",
  description: "调查验证某条传闻的真伪。传入要调查的传闻描述或编号。",
  parameters: {
    type: "object",
    properties: {
      rumorDescription: { type: "string", description: "要调查的传闻内容描述" }
    },
    required: ["rumorDescription"]
  }
}
```

#### 验证逻辑

1. 从 `blackboard.rumors` 中找到与描述最匹配的 `RumorEvent`（基于文本相似度匹配前 3 条，取最相似的）
2. 基于 `rumor.distortion` 判定真伪程度：
   - distortion < 0.3 → 90% 真 / 10% 部分真
   - distortion 0.3 - 0.6 → 40% 真 / 30% 部分真 / 30% 假
   - distortion > 0.6 → 20% 真 / 30% 部分真 / 50% 假
3. 生成验证结果描述（如"经过多方打听，确认属实"/"经查证，此为误传"/"调查后发现半真半假"）
4. 写入 Agent 记忆：
   - **真** → 加入 `agentMemory.knownSecrets`，`rumor.verifiedBy` 加入 agentId，`rumor.believedBy` 加入 agentId
   - **假** → 加入 `agentMemory.observedEvents`（类型为"investigation_result"，标注为已证伪），从该 Agent 可见传闻中移除
   - **部分真** → 同时写入 knownSecrets（修正后的真实内容，基于 sourceSecret 还原）和 observedEvents（调查记录）

#### 数据结构变更

```typescript
// types.ts - RumorEvent 新增字段
interface RumorEvent extends TimelineEvent {
  // ... 已有字段 ...
  verifiedBy: string[];  // 已验证此传闻的角色 ID 列表
}
```

#### 改动文件

- `src/lib/novel/story-simulation/types.ts`：RumorEvent 加 `verifiedBy`
- `src/lib/novel/story-simulation/sim-agent-tools.ts`：新增 investigate 工具
- `src/lib/novel/story-simulation/multi-agent-orchestrator.ts`：新增 `verifyRumor` 函数

#### 测试用例

- investigate 能正确找到匹配的传闻
- 低 distortion 传闻高概率判定为真
- 高 distortion 传闻高概率判定为假
- 验证为真后写入 knownSecrets 和 verifiedBy
- 验证为假后从 Agent 可见传闻中移除
- 验证为部分真时同时写入修正内容和调查记录

## 三、任务 8：导演 Agent 多维度评分

### 3.1 目标

导演 Agent 评估从 3 维度扩展为 7 维度综合评分，提供更全面的剧情质量反馈。

### 3.2 7 个评分维度

| 维度 key | 维度名称 | 说明 | 分值 |
|---|---|---|---|
| `tension` | 剧情张力 | 冲突强度、悬念感、读者期待感 | 1-5 |
| `pace` | 节奏把控 | 节奏松紧是否得当，是否拖沓或仓促 | 1-5 |
| `characterUtilization` | 角色发挥 | 各角色是否有足够戏份和存在感 | 1-5 |
| `characterArc` | 人物弧光 | 角色是否有成长、变化或转变 | 1-5 |
| `infoDensity` | 信息密度 | 信息量是否充足，是否空洞 | 1-5 |
| `emotionalResonance` | 情感共鸣 | 能否引发读者情感投入 | 1-5 |
| `logicConsistency` | 逻辑自洽 | 情节发展是否合理，有无矛盾 | 1-5 |

### 3.3 输出格式

```typescript
interface DirectorEvaluation {
  scores: {
    tension: number;
    pace: number;
    characterUtilization: number;
    characterArc: number;
    infoDensity: number;
    emotionalResonance: number;
    logicConsistency: number;
  };
  totalScore: number;        // 7 项加权平均
  highlights: string[];      // 亮点（2-3 条）
  issues: string[];          // 问题（1-2 条）
  suggestion: string;        // 综合建议
  shouldInjectEvent: boolean; // 是否注入转折事件
  injectedEvent?: string;    // 注入事件描述
}
```

### 3.4 注入条件保持不变

- `totalScore < 3.0` → 注入
- 或 `pace === 1`（节奏极差）→ 注入
- 其余不注入

### 3.5 改动文件

- `src/lib/novel/story-simulation/director-agent.ts`：扩展 `DirectorEvaluation` 类型，更新 prompt，更新解析逻辑
- `src/lib/novel/story-simulation/director-agent.spec.ts`：更新测试用例
- （可选）`src/components/story-simulation/story-simulation-view.tsx`：过程观察面板展示导演 7 维评分

### 3.6 测试用例

- LLM 返回 7 维度分数能正确解析
- totalScore 为 7 项加权平均
- 注入条件判断正确
- 低总分时触发注入
- 高总分时不注入

## 四、任务 9：事件池按节点阶段差异化生成

### 4.1 目标

动态事件池按剧情四阶段（起/承/转/合）分类，不同节点从对应阶段池中抽取。

### 4.2 四阶段定义

| 阶段 | key | 对应节点位置 | 事件特点 |
|---|---|---|---|
| 起 | `setup` | 第 1 个节点 | 背景介绍、人物登场、日常事件、环境铺垫 |
| 承 | `rising` | 中间节点（第 2 到 N-2） | 冲突升级、线索浮现、关系变化、误会加深 |
| 转 | `climax` | 倒数第 2 个节点（或 75% 位置之后） | 重大变故、真相揭露、危机爆发、抉择时刻 |
| 合 | `resolution` | 最后 1 个节点 | 结局揭晓、余波、人物归位、伏笔回收 |

### 4.3 生成逻辑

仿真开始时，一次 LLM 调用生成 24 个事件，按阶段分类（每阶段 6 个）。

Prompt 中明确要求 LLM 按四阶段输出，每个阶段 6 条。

#### 节点阶段判定规则

```typescript
function getNodeStage(nodeIndex: number, totalNodes: number): 'setup' | 'rising' | 'climax' | 'resolution' {
  if (nodeIndex === 0) return 'setup';
  if (nodeIndex === totalNodes - 1) return 'resolution';
  if (nodeIndex >= Math.floor(totalNodes * 0.75)) return 'climax';
  return 'rising';
}
```

#### 抽取与回退

1. 优先从当前阶段池中随机抽取（不重复）
2. 当前阶段池耗尽 → 从全局池（所有剩余事件）中抽取
3. 全局池也耗尽 → 回退固定 8 条事件

### 4.4 数据结构变更

```typescript
// types.ts
interface SimulatedEvent {
  // ... 已有字段 ...
  stage?: 'setup' | 'rising' | 'climax' | 'resolution';
}

interface DynamicEventPool {
  all: SimulatedEvent[];
  byStage: {
    setup: SimulatedEvent[];
    rising: SimulatedEvent[];
    climax: SimulatedEvent[];
    resolution: SimulatedEvent[];
  };
  usedIds: Set<string>;
}
```

### 4.5 改动文件

- `src/lib/novel/story-simulation/types.ts`：SimulatedEvent 加 `stage`，DynamicEventPool 加 `byStage`
- `src/lib/novel/story-simulation/event-pool-generator.ts`：prompt 加阶段分类要求，输出按 stage 分组
- `src/lib/novel/story-simulation/simulation-engine.ts`：`generateRandomEvent` 按节点阶段选池

### 4.6 测试用例

- LLM 生成事件按四阶段分类正确
- 节点阶段判定规则正确（边界节点）
- 各阶段池独立抽取不重复
- 阶段池耗尽后回退全局池
- 全局池耗尽后回退固定事件

## 五、整体改动清单

| 任务 | 新增文件 | 修改文件 |
|---|---|---|
| 7 investigate 闭环 | 0 | types.ts, sim-agent-tools.ts, multi-agent-orchestrator.ts + 1 测试 |
| 8 导演多维度 | 0 | director-agent.ts + 1 测试（+可选 UI） |
| 9 阶段事件池 | 0 | types.ts, event-pool-generator.ts, simulation-engine.ts + 1 测试 |

**合计**：修改约 7 个源文件 + 3 个测试文件

## 六、风险与注意事项

1. **investigate 匹配准确性**：传闻匹配基于文本相似度，可能匹配不准。可先用简单 includes 匹配 + 前 3 模糊匹配兜底。
2. **导演 prompt 长度增加**：7 维度描述会增加 prompt 长度，但仍在可控范围内（一次调用）。
3. **事件池生成 prompt 变复杂**：要求 LLM 按四阶段输出，可能偶尔格式不规范。需加强解析容错。
4. **不破坏二期功能**：所有改动均为增量，不修改已有函数签名和返回结构。
