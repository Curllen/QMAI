# AI Agent 工具架构 PRD（检索·分类·灵魂）

> 版本：v1.1
> 日期：2026-07-01
> 状态：评审决策已完成，待按分支实施
> 关联文档：`AI-Agent架构-问答记录.md`、`soul.md`、`AGENTS.md`

## 变更摘要（v1.0 → v1.1）

- 修订 4 处对现状代码描述的偏差（见 §1.2 与 §7.3 修订）。
- 按评审决策固化 7 项架构选型（见 §11 评审决策记录）。
- 补充 14 项缺失设计（见 §12 v1.1 补充章节）：retrieval 分卷、迁移路径、记忆体系边界、流式 UX、上下文追踪与工具调用 UI 合一、ChapterSnapshot 投影关系、剧情推演室分支隔离、默认路由表维护、目标章节解析、多灵魂边界、测试基础设施、token 预算、跟随 AI 模型耦合、错误恢复可感知。
- 执行模型从"管道前置 + Agent 兜底"修订为"Agent 统一基底 + 管道前置插件"（见 §3 修订与 §11 决策 1）。
- 功能范围优先级不变，但落地方式按 P0 任务拆分独立分支（见 §13 实施路线图）。

---

## 一、背景与目标

### 1.1 现状

QMaiWrite 当前已有一套近似架构在运行，但分散在多个模块、概念未显式化：

- 意图识别：`src/lib/novel/task-router.ts` 的 `routeTask`（正则打分，14 种 `NovelTaskIntent`）
- 上下文组装：`src/lib/novel/context-engine.ts` 的 `buildContextPack` + `contextPackToPrompt`（19 个数据源并行加载 → 合并 → token 裁剪）
- 灵魂约束：`soul.md` + `src/lib/novel/soul-doc.ts`（每次小说模式请求加载，priority 3）
- 快照/记忆：`src/lib/novel/chapter-ingest.ts` 的 `ChapterSnapshot`
- 执行：`src/lib/agent/runner.ts` 的 `AgentRunner`（多轮工具调用循环）

### 1.2 问题

1. **检索/分类/灵魂这三个概念只存在于代码运行时，用户不可见、不可编辑、不可手动维护。**
2. 19 个数据源全量并行加载，未按意图精准路由，无关上下文污染生成。
3. 修改类意图（改写/润色）与生成类意图走同一条 `AgentRunner` 流，无确认环节，误判即直接落盘。
4. 意图置信度仅被写入 `buildTaskDirective` 系统提示（`task-router.ts:394`），**未用于执行路径分支拦截**，低置信度意图仍默认走普通生成流，容易跑偏。
5. 大纲生成路径已通过 `safeBuildOutlineContextPack`（`outline-generation.ts:228`）调用 `buildContextPack` 并使用 `pack.soulDoc`（`outline-generation.ts:148`），但 `generateOutlineFile`（`outline-generation.ts:413-446`）等二级入口尚未统一接入，仍存在漏载 soul.md 的子路径风险。
6. `contextPackToPrompt`（`context-engine.ts:1071-1073`）超预算时按 **40% 头 : 60% 尾（即 2:3）** 头尾切字符串，会把伏笔/设定关键句从中间劈开，伤一致性。（v1.0 文档原写"4:1"为实测偏差，已更正。）
7. 生成返回内容靠 prompt 软约束，模型常带"以下是为你生成的章节……"等废话。

### 1.3 目标

把现有内部机制提升为**三个独立的、可命名、可维护、用户可编辑的产物文件**，并建立完整的「意图识别 → 检索路由 → 上下文删减 → 约束生成 → 结果收敛」管道，同时为复杂/盲区场景保留 agent 自主探索能力。

---

## 二、核心设计

### 2.1 三个磁盘文件（用户可读可编辑）

| 文件 | 位置 | 作用 | 性质 |
|------|------|------|------|
| `retrieval.md` | 项目根 | 章节检索索引：每章 300 字梗概 + 结构化字段 | 预生成 + 增量更新 |
| `classification.md` | 项目根 | 意图→数据源路由表（必载/选载/禁载） | 静态配置，随意图类型维护 |
| `soul.md` | 项目根（已有） | 生成内容总约束（作品级气质/叙事/语言/禁区） | 人定性约束 |

> ⚠️ 角色灵魂（`characterAuras`）和风格规则（去AI味 skill）**不并入 `soul.md`**，仍单独成文件。角色数量随故事增长，合并会撑爆上下文。`soul.md` 只放作品级总则。

### 2.2 检索文件 retrieval.md 规格

**结构**：每章一个条目，分为系统自动区和人工补充区：

```
## 第N章 - <章节中文标题>
<!-- qmai:auto:start -->
- 摘要：<300 字故事梗概，描述整章发展>
- 人物状态变化：<A 现在的身份/位置/情绪；B 的...>
- 伏笔变化：<新埋伏笔X；回收伏笔Y；伏笔Z状态更新>
- 时间线事件：<时间点1-事件；时间点2-事件>
- 结尾钩子：<本章结尾留下的悬念/压力>
- 文件路径：<指向该章 wiki markdown 的相对路径>
- 正文修改时间戳：<ISO 时间，辅助校验用>
- 正文哈希：<sourceHash，用于判断正文是否变化>
- 索引状态：<有效 / 可能过期 / 与正文冲突>
<!-- qmai:auto:end -->

<!-- qmai:manual:start -->
- 人工备注：<用户手动补充的隐藏设定、写作提醒、伏笔意图>
- 后续提醒：<用户不希望自动摘要覆盖的创作判断>
<!-- qmai:manual:end -->
```

**要点**：
- 300 字摘要只作主索引（故事梗概），**不替代结构化字段**。纯散文摘要覆盖不了"该不该回收伏笔"这类硬约束。
- 结构化字段是生成准确性的关键，`ChapterSnapshot` 已有这些字段（`chapter-ingest.ts`），直接复用。
- 自动区由系统生成和覆盖；人工补充区只由用户维护，系统增量更新时**不得覆盖**。
- 文件路径指向该章实际的 wiki markdown 文件，AI 需要完整原文时按路径二次读取。
- 过期判断以 `sourceHash` 为主、正文修改时间戳为辅。时间戳可能被系统或同步工具影响，不能作为唯一依据。

### 2.3 分类文件 classification.md 规格

**不是静态分类目录，而是意图路由表**：

```
## 意图路由表

### write_chapter / continue_chapter（续写下一章）
- 必载：大纲、最近剧情摘要、上一章结尾、当前人物状态、当前伏笔状态、项目灵魂
- 选载：时间线、角色认知状态、角色灵魂、相关设定
- 禁载：生成大纲意图的大纲原文全量

### generate_outline（生成大纲）
- 必载：项目灵魂、世界观设定、卷宗划分
- 选载：已有章节摘要
- 禁载：章节正文、章节快照细节

### modify_content（修改内容）
- 必载：目标章节正文、项目灵魂、修改反馈
- 选载：该章前后文摘要、相关人物状态
- 禁载：无关章节正文

### review_chapter / lint_chapter（审稿/去AI味）
- 必载：目标章节正文、项目灵魂、去AI味 skill
- 选载：写作风格规则
- 禁载：无关章节细节

### general_chat（普通对话）
- 必载：项目灵魂
- 选载：按关键词检索结果
- 禁载：全量快照
```

