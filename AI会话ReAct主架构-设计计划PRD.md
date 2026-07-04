# AI 会话 ReAct 主架构设计计划 PRD

> 版本：v1.0  
> 日期：2026-07-03  
> 状态：设计计划  
> 适用分支：`gongjudiaoyongyouhua`  
> 关联文档：`AI-Agent架构-PRD.md`、`AI会话工作流与测试标准整理.md`、`AGENTS.md`

## 一、背景

当前 AI 会话已经具备 AgentRunner、多轮工具调用、Skill、MCP、web search、能力选择、章节多任务生成循环等基础能力，但架构主控关系还不够清晰。

当前最大问题是：部分复杂任务，尤其章节生成，仍由 `chat-panel` 根据任务路由直接进入 `runDeepChapterGeneration` 这类固定工作流。这样虽然能展示阶段，但本质上还是软件主控流程，不是类似 Codex 的 ReAct Agent 自主分析、调用工具、观察结果、继续决策。

本 PRD 的目标是明确下一阶段 AI 会话重构方向：**AI 会话以单 Agent + ReAct 为主线，Workflow 作为 ReAct 可调用的结构化工具存在。**

## 二、核心结论

本软件当前主线采用以下架构组合：

1. **AI 会话主控：单 Agent + ReAct 工具调用。**
2. **标准 / 严格模式：在 ReAct 内引入 Plan Execute。**
3. **Skill、MCP、web search：走 Router Skill / capability selector。**
4. **Workflow / Graph：作为 ReAct 可调用的工具或子流程，不作为 AI 会话顶层主控。**
5. **多 Agent 和 Blackboard：暂不进入 AI 会话主线，留给剧情推演室或大型协作功能。**

## 三、目标

### 3.1 产品目标

1. AI 会话更接近 Codex 的工作方式：先分析，再选择工具，再观察结果，再继续执行。
2. 用户能看到 AI 为什么这样做、调用了哪些工具、每一步结果是什么。
3. 章节生成、改写、审稿等复杂流程仍保持稳定，但从“固定分支执行”升级为“Agent 主动调用 workflow 工具”。
4. 快速、标准、严格三档模式有清晰差异，而不是只改提示词。
5. Skill、MCP、web search 能统一进入能力选择层，避免模型凭空假装使用外部能力。

### 3.2 技术目标

1. `chat-panel` 不再承担 AI 执行编排主责，只负责 UI、输入、流式展示和用户交互。
2. 新增或抽离 `runAiChatSession` / `AgentChatSession`，承接一次 AI 会话完整执行。
3. `AgentRunner` 继续作为 ReAct 循环核心。
4. `runDeepChapterGeneration` 包装成 Agent Tool，例如 `run_chapter_workflow`。
5. 工具调用、workflow 子步骤、MCP、web search 使用统一事件模型展示。

## 四、非目标

1. 本阶段不引入多 Agent 协作主线。
2. 本阶段不引入 Blackboard 全局共享状态。
3. 本阶段不重写所有小说生成逻辑。
4. 本阶段不取消现有章节 workflow，只调整它在架构中的位置。
5. 本阶段不让模型绕过写入确认直接修改项目文件。

## 五、目标架构

### 5.1 总体链路

```text
用户输入
 -> ChatPanel
 -> runAiChatSession
 -> Task Router
 -> Capability Selector
 -> ReAct AgentRunner
      -> 分析任务
      -> 选择工具
      -> 调用项目读取工具 / Skill / MCP / web search / workflow tool
      -> 观察工具结果
      -> 继续决策
      -> 输出最终结果
```

### 5.2 Workflow 在新架构中的位置

```text
ReAct AgentRunner
 -> 调用 run_chapter_workflow
      -> 读取上下文
      -> 生成写作任务书
      -> 生成正文初稿
      -> AI 审稿
      -> 自动返修
      -> 简单审查与去AI味
      -> 返回最终正文
 -> Agent 观察 workflow 结果
 -> Agent 输出正文或交付说明
```

关键原则：**Workflow 是工具，不是 AI 会话主控。**

## 六、模块设计

### 6.1 ChatPanel

职责：
1. 管理输入框、引用、按钮、流式展示。
2. 把用户请求交给 `runAiChatSession`。
3. 展示 `AgentToolEvent`、上下文追踪和最终内容。
4. 处理保存草稿、继续未完成、停止生成等 UI 行为。

不再负责：
1. 直接判断章节任务并执行 `runDeepChapterGeneration`。
2. 直接拼装复杂 Agent 执行链。
3. 直接决定 Skill、MCP、web search 是否启用。