**文件头要求**：
```
---
classificationVersion: 1
intents:
  - write_chapter
  - continue_chapter
  - rewrite_chapter
  - polish_chapter
  - review_chapter
  - lint_chapter
  - generate_outline
  - search_plot
  - extract_memory
  - character_query
  - foreshadowing_query
  - timeline_query
  - setting_query
  - general_chat
---
```

**要点**：
- 静态分类目录对生成准确性没帮助，按意图精准装载才能避免无关上下文污染。
- 读取失败、版本缺失、意图缺失或用户误改格式时，系统必须回退到内置默认路由，不能让 AI 会话完全失效。
- 回退时在会话或内部追踪中提示：`classification.md 读取失败，已使用默认路由。`

### 2.4 灵魂文件 soul.md（已有，保持现状 + 路径校验）

- 保持作品级总则定位，现有内容不改动。
- `soul.md` 是**每个小说项目目录下的运行期文件**（非代码仓库根文件），由 `readSoulDoc(projectPath)`（`soul-doc.ts`）从 `${projectPath}/soul.md` 读取。
- 大纲生成、章节生成、修改内容、审稿路径都必须能读取 `soul.md`。当前 `safeBuildOutlineContextPack`（`outline-generation.ts:228`）已接入 `buildContextPack` 与 `pack.soulDoc`，但 `generateOutlineFile` 等二级生成入口需统一接入，作为回归验证项。

---

## 三、AI 会话流程（Agent 统一基底 + 管道前置插件）

> v1.1 修订：执行模型从"管道前置 + Agent 兜底"调整为"Agent 统一基底 + 管道前置插件"。`AgentRunner` 作为唯一执行引擎，管道（意图识别 → 检索路由 → 上下文删减 → 结果收敛）作为 Agent 入口前的上下文收敛阶段挂载。所有执行路径统一走 Agent 工具调用 UI（决策 1 与决策 4），不再有"管道优先 / Agent 降级"二选一。

### 3.1 主流程

```
用户发送请求
   ↓
① 提取请求关键词（tokenizeQuery，已有）
   ↓
② 识别用户意图（routeTask，已有）
   ↓
③ 判断置信度 ── 低于阈值 → 反向问用户澄清（不硬猜）
   ↓ 置信度达标
④ 查 classification.md 路由表，确定必载/选载/禁载数据源
   ↓
⑤ 按④的范围读检索文件，分析哪些章节/条目包含用户意图
   ↓
⑥ 读取命中条目（章节内容/大纲/记忆库/图谱等）
   ↓
⑦ 意图匹配校验：当前意图是生成章节/大纲/修改内容？
   ├─ 不匹配内容删减（先删低优先级整段，再删段内细节）
   └─ 留下有用信息
   ↓
⑧ 结合用户要用的 skill + SOUL.md 约束，生成内容
   ↓
⑨ 结果强约束收敛（见 3.3）
   ↓
⑩ 返回用户
```

### 3.1.1 上下文追踪记录（与工具调用 UI 合一）

> v1.1 修订（决策 4）：上下文追踪记录与工具调用 UI 共享同一数据模型，**合二为一**。项目记忆已要求"工具调用过程需在UI中完整展示，包括调用内容和状态"，本节定义的字段既是内部追踪记录，也是工具调用 UI 的渲染数据源，不再分两份。

每次 AI 会话在小说模式下都应生成一份追踪记录，作为工具调用 UI 的数据源，可折叠查看，不混入最终正文：

| 字段 | 说明 |
|------|------|
| `intent` | 本次识别出的意图 |
| `confidence` | 意图置信度 |
| `routeSource` | 使用 `classification.md` 还是内置默认路由（含两层路由合并结果，见决策 6） |
| `loadedSources` | 实际加载的数据源 |
| `blockedSources` | 因意图路由被禁载的数据源 |
| `retrievalHits` | 命中的章节索引、记忆、图谱或大纲条目 |
| `trimmedSections` | 因预算或意图不匹配被删减的上下文段 |
| `contextBudget` | 本次 token 预算与实际占用（见 §12.12） |
| `toolCalls` | Agent 执行过程中各工具调用明细（名称、入参、结果、耗时、状态） |
| `resultProtocol` | 结果解析器校验意图输出协议的过程（见 §3.3） |
| `fallbackReason` | 路由回退、解析重试、人工区冲突等触发原因 |

该记录用于定位问题：生成错误时可以判断是意图识别错、分类路由错、检索命中错、上下文裁剪错、token 预算超限错、还是模型输出没有收敛。工具调用 UI 直接消费该记录，按时间线卡片展示。

### 3.2 Agent 自主探索（统一执行基底下的盲区拓展）

> v1.1 修订：原"Agent 兜底降级"语义取消，Agent 始终是统执行基底。下列场景不再"降级到 Agent"，而是 Agent 在管道前置收敛后**额外自主调用工具**拓展探索。

| 触发条件 | Agent 行为 |
|---------|---------|
| 意图置信度低于阈值 | 反向问用户澄清（见 §3.1 主流程③），不进入 Agent 自主探索 |
| 前置检索未命中关键信息 | Agent 自主调用 `read-chapter` / `search-chapters` / `search-memory` 等工具补全盲区 |
| 用户请求跨多意图 | Agent 拆解为多步工具调用链，每步独立走结果解析器 |
| 用户请求需要外部信息 | Agent 调用注册的扩展工具（项目记忆中的"Agent工具框架需设计为通用框架，支持工具注册"） |

**约束**：Agent 自主调用工具的过程在工具调用 UI 中完整展示（决策 4），调用结果仍受结果解析器校验，未通过协议校验不得入库（见 §3.3 与 §5.4）。

### 3.3 结果强约束收敛

| 意图 | 返回内容 |
|------|---------|
| write_chapter / continue_chapter | 仅：章节标题 + 章节正文 |
| generate_outline | 仅：大纲标题 + 大纲正文 |
| modify_content | diff 预览 + 弹窗确认（见 3.4），确认后落盘 |
| review_chapter / lint_chapter | 审查报告 + 修订建议 |

**强约束实现**：不靠 prompt 软提示，改为生成后结构化解析：
1. 解析 frontmatter + 正文结构。
2. 解析失败 → 剥头尾非正文段落，重试。
3. 仍失败 → 标记并提示用户，不直接落盘。

**按意图输出协议**：

```ts
type ChapterGenerationResult = {
  type: "chapter"
  title: string
  body: string
}

type OutlineGenerationResult = {
  type: "outline"
  title: string
  body: string
}

type ModifyContentResult = {
  type: "modify"
  targetFile: string
  originalContent: string
  proposedContent: string
  diff: string
}

type ReviewResult = {
  type: "review"
  issues: Array<{ severity: "高" | "中" | "低"; message: string }>
  suggestions: string[]
}
```

解析器不只负责剥掉"以下是..."这类废话，还要判断结果是否符合当前意图的协议。不符合协议时，不允许直接进入保存、入库或记忆更新流程。

### 3.4 修改内容弹窗确认（codex 式）

`modify_content` 意图族执行流程：

```
识别为修改意图
   ↓
生成 diff 预览（不落盘）
   ↓
弹窗展示：原内容 / 修改后内容 / diff 高亮
   ↓
用户选择：确认 / 编辑后确认 / 取消
   ├─ 确认 → 落盘
   ├─ 编辑后确认 → 套用用户编辑后落盘
   └─ 取消 → 不落盘，返回会话
```

**新增意图族**：`modify_content` 是父级安全闸门，不完全替代现有具体意图。`rewrite_chapter`、`polish_chapter`、扩写、删减、纠错等仍保留为子意图或参数，用于决定上下文范围、提示词和弹窗文案；但只要属于修改落盘类任务，都必须先经过 `modify_content` 确认闸门。

---

## 四、上下文删减策略（两级裁剪）

### 4.1 当前问题

`contextPackToPrompt`（`context-engine.ts:1025`）超预算时按 4:1 头尾切字符串，会把伏笔关键句或人物状态段从中间切开。

### 4.2 新策略

**第一级：按 SECTION_PRIORITY 删整段**
- 优先级低的整段先删（如"写作风格" priority 17 先于"当前伏笔状态" priority 10）。
- 必载段（大纲/灵魂/当前任务）受保护，不删。

**第二级：段内删细节**
- 整段都删掉还不够时，高优先级段内按"摘要头 + 关键结构化字段 + 结尾钩子"保留，删中间冗余。

**不再用头尾切字符串。**

### 4.3 派生字段（保留现状）

以下派生字段继续由 `buildContextPack` 生成：
- `chapterGoal`：从大纲提取本章目标
- `mustDo`：章节目标 + 前章结尾 + 待回收伏笔
- `mustAvoid`：正史 + 时间线 + 人设约束
- `nextChapterAdvice`：下一章推进建议

> 若 SOUL.md 或用户指令要求返回"下一章建议"，则生成结果末尾附该字段；否则不附。**按意图严格收敛**——生成章节只返回标题+正文，不留下一章建议在正文里。

---

## 五、数据一致性（同步闸门）

### 5.1 retrieval.md 同步

| 触发事件 | 动作 |
|---------|------|
| 章节 ingestion（`chapter-ingest.ts`）| 重新生成该章自动区，增量更新 retrieval.md，保留人工补充区 |
| 用户手动编辑章节正文并保存 | 校验 `sourceHash` 和正文修改时间戳，标记 retrieval.md 该条目过期，提示或自动重新生成 |
| 用户删除章节 | 从 retrieval.md 移除该条目 |
| 启动时加载 | 校验所有条目 `sourceHash`，过期条目标记 `可能过期` 或静默重生 |
| 用户手动编辑 retrieval.md 人工区 | 永久保留，不被自动更新覆盖 |

### 5.2 classification.md 同步

- 相对稳定，随 `NovelTaskIntent` 枚举变更手动维护。
- 文件头注明版本号和对应枚举值，代码读取时校验版本。

### 5.3 soul.md 同步

- 项目级人定性文件，不自动更新内容。
- 加载时校验非空，空则提示用户先写灵魂。

### 5.4 生成章节到记忆入库生命周期

生成内容必须按以下生命周期推进，避免草稿、废稿或未确认修改提前进入正史记忆：

```
AI 生成章节
  → 结果解析器校验输出协议
  → 用户确认保存或执行明确保存动作
  → 写入章节文件
  → 章节 ingestion
  → 生成 ChapterSnapshot
  → 更新 retrieval.md 自动区
  → 更新记忆库 / 伏笔 / 时间线 / 图谱
```

未确认的 AI 回复只属于会话草稿，不得进入 `retrieval.md`、记忆库、伏笔追踪、时间线或图谱。

### 5.5 冲突检测

当章节正文、`retrieval.md`、记忆库、伏笔追踪或时间线之间出现不一致时，系统不得静默混用冲突内容。

| 冲突类型 | 处理方式 |
|---------|---------|
| 章节正文 hash 与 retrieval.md 不一致 | 标记该章节索引过期，优先以章节正文为准 |
| retrieval.md 与记忆库字段冲突 | 提示用户重新摄取该章节或重建派生记忆 |
| 用户人工区与自动区冲突 | 保留人工区，不自动覆盖；在上下文追踪中标记冲突 |
| classification.md 禁载了必需数据源 | 使用内置默认路由补齐必需项，并记录回退原因 |

---

## 六、功能范围与优先级

### P0（必做，一致性命根）

| # | 任务 | 影响文件 |
|---|------|---------|
| 1 | retrieval.md 生成与增量更新机制（自动区/人工区/sourceHash） | `chapter-ingest.ts`、新增 `retrieval-index.ts` |
| 2 | classification.md 路由表读取与意图→数据源映射，失败时回退默认路由 | `context-engine.ts`、新增 `classification-router.ts` |
| 3 | 意图置信度阈值 + 低置信反向问用户 | `task-router.ts`、`chat-panel.tsx` |
| 4 | modify_content 父级安全闸门 + 修改内容弹窗确认（codex 式） | `chat-panel.tsx`、新增 `modify-confirm-dialog.tsx` |
| 5 | 大纲生成路径验证 soul.md 全程加载 | `outline-generation.ts` |
| 6 | 两级裁剪替换头尾切 | `context-engine.ts`（`contextPackToPrompt`） |
| 7 | 生成章节到保存、摄取、检索索引、记忆入库的生命周期约束 | `chat-panel.tsx`、`chapter-ingest.ts` |

### P1（必做，质量护栏）

| # | 任务 | 影响文件 |
|---|------|---------|
| 8 | 结果强约束收敛（结构化解析 + 剥头尾重试 + 意图输出协议） | 新增 `result-parser.ts`，`runner.ts` / `deep-chapter-generation.ts` 调用 |
| 9 | 上下文追踪记录（意图、路由、命中、裁剪、兜底原因） | 新增 `context-trace.ts`、`chat-panel.tsx` |
| 10 | 冲突检测（正文/retrieval/记忆库/人工区） | `retrieval-index.ts`、`chapter-ingest.ts` |
| 11 | Agent 兜底降级判定（置信度/未命中/跨意图） | `chat-panel.tsx` 路由分发处 |

### P2（增强）

| # | 任务 | 影响文件 |
|---|------|---------|
| 12 | retrieval.md 过期标记 UI | `chat-panel.tsx` / 工具栏 |
| 13 | classification.md 版本校验与升级提示 | `classification-router.ts` |
| 14 | 上下文追踪记录可折叠查看 UI | `chat-panel.tsx` |

---

## 七、清单与变更点

### 7.1 新增文件

| 文件 | 作用 |
|------|------|
| `${projectPath}/retrieval.md` | 章节检索索引（用户可编辑） |
| `${projectPath}/classification.md` | 意图→数据源路由表（用户可编辑） |
| `src/lib/novel/retrieval-index.ts` | retrieval.md 读写 + 增量更新 |
| `src/lib/novel/classification-router.ts` | classification.md 读取 + 意图映射 |
| `src/lib/novel/result-parser.ts` | 生成结果结构化解析 + 剥头尾 |
| `src/lib/novel/context-trace.ts` | AI 会话上下文追踪记录类型、生成与格式化 |
| `src/components/chat/modify-confirm-dialog.tsx` | 修改确认弹窗 |

### 7.2 修改文件