### 6.2 runAiChatSession

职责：
1. 接收用户输入、当前会话、项目路径、选中文件、AI 模式。
2. 调用 Task Router 识别意图。
3. 调用 Capability Selector 选择本轮可用能力。
4. 构建 Agent system prompt、工具注册表和执行策略。
5. 启动 `AgentRunner`。
6. 统一处理断点、取消、错误、事件转发和最终结果。

### 6.3 AgentRunner

职责：
1. 保持单 Agent + ReAct 多轮循环。
2. 每轮调用 LLM。
3. 接收工具调用。
4. 执行工具并把结果返回模型。
5. 超过轮次、取消、工具失败时输出明确中文错误。

需要增强：
1. 支持 Plan Execute 策略。
2. 支持工具父子事件，例如 `run_chapter_workflow` 下挂多个子步骤。
3. 支持更清晰的 round trace，便于 UI 展示“分析、行动、观察”。

### 6.4 Capability Selector

职责：
1. 根据任务意图、模式、项目状态和用户引用，选择本轮可用能力。
2. 选择范围包括内置工具、写作 Skill、MCP、web search、workflow tools。
3. 输出 selected capabilities 给 Agent prompt 和 trace UI。

原则：
1. Selector 只筛选能力，不替代 Agent 决策。
2. Agent 只能调用本轮被允许的工具。
3. 未启用或不可用的 MCP / web search 不能被模型伪装成已经使用。

### 6.5 Workflow Tool Adapter

职责：
1. 把现有 `runDeepChapterGeneration` 包装成 Agent Tool。
2. 对外暴露工具名，例如 `run_chapter_workflow`。
3. 把内部 workflow event 转换成统一 `AgentToolEvent`。
4. 返回最终正文、任务书、审稿结果、是否返修等结构化结果。

建议工具参数：

```ts
{
  intent: "write_chapter" | "continue_chapter" | "rewrite_chapter" | "polish_chapter"
  userRequest: string
  chapterNumber?: number
  workflowMode: "fast" | "standard" | "strict"
  selectedFile?: string
}
```

### 6.6 Plan Execute

适用范围：
1. 标准模式：复杂写作任务先生成简短计划，再执行。
2. 严格模式：必须生成计划，执行后必须审查和必要返修。
3. 快速模式：不强制计划，除非 Agent 判断必须澄清。

计划内容应该简短、可执行、可追踪，不应该变成大段说明文。

建议结构：

```text
计划：
1. 读取目标章节上下文。
2. 确认本章必须完成的剧情目标。
3. 生成正文。
4. 自检是否承接上一章、是否违背设定。
5. 输出最终正文。
```

## 七、模式设计

### 7.1 快速模式

目标：低延迟、少步骤、快速输出。

策略：
1. ReAct 可直接调用必要工具。
2. 不强制 Plan Execute。
3. 章节 workflow 可跳过 AI 审稿、自动返修和最终去AI味。
4. 工具轮次较少。

### 7.2 标准模式

目标：平衡质量和速度。

策略：
1. 对章节生成、改写、复杂分析引入简短 Plan Execute。
2. 允许调用 Skill、项目读取工具、必要 MCP / web search。
3. 章节 workflow 跳过深度 AI 审稿，但保留最终简单审查与去AI味。
4. 输出前做基础结果校验。

### 7.3 严格模式

目标：质量优先、可解释、可复查。

策略：
1. 强制 Plan Execute。
2. 必须明确读取哪些上下文。
3. 允许更完整的 Skill / MCP / web search 能力。
4. 章节 workflow 执行审稿、返修、返修后复审、最终去AI味。
5. 输出前做结果协议校验和风险提示。

## 八、工具体系

### 8.1 工具分类

1. 读取工具：章节、大纲、记忆、推演、历史会话。
2. 搜索工具：项目内搜索、web search。
3. Skill 工具：写作 Skill、去AI味 Skill、用户自定义 Skill。
4. MCP 工具：外部知识、外部检索、外部分析。
5. Workflow 工具：章节生成、章节改写、审稿返修、资料整理。
6. 写入工具：保存草稿、写入章节、写入记忆、写入大纲。

### 8.2 权限原则

1. 读取、搜索、分析类工具可自动执行。
2. 写入类工具必须用户确认。
3. Workflow 生成正文可以自动执行，但落盘保存必须确认。
4. MCP 如果没有真实连接，必须返回中文降级信息，不能伪造结果。