| 文件 | 改动点 |
|------|--------|
| `src/lib/novel/context-engine.ts` | 按意图路由装载（替全量并行）；`contextPackToPrompt` 两级裁剪 |
| `src/lib/novel/task-router.ts` | 新增 `modify_content` 父级意图标记；置信度阈值出口 |
| `src/lib/novel/outline-generation.ts` | 验证大纲生成前加载 soul.md |
| `src/components/chat/chat-panel.tsx` | 路由分发加 modify 确认闸门 + agent 降级判定 + 上下文追踪 |
| `src/lib/novel/chapter-ingest.ts` | ingestion 完成后触发 retrieval.md 增量更新，保留人工区并写入 sourceHash |

### 7.3 不改动

- `soul.md` 内容保持现状。
- `ChapterSnapshot` 数据结构复用，不改动。
- `AgentRunner` 工具调用体系保留，并升级为统一执行基底（见 §11 决策 1 与 §3 修订）。
- 19 个数据源 (`context-data-sources.ts`) 保留，按分类路由按需调用而非全量。
- 去 AI 味 skill 体系不重构：`de-ai-skill-library.ts` 已实现完整 CRUD（5 内置 + 项目级自定义 + 备份恢复 + 旧版迁移），不再回退到 raw import 模式；`de-ai-adapter.ts` 的场景化智能选择（web-novel/popular-science/commentary/translation/default）保持现状，仅按意图路由决定是否加载 skill 内容。

---

## 八、成功标准

1. 用户可在项目根看到并手动编辑 `retrieval.md`、`classification.md`、`soul.md` 三个文件。
2. 续写/大纲/审稿等简单意图走线性管道，每次生成上下文可预测、可复现。
3. 修改类意图必须弹窗确认后才落盘，取消则不落盘。
4. 底置信度意图反向问用户，不硬猜跑偏。
5. 大纲生成带 soul.md，与正文气质一致。
6. 超预算裁剪不再切字符串，按两级策略保留伏笔/设定关键句。
7. 生成结果按意图严格收敛，不混入分析文本或废话。
8. 复杂/盲区场景可降级 agent 自主探索。
9. 未确认保存的 AI 草稿不会进入 retrieval.md、记忆库、伏笔追踪、时间线或图谱。
10. `retrieval.md` 自动更新时不会覆盖用户人工补充区。
11. 每次小说模式 AI 会话都能追踪意图、路由、加载源、命中内容和裁剪内容。
12. 不破坏现有续写、深度生成、大纲生成、去AI味等功能（旧功能不回退）。

---

## 九、测试与验证用例

1. **章节生成收敛**：输入“生成下一章”，最终结果只包含章节标题和正文，不包含分析说明、客套话或下一章建议。
2. **低置信度反问**：输入“这段再处理一下”，若无法确定是润色、改写还是续写，系统先反问用户，不直接生成。
3. **修改不落盘**：输入“润色当前章节”，系统生成 diff 预览并弹窗确认；用户取消后，章节文件不变。
4. **索引过期检测**：手动修改章节正文后，`retrieval.md` 对应条目通过 `sourceHash` 被标记为过期。
5. **人工区不覆盖**：用户在 `retrieval.md` 人工补充区写入隐藏设定，重新 ingestion 后人工区内容仍保留。
6. **分类兜底**：破坏 `classification.md` 格式后，AI 会话使用内置默认路由，并记录回退原因。
7. **冲突提示**：章节正文与检索索引不一致时，系统优先以正文为准，并提示重新生成索引或重建派生记忆。
8. **上下文追踪**：一次生成完成后可查看本次意图、置信度、加载源、禁载源、检索命中、裁剪段和 Agent 兜底原因。

---

## 十、风险与限制

1. **retrieval.md 一致性是最大风险点**：依赖变更触发增量更新，若触发遗漏则索引过期。缓解：启动时全量校验 `sourceHash` + 生成时标记过期。
2. **Agent 自主探索仍面临风格漂移**：多轮工具调用可能让生成节奏跑偏。缓解：Agent 仍受 soul.md 约束 + 结果强约束收敛 + 工具调用 UI 透传。
3. **classification.md 维护成本**：新增意图需同步更新路由表。缓解：版本校验 + 升级提示 + 默认路由表与模板同源（决策 5）。
4. **弹窗确认增加交互步骤**：修改流变重。缓解：仅 `modify_content` 意图族弹窗，生成类不弹。
5. **人工补充区可能和自动区冲突**：用户人工判断可能与系统摘要不一致。缓解：不覆盖人工区，但在上下文追踪中标记冲突。
6. **retrieval 分卷后跨卷检索复杂度**：决策 2 引入分卷后，跨卷伏笔查询需要合并多卷结果。缓解：主索引 `retrieval/index.md` 维护全局伏笔/人物/时间线倒排指针。
7. **两层路由表合并冲突**：决策 6 引入项目级 + 分支级两层路由表，分支补丁可能与项目路由矛盾。缓解：合并时分支级只允许"追加意图"和"收窄禁载"，不允许"放宽禁载"，冲突时优先项目级。
8. **token 预算与多灵魂边界叠加**：决策要求作品级 soul.md + 角色灵魂 + 自定义灵魂 + 去 AI 味 skill 共存，长篇作品可能超预算。缓解：按 §12.12 token 预算分配表倒序裁剪。

---

## 十一、评审决策记录（v1.1 固化）

> 本节为评审阶段对 7 个争议点的固化决策，作为后续实现的不可变约束。决策原则：以软件最大化效果为优先，不考虑 token 消耗与最小化修改。

### 决策 1：执行基底 = Agent 统一基底 + 管道前置插件