## 九、事件与可视化

### 9.1 统一事件模型

所有工具和 workflow 子步骤统一使用 `AgentToolEvent`。

建议扩展字段：

```ts
{
  type: "call_started" | "result" | "error" | "approval_required" | "cancelled"
  callId: string
  parentCallId?: string
  name: string
  params: Record<string, unknown>
  result?: string
  preview?: string
  timestamp: number
}
```

### 9.2 展示原则

1. 用户能看到 Agent 调用了什么工具。
2. 用户能看到 workflow 内部子步骤。
3. 最终正文区域不混入工具日志。
4. 工具失败要能定位到具体步骤。

## 十、实施路线

### 阶段 1：抽离 AI 会话执行器

目标：先把 `chat-panel` 中的 AI 执行逻辑抽到 `runAiChatSession`，不改变现有行为。

交付：
1. 新增 `src/lib/agent/ai-chat-session.ts`。
2. `chat-panel` 调用 session runner。
3. 现有测试通过。

### 阶段 2：Workflow 工具化

目标：把 `runDeepChapterGeneration` 包装成 ReAct 工具。

交付：
1. 新增 `run_chapter_workflow` 工具。
2. Agent 可主动调用章节 workflow。
3. 移除 `chat-panel` 中直接执行章节 workflow 的特殊分支。
4. 工具事件能展示 workflow 子步骤。

### 阶段 3：能力选择统一

目标：Skill、MCP、web search、workflow tools 都通过 Capability Selector 进入本轮工具集。

交付：
1. Capability registry 增加 workflow tool capability。
2. Selector 按 fast / standard / strict 输出不同能力。
3. Trace UI 展示本轮选择了哪些能力和原因。

### 阶段 4：Plan Execute 策略

目标：标准 / 严格模式真正具备计划执行行为。

交付：
1. Agent prompt 增加 Plan Execute 协议。
2. 标准模式对复杂任务生成简短计划。
3. 严格模式强制计划、执行、审查。
4. 计划内容和执行结果可追踪。

### 阶段 5：错误恢复与断点统一

目标：普通 ReAct 工具、workflow 工具、MCP 工具都能统一停止、恢复和报错。

交付：
1. 统一 breakpoint 结构。
2. 继续未完成优先恢复 Agent 会话状态。
3. workflow 内部 checkpoint 能挂到父工具调用下。

## 十一、验收标准

1. AI 会话所有任务都先进入 ReAct AgentRunner。
2. 章节生成由 Agent 调用 `run_chapter_workflow`，不再由 `chat-panel` 直接分支执行。
3. 快速、标准、严格三种模式在工具选择、计划要求、审查强度上有真实差异。
4. Skill、MCP、web search、workflow tools 均由 Capability Selector 管理。
5. 多 Agent 和 Blackboard 不进入 AI 会话主线。
6. 工具调用和 workflow 子步骤在 UI 中可见。
7. 最终正文不混入工具日志、计划说明或执行摘要。
8. 写入项目文件仍必须用户确认。
9. 原有章节生成、续写、改写、润色功能不回退。

## 十二、风险与约束

1. 直接把 workflow 工具交给模型调用，可能出现模型不调用或调用参数不完整的问题，需要工具描述和参数 schema 足够明确。
2. 标准 / 严格模式如果计划过长，会拖慢输出并污染正文，需要限制计划长度。
3. 父子工具事件会增加 UI 和 trace 复杂度，需要先做最小可用版本。
4. `chat-panel` 当前文件较重，抽离时必须分阶段进行，避免一次性大重构。
5. 模型不支持工具调用时仍需要保留普通对话降级路径。

## 十三、推荐优先级

P0：
1. 抽离 `runAiChatSession`。
2. 把章节 workflow 包成工具。
3. 移除 `chat-panel` 章节特殊执行分支。

P1：
1. Capability Selector 纳入 workflow tools。
2. 统一 workflow 子步骤事件。
3. 标准 / 严格模式 Plan Execute。

P2：
1. 断点恢复统一。
2. Trace UI 父子层级优化。
3. 剧情推演室再引入多 Agent 或 Blackboard。

## 十四、最终架构一句话

AI 会话以 **单 Agent + ReAct** 为主线；标准 / 严格模式在 ReAct 中启用 **Plan Execute**；Skill、MCP、web search 和 workflow 由 **Capability Selector** 控制；章节生成等固定流程作为 **Workflow Tool** 被 Agent 调用；多 Agent 和 Blackboard 暂不进入主线。