- `AgentRunner`（[src/lib/agent/runner.ts](file:///c:/QMAI_C/QMAI-main/src/lib/agent/runner.ts)）作为唯一执行引擎，所有小说模式 AI 会话统一走 Agent 工具调用循环。
- 管道（意图识别 → 检索路由 → 上下文删减 → 结果收敛）作为 Agent 入口前的上下文收敛阶段挂载，不作为平行的"另一条流"。
- 工具调用 UI 统一展示所有执行路径，包括管道前置阶段的"虚拟工具调用"（如 `route-task`、`load-context`、`trim-context`）。
- 取消 v1.0 中"管道优先 + Agent 兜底降级"语义，避免二选一的执行模型分裂。

**当前分支落地度（2026-07-01 核查）**：决策 1 共 5 个核心点，1 个已实现（有缺口），3 个部分实现，1 个未实现。详细落地度对照与 M1 阶段补齐清单见 §14。当前 `gongjudiaoyongyouhua` 分支的 Agent 基底（runner/types/registry/events/result/UI 装配链路）已扎实可用，M1 阶段主要工作是补齐管道前置插件化、虚拟工具、UI 状态、降级路径这 4 个缺口。

### 决策 2：retrieval.md 形态 = 主索引文件 + 分卷详情文件

- `${projectPath}/retrieval/index.md`：主索引，仅存全局章节清单、伏笔倒排、人物倒排、时间线倒排、各章定位指针。
- `${projectPath}/retrieval/vol-{N}.md`：按卷宗或每 50 章一段分卷，存该卷章节的自动区 + 人工补充区完整条目。
- 分卷阈值：单卷超过 50 章或单文件超过 80KB 时自动拆分。
- 启动加载时只读主索引，按需懒加载分卷。

### 决策 3：retrieval.md 自动区 = ChapterSnapshot 的只读投影

- `ChapterSnapshot`（`chapter-ingest.ts:65-100`）是数据真源，retrieval.md 自动区是它的 markdown 序列化视图。
- 写入路径单向：ingestion → 生成 ChapterSnapshot → 投影到 retrieval.md 自动区。**禁止反向写**。
- 用户在 retrieval.md 自动区的手改会在下次 ingestion 时被覆盖（自动区本来就是只读视图）；用户的创作判断必须写在人工补充区。
- 这避免了 v1.0 隐含的双写不一致风险。

### 决策 4：上下文追踪 = 工具调用 UI 数据源（合二为一）

- 上下文追踪记录（§3.1.1）与工具调用 UI 共享同一数据模型。
- 项目记忆要求"工具调用过程需在UI中完整展示，包括调用内容和状态"——本字段集就是该 UI 的数据源。
- 不再分"内部追踪记录（不开源）"和"工具调用 UI 数据（开源）"两份。
- UI 形态：时间线卡片，每张卡展示一次工具调用（含虚拟工具与真实工具），支持折叠。

### 决策 5：默认路由表位置 = classification.md 模板 + 代码读取同一份

- `src/lib/novel/classification-router.ts` 内置的默认路由表常量，与 `${projectPath}/classification.md` 初始模板内容**完全一致同源**。
- 模板生成命令 `npx qmai init-classification` 从代码常量直接导出，避免代码与模板漂移。
- classification.md 文件损坏或读取失败时，直接从代码常量回退，并提示用户"已使用内置默认路由，可执行 init-classification 重建文件"。
- v1.0 中"代码硬编码默认值 + 模板另一份"的双源问题被根除。

### 决策 6：classification.md 与剧情推演室分支 = 项目级 + 分支级两层路由表

- `${projectPath}/classification.md`：项目级路由，对应 main 分支 14 意图。所有项目必有此文件。
- `${projectPath}/classification.{feature}.md`：分支级路由补丁，命名按分支特征，如 `classification.story-sim.md`。
- 加载时合并语义：分支级只允许"追加意图"和"收窄禁载"，不允许"放宽项目级禁载"。冲突时项目级优先。
- main 分支代码读取时若分支级文件不存在则静默跳过，不报错。
- 剧情推演室分支独立维护 `classification.story-sim.md`，不合并 main 分支（符合"剧情推演室绝对不合并 main"的项目记忆约束）。

### 决策 7：retrieval.md 人工区编辑入口 = 软件内专用编辑面板

- 不依赖外部编辑器手动改 markdown，提供软件内专用面板。
- 面板按章节卡片展示，每张卡分"自动区（只读折叠）"和"人工补充区（可编辑）"。
- 前端校验 `<!-- qmai:manual:start -->` / `<!-- qmai:manual:end -->` 标签结构，格式错误时禁止保存并提示用户。
- 编辑后原子写入对应分卷文件，不触碰自动区。
- 项目记忆要求"生成章节时默认总是输出标题"等规则在面板中也可视化提示。

---

## 十二、v1.1 补充章节（14 项缺失设计）

### §12.1 retrieval.md 体量与性能策略

- **加载策略**：会话启动只读 `retrieval/index.md` 主索引；按意图路由命中后懒加载对应分卷。
- **检索方案**：主索引维护三类倒排指针——伏笔倒排（伏笔名 → 出现章节列表）、人物倒排（人物名 → 状态变化章节列表）、时间线倒排（时间点 → 章节列表）。命中后按指针定位分卷。
- **缓存**：单次会话内已加载分卷缓存在内存，会话结束释放。
- **超阈值告警**：分卷数超过 5 个时，UI 提示用户考虑归档旧卷。

### §12.2 存量项目迁移路径

- **首次启用检测**：项目根无 `retrieval/index.md` 且存在 `wiki/chapters/` 时，触发迁移流程。
- **批量 ingestion**：弹出迁移向导弹窗，显示章节数量和预计耗时，提供"全量迁移 / 选择卷宗迁移 / 稍后迁移"三选项。
- **进度展示**：迁移过程在工具调用 UI 中以批量任务卡片展示，可中断、可续传。
- **失败处理**：单章失败标记为"待重试"，不阻塞其他章节；全量完成后输出失败清单。
- **回滚**：迁移前自动备份原 `wiki/chapters/` 的索引文件，迁移失败可一键恢复。
- **存量数据兼容**：现有 `ChapterSnapshot` 数据可直接投影，无需重新生成。

### §12.3 与现有记忆体系的边界（数据源归属矩阵）

| 字段 | 真源 | 派生消费方 | 同步方向 |
|------|------|-----------|---------|
| 章节摘要 | `ChapterSnapshot.summary` | retrieval.md 自动区、记忆中心 | Snapshot → retrieval（投影） |
| 人物状态变化 | `ChapterSnapshot.characterStateChanges` | retrieval.md 自动区、记忆中心、图谱节点 | Snapshot → 三方派生 |
| 伏笔变化 | `ChapterSnapshot.foreshadowingChanges` | retrieval.md 自动区、伏笔追踪 | Snapshot → 两方派生 |
| 时间线事件 | `ChapterSnapshot.timelineEvents` | retrieval.md 自动区、时间线 | Snapshot → 两方派生 |
| 结尾钩子 | `ChapterSnapshot.endingHook` | retrieval.md 自动区 | Snapshot → retrieval |
| 人工备注 | retrieval.md 人工补充区 | （不派生） | 用户 → retrieval（单向） |
| 作品级总则 | `soul.md` | 所有生成路径 | 用户 → soul.md（单向） |
| 角色灵魂 | `characterAuras`（独立文件） | 角色相关生成路径 | 用户 → characterAuras |
| 自定义灵魂 | 用户配置 | 自定义灵魂生效路径 | 用户 → 自定义灵魂 |
| 去 AI 味 skill | `de-ai-skill-library.ts` 配置 | 写章节/润色路径 | 用户 → skill 配置 |

**冲突规则**：当 retrieval.md 自动区与记忆中心字段冲突时，以 ChapterSnapshot 为准（ Snapshot 是真源），同步触发派生方重建。当用户在记忆中心手改字段时，标记该字段为"用户覆盖"，回写 ChapterSnapshot 后再投影到 retrieval.md，禁止跳过 Snapshot 直接改 retrieval.md。

### §12.4 流式 UX 与结果强约束的协同

- **流式阶段**：仅显示"💭 正在生成中..."提示（符合项目记忆），不展示实际生成内容；但工具调用 UI 仍实时展示 Agent 各工具调用进度。
- **流式结束**：累积完整输出后，先送入结果解析器（§3.3）做协议校验，校验通过才展示给用户。
- **解析重试**：解析失败时剥头尾重试，重试异步进行，UI 显示"正在校验输出格式..."。
- **失败提示**：解析仍失败时，UI 显示"输出不符合 {意图} 协议，已标记，未自动保存"，并展示原始输出供用户手动处理。
- **修改类意图例外**：modify_content 流式结束后不直接展示，先 diff 计算，进入 codex 式弹窗（§3.4）。

### §12.5 工具调用 UI 与上下文追踪的合并实现

- **数据结构**：单一 `ContextTrace` 类型，同时供 UI 渲染和内部追踪。
- **UI 组件**：新增 `src/components/chat/tool-call-timeline.tsx`，按时间线渲染 `toolCalls` 数组。
- **虚拟工具**：管道前置阶段的 `route-task`、`load-context`、`trim-context` 等封装为虚拟工具调用，与真实工具调用统一展示。
- **折叠策略**：默认折叠详情，仅显示工具名和耗时；点击展开看入参和结果。
- **持久化**：随对话历史持久化，重新打开会话可回看追踪。

### §12.6 retrieval.md 自动区与 ChapterSnapshot 的单向投影

- **投影函数**：`projectSnapshotToRetrievalEntry(snapshot: ChapterSnapshot): RetrievalEntry`，纯函数，无副作用。
- **触发时机**：`chapter-ingest.ts` 完成 Snapshot 生成后立即调用投影函数，写入对应分卷自动区。
- **字段映射**：Snapshot 的 20+ 字段按 PRD §2.2 的格式映射到 markdown 自动区结构。
- **不可逆**：投影是单向的，retrieval.md 自动区内容不会被读回 ChapterSnapshot。
- **版本兼容**：投影函数版本号写入自动区头部注释，未来 Snapshot 结构变更时支持迁移。

### §12.7 意图识别扩展性与剧情推演室分支隔离

- **main 分支意图集**：14 种 NovelTaskIntent（`task-router.ts:6-21`）。
- **剧情推演室分支扩展**：在 `feature-story-simulation` 分支新增 `story_framework_generate`、`multi_agent_simulate`、`character_interview` 等意图，**仅在推演室分支代码中注册**。
- **classification 路由对应**：推演室分支的 `classification.story-sim.md`（决策 6）只在该分支生效，main 分支读取不到则不加载。
- **回退保护**：main 分支遇推演室意图关键字时（如"故事框架"），不识别为推演室意图，按 `general_chat` 处理并提示"此功能在剧情推演室测试版可用"。
- **回归保证**：main 分支构建必须不包含推演室意图注册代码（CI 校验）。

### §12.8 默认路由表的测试与维护

- **真源**：`src/lib/novel/classification-router.ts` 的 `DEFAULT_INTENT_ROUTES` 常量。
- **模板导出**：`scripts/export-classification-template.ts` 从常量生成 `classification.md` 模板。
- **14 意图全表**：常量中明确给出每个意图的必载/选载/禁载数据源清单（共 14 条），覆盖 task-router.ts 全部意图。
- **单元测试**：`tests/novel/classification-router.test.ts` 验证：
  - 14 意图各自由必载项不空
  - 禁载项不含必载项（无矛盾）
  - 模板导出与常量一致
  - 损坏文件回退到常量
- **版本校验**：常量含 `CLASSIFICATION_VERSION`，与 classification.md 文件头 `classificationVersion` 比对，不匹配时提示升级。

### §12.9 修改意图的目标章节解析

- **解析顺序**：
  1. 用户消息中明确章节号（如"第 12 章"、"第十二章"、"12 章"）→ 代码正则提取
  2. 当前打开的章节（`selectedFile` 包含 `/wiki/chapters/`）
  3. 最近一次生成/Reading 的章节（持久化记录）
  4. AI 会话最近一次引用的章节
- **失败处理**：四步都未命中时，**不进入 modify_content 流程**，反向问用户"请明确要修改的章节"。
- **章节号不可信 LLM**：符合项目记忆"普通对话模式下需正确解析目标章节号，由代码强制计算章节号，不再信任 LLM 输出"。
- **多章节修改**：用户一次请求涉及多章时，按章节拆分为多个 modify_content 子任务，各自走 diff 确认弹窗。

### §12.10 多灵魂边界与 token 预算分配

- **五层灵魂体系**：
  1. `soul.md`（作品级总则）— priority 3，必载
  2. `characterAuras`（角色灵魂，对象级）— priority 9，按命中角色选载
  3. 自定义灵魂（用户配置）— 按意图选载
  4. 灵魂绑定（项目记忆提及）— 按人物关系选载
  5. 去 AI 味 skill（`de-ai-skill-library.ts`，5 内置 + 项目自定义）— 按意图选载
- **互斥关系**：自定义灵魂与 `soul.md` 冲突时，自定义灵魂优先（用户最近意图）；角色灵魂与 `soul.md` 冲突时，`soul.md` 优先（作品级压角色级）。
- **token 预算分配**（见 §12.12 详细表）。

### §12.11 单元测试与回归测试基础设施

- **新增测试目录**：`tests/novel/`
- **测试文件清单**：
  - `tests/novel/retrieval-index.test.ts`：retrieval.md 读写、增量更新、人工区保护、sourceHash 过期
  - `tests/novel/classification-router.test.ts`：路由表读取、合并、回退、版本校验
  - `tests/novel/result-parser.test.ts`：意图输出协议解析、剥头尾重试、失败标记
  - `tests/novel/modify-confirm.test.tsx`：修改弹窗确认、编辑后确认、取消不落盘
  - `tests/novel/context-trace.test.ts`：追踪记录字段完整性、与工具调用 UI 一致性
  - `tests/novel/chapter-lifecycle.test.ts`：生成→确认→入库→投影→记忆同步全链路
- **回归测试**：`tests/novel/regression/` 下保留现有续写、深度生成、大纲生成、去 AI 味、审查中心的 snapshot 用例，每次改动后全跑。
- **测试命令**：`npm run test:novel` 单跑小说模块，`npm run test` 全量。
- **CI 卡点**：P0 任务分支合并前必须全绿。

### §12.12 token 预算分配表

> v1.1 新增。用户在评审时明确"不思考 token 消耗"，但工程上必须有兜底策略，否则小窗口模型会爆。

- **预算来源**：当前选中模型的 `maxContextTokens`（跟随 AI 会话模型复选框状态，决策要求模型选择器禁用时取 aiChatModel）。
- **分配比例**（按必载/选载倒序）：

| 优先级 | 项目 | 预留占比 |
|--------|------|---------|
| 1 | 系统提示 + 工具定义 + Agent 推理预留 | 15% |
| 2 | `soul.md`（作品级总则） | 5% |
| 3 | 必载段：大纲、最近剧情摘要、当前任务上下文 | 30% |
| 4 | 必载段：上一章结尾、当前人物状态、当前伏笔状态 | 20% |
| 5 | 选载段：时间线、角色认知状态、命中角色灵魂 | 15% |
| 6 | 选载段：相关设定、去 AI 味 skill、自定义灵魂 | 10% |
| 7 | 历史对话缓冲 | 5% |

- **超预算裁剪**：按优先级倒序删，先删 7、再删 6……必载段保护到 3 级，3 级以下不裁。
- **裁剪记录**：每次裁剪写入 `ContextTrace.trimmedSections`，UI 可查看被删段。
- **模型不支持工具调用**：直接提示"当前模型不支持工具调用，请切换模型"（符合项目记忆"不做降级处理"），不进入 Agent 流程。

### §12.13 与"跟随 AI 会话模型"复选框的耦合

- **复选框状态读取**：路由表加载时读取"跟随 AI 会话模型"复选框状态（项目记忆要求复选框形式）。
- **勾选时**：模型选择器禁用（项目记忆要求），token 预算按 `aiChatModel` 的 `maxContextTokens` 计算（项目记忆要求 aiChatModel 优先于 defaultLlmModel）。
- **未勾选时**：用户可手动选模型，token 预算按所选模型计算。
- **路由表动态调整**：模型上下文窗口 < 16K 时，自动收窄选载段（5、6 级）必载范围；窗口 < 8K 时，禁用 Agent 自主探索（避免多轮调用爆窗口）。
- **模型不支持工具调用**：classification 路由跳过依赖工具调用的意图（如 search_plot、character_query），降级为 general_chat 处理。

### §12.14 错误恢复与用户可感知策略

- **错误分级**：

| 级别 | 触发场景 | 用户感知方式 |
|------|---------|------------|
| 致命 | `soul.md` 加载失败、retrieval 主索引全损、classification 全部路由失效 | UI 强提示弹窗（中文），阻断本次会话，引导修复 |
| 重要 | 单章 retrieval 过期、单数据源加载失败、解析重试失败 | UI 顶部黄色横幅提示，会话可继续，记录到 ContextTrace |
| 一般 | 单字段缺失、人工区格式轻微异常、选载段裁剪 | 仅写入 ContextTrace，UI 折叠展示，不打扰用户 |

- **回退提示文案**（中文示例）：
  - 致命："项目灵魂文件 soul.md 读取失败，请检查文件是否存在或内容为空。本次会话已暂停。"
  - 重要："第 12 章检索索引已过期（正文已修改），已标记为待重生。本次生成可能基于旧摘要，建议重生索引后再生成。"
  - 一般："部分次要上下文因预算限制被裁剪，详见工具调用时间线。"
- **修复引导**：致命级错误弹窗提供"打开文件位置"、"从备份恢复"、"重新生成索引"等快捷操作按钮。

---

## 十三、实施路线图（在当前分支串行推进）

> v1.1 修订（用户决策）：不再新建独立分支，全部 P0/P1 任务在当前 `gongjudiaoyongyouhua` 分支串行推进。该分支已有 Agent 工具调用框架的初步落地（见 §11 决策 1 现状说明与 §14 当前分支落地度对照），可作为统一基底继续叠加。

### 13.1 推进顺序与里程碑

| 阶段 | P0/P1 任务 | 依赖 | 验收闸门 |
|------|---------|------|---------|
| M1 | 决策 1 补齐：管道前置插件化 + 虚拟工具 + UI 状态补齐 | 复用现有 runner/types/registry | 旧功能回归全绿 + typecheck/build 全绿 |
| M2 | P0-7 生成章节到入库生命周期约束 | M1 | 旧功能回归全绿 + typecheck/build 全绿 |
| M3 | P0-4 modify_content 父级闸门 + codex 弹窗 | M2 | 旧功能回归全绿 + typecheck/build 全绿 |
| M4 | P0-6 两级裁剪替换头尾切 | M2 | 旧功能回归全绿 + typecheck/build 全绿 |
| M5 | P0-3 意图置信度反向问 | M2 | 旧功能回归全绿 + typecheck/build 全绿 |
| M6 | P0-5 大纲路径 soul.md 全入口校验 | M2 | 旧功能回归全绿 + typecheck/build 全绿 |
| M7 | P0-1 retrieval.md 主索引+分卷+投影 | M2 | 旧功能回归全绿 + typecheck/build 全绿 |
| M8 | P0-2 classification.md 两层路由+默认同源 | M7 | 旧功能回归全绿 + typecheck/build 全绿 |
| M9 | P1-9 上下文追踪 UI + 工具调用时间线完善 | M1-M8 | 旧功能回归全绿 + typecheck/build 全绿 |

### 13.2 单阶段标准流程

> v1.1 修订（用户决策）：不需要每个阶段都打包测试。打包节奏改为"按需打包"——用户在每个里程碑完成后自行决定是否需要便携版测试，而非强制每阶段打包。

1. **修改前**：在该分支根的 `gongjudiaoyongyouhua-分支说明.md` 中"本次更新"下新增条目，列明本阶段目标、成功标准、影响文件。
2. **实现**：外科手术式改动，不顺手重构无关代码。
3. **测试**：新增对应单元测试 + 跑 `tests/novel/regression/` 旧功能回归。
4. **验证**：`npm run typecheck` + `npm run test:mocks` + `npm run build` 全绿。
5. **源码启动**：`npm run dev` 验证软件可正常运行。
6. **更新日志**：在 `GenxinLOG/更新日志.md` 追加变更（不上传 GitHub）。
7. **分支说明文档**：在 `gongjudiaoyongyouhua-分支说明.md` 记录改动点、测试结果、是否合并。
8. **按需打包**：用户明确要求打包时才执行 `npm run build:portable`，否则继续下一阶段。

### 13.3 顺序依赖说明

- **M1 必须最先做**：决策 1 的"管道前置插件化 + 虚拟工具"是当前分支最大缺口，后续 P0 任务（特别是 modify 闸门、置信度反向问、两级裁剪）都依赖这套插件链。
- **M2 必须在 M3-M7 之前**：生命周期约束是后续所有修改/生成类任务的入库闸门。
- **M3-M6 可按任意顺序推进**：四个任务互相独立，但必须串行做（不再并行，因用户要求不创建新分支）。
- **M7 必须在 M8 之前**：retrieval.md 是 classification 路由的检索底层数据，先有检索才能路由。
- **M9 最后做**：上下文追踪 UI 完善建立在前 8 个阶段全部稳定之上。

### 13.4 风险控制

- **当前分支长期不合并 main**：本分支暂不合并 main，直到所有 P0/P1 完成 + 用户测试通过。期间若 main 有更新，需要单独评估回 merge 风险。
- **大改动阶段单独跑全量回归**：M7（retrieval）和 M8（classification）改动最大，必须跑全量 `npm run test:mocks` 而非只跑模块测试。
- **打包节奏按需**：用户决策不需要每阶段打包。打包仅在用户明确要求时执行，否则串行推进下一阶段，避免无效打包开销。
- **剧情推演室隔离**：本路线图完全不涉及剧情推演室。`feature-story-simulation` 分支独立推进，决策 6 已为其预留 `classification.story-sim.md` 接口。

### 13.5 不进入本路线图的内容

- 剧情推演室相关功能：在 `feature-story-simulation` 分支独立推进，绝对不合并 main。
- P2 增强（retrieval 过期 UI、classification 版本校验、上下文追踪折叠 UI 细节）：P0/P1 全部合并后再排期。
- 去 AI 味 skill 重构：当前 `de-ai-skill-library.ts` 已稳定，不重构。

### 13.6 等待用户确认事项

本路线图为待执行计划，**当前 M1 阶段尚未启动代码改动**。等待用户对以下事项确认：

1. 推进顺序是否认可（特别是 M1 决策 1 补齐最先做、M2 生命周期其次做的安排）。
2. 是否同意"每阶段必须打包便携版给我测试"的工作节奏。
3. 7 项决策是否全部认可（详见 §11）。
4. M1 阶段的具体实现方案是否需要我进一步细化为代码级 spec（涉及新建 `agent/pipeline.ts`、扩展 `ToolCategory` 增加 `"virtual"`、3 个虚拟工具文件、UI 状态补齐等共约 10 个文件的改动）。

---

## 十四、当前分支落地度对照（v1.1 新增）

> 本节基于 2026-07-01 对 `gongjudiaoyongyouhua` 分支代码的只读核查，对照 §11 决策 1 的 5 个核心点评估落地程度，作为 M1 阶段的开工依据。

### 14.1 决策 1 五核心点落地度

| 核心点 | 状态 | 当前实现依据 | M1 需补齐 |
|--------|------|------------|----------|
| **1. 统一基底** | 已实现（有缺口） | [runner.ts](file:///c:/QMAI_C/QMAI-main/src/lib/agent/runner.ts) 多轮循环 + 事件流 + 注册表 + 确认闸门 + 压缩齐全；但 [chat-panel.tsx#L975-L1240](file:///c:/QMAI_C/QMAI-main/src/components/chat/chat-panel.tsx#L975-L1240) `handleContinueUnfinished` 绕过 AgentRunner 直接 `streamChat` | 把 `handleContinueUnfinished` 收回 AgentRunner 路径 |
| **2. 管道前置插件化** | 部分实现 | 存在"预 Agent 管道"事实（routeTask → buildContextPack → goldenThree → soulDialog → deAiSkill），但全部硬编码在 [chat-panel.tsx](file:///c:/QMAI_C/QMAI-main/src/components/chat/chat-panel.tsx) 内，无插件接口 | 新建 `agent/pipeline.ts`，把硬编码链路改为可配置插件链，`AgentConfig` 增加 `prePlugins` 字段 |
| **3. 虚拟工具** | 未实现 | 无 `route_task` / `load_context` / `trim_context` 注册项；上下文加载完全在 UI 层一次性塞 systemPrompt | 新建 3 个虚拟工具文件，扩展 [types.ts](file:///c:/QMAI_C/QMAI-main/src/lib/agent/types.ts) `ToolCategory` 增加 `"virtual"` 分类 |
| **4. UI 统一** | 部分实现 | [agent-tool-call-message.tsx](file:///c:/QMAI_C/QMAI-main/src/components/chat/agent-tool-call-message.tsx) 已统一渲染时间线、区分 read/write/action 配色、支持折叠；但 `running` 状态无标识，写入确认有"灵魂 Dialog + 工具待确认"两条未统一流程 | 补 `running` 行 spinner + "完成"徽章；合并灵魂 Dialog 与工具确认 |
| **5. 取消降级语义** | 部分实现 | `AbortSignal` 贯穿 runner 与 `tool.execute`；但模型不支持工具调用时直接拒绝，无降级路径；工具执行中 cancel 靠 30s 超时 race | 补"模型不支持工具时降级到纯 streamChat"路径；abort 后保留"已取消"状态而非笼统 error |

### 14.2 可直接复用的模块（M1 不动）

| 模块 | 文件 | 复用理由 |
|------|------|---------|
| AgentRunner 基底 | [runner.ts](file:///c:/QMAI_C/QMAI-main/src/lib/agent/runner.ts) | 循环/事件流/确认闸门/压缩齐全 |
| 类型系统 | [types.ts](file:///c:/QMAI_C/QMAI-main/src/lib/agent/types.ts) | `Tool`/`AgentToolEvent`/`AgentRunRecord` 扩展即可 |
| 工具注册表 | [registry.ts](file:///c:/QMAI_C/QMAI-main/src/lib/agent/registry.ts) | `ToolRegistry` 通用，虚拟工具也能注册 |
| 事件折叠 | [tool-events.ts](file:///c:/QMAI_C/QMAI-main/src/lib/agent/tool-events.ts) | `applyAgentToolEvent` 成熟 |
| 结果压缩 | [tool-result.ts](file:///c:/QMAI_C/QMAI-main/src/lib/agent/tool-result.ts) | 6000 字阈值压缩 + UI 保留原文 |
| 写入三件套 | [write-chapter.ts](file:///c:/QMAI_C/QMAI-main/src/lib/agent/tools/write-chapter.ts)、write-memory.ts、write-outline-node.ts | 读回验证逻辑保留 |
| 读取类 11 工具 | [tools/](file:///c:/QMAI_C/QMAI-main/src/lib/agent/tools) | read_chapter/read_outline/read_memory/search_chapters 等直接复用 |
| 工具调用 UI | [agent-tool-call-message.tsx](file:///c:/QMAI_C/QMAI-main/src/components/chat/agent-tool-call-message.tsx) | 时间线/折叠/配色继续用 |
| Agent 装配链路 | [config.ts](file:///c:/QMAI_C/QMAI-main/src/lib/agent/config.ts) + [use-agent-config.ts](file:///c:/QMAI_C/QMAI-main/src/hooks/use-agent-config.ts) | 完整可用 |

### 14.3 M1 阶段需新建/改造的模块清单

1. **新建** `src/lib/agent/pipeline.ts`：PrePlugin 接口与插件链执行器
2. **新建** `src/lib/agent/tools/route-task.ts`：路由任务工具（包装现有 `routeTask` 函数）
3. **新建** `src/lib/agent/tools/load-context.ts`：上下文加载工具（包装现有 `buildContextPack`）
4. **新建** `src/lib/agent/tools/trim-context.ts`：上下文裁剪工具（包装现有 `contextPackToPrompt` 两级裁剪）
5. **改造** [types.ts](file:///c:/QMAI_C/QMAI-main/src/lib/agent/types.ts)：`ToolCategory` 增加 `"virtual"`；`AgentToolEvent` 增加 `preview` 字段（用于真实写入预览）；可选增加 `reasoning` 字段
6. **改造** [runner.ts](file:///c:/QMAI_C/QMAI-main/src/lib/agent/runner.ts)：confirm 工具闸门处生成真实写入预览而非固定提示；模型不支持工具时降级到 streamChat；abort 后置"已取消"状态
7. **改造** [chat-panel.tsx](file:///c:/QMAI_C/QMAI-main/src/components/chat/chat-panel.tsx)：
   - `handleSend` 改为构造 PrePlugin 链 → 调 AgentRunner
   - `handleContinueUnfinished` 收回 AgentRunner 路径
   - 写入确认 Dialog 与工具 `approval_required` 合并为统一面板
8. **改造** [agent-tool-call-message.tsx](file:///c:/QMAI_C/QMAI-main/src/components/chat/agent-tool-call-message.tsx)：
   - `running` 行加 spinner + "运行中"文字
   - `done` 加"完成"徽章
   - 写入类工具展示真实预览/diff
9. **新建** `tests/agent/pipeline.test.ts`：PrePlugin 链测试
10. **新建** `tests/agent/virtual-tools.test.ts`：3 个虚拟工具测试

### 14.4 M1 阶段成功标准

- [ ] `route_task` / `load_context` / `trim_context` 三个虚拟工具注册到 registry 并可被模型调用
- [ ] `chat-panel.handleSend` 中硬编码的 routeTask → buildContextPack → goldenThree → soulDialog → deAiSkill 链改为 PrePlugin 链
- [ ] `handleContinueUnfinished` 走 AgentRunner，工具调用 UI 一致
- [ ] 工具调用 UI `running` 状态有 spinner、"完成"有徽章
- [ ] 写入类工具 confirm 闸门展示真实预览而非固定文本
- [ ] 模型不支持工具调用时降级 streamChat，UI 提示"当前模型不支持工具调用，已切换为普通对话模式"
- [ ] abort 后 toolCallRecord 状态为"已取消"而非"错误"
- [ ] 旧功能回归全绿（续写、深度生成、大纲生成、AI 会话所有意图、审查中心、记忆中心等）
- [ ] 便携版打包成功并由用户测试通过
