  import type { PrePlugin, PrePluginInput, PrePluginOutput } from "../pipeline"
  import { buildTaskDirective } from "@/lib/novel/task-router"
  import { buildSelectedSkillsPrompt } from "./select-skills-plugin"
  import type { AiWorkflowMode } from "../workflow-mode"

  export interface BuildSystemPromptPluginDeps {
  baseSystemPrompt?: string
  buildTaskDirectiveFn?: typeof buildTaskDirective
  onError?: (error: Error) => void
}

export function createBuildSystemPromptPlugin(deps: BuildSystemPromptPluginDeps = {}): PrePlugin {
  const { baseSystemPrompt, buildTaskDirectiveFn, onError } = deps

  return {
    name: "build_system_prompt",
    priority: 60,
    run: async (input: PrePluginInput): Promise<PrePluginOutput> => {
      if (!input.novelMode) return {}

      try {
        const buildDirective = buildTaskDirectiveFn || buildTaskDirective
        const route = input.effectiveTaskRoute || input.taskRoute

        const parts: string[] = []

        const base = baseSystemPrompt || (input.agentConfig as any)?.systemPrompt || ""
        if (base) parts.push(base)

        if (input.novelSystemPrompt) {
          parts.push(input.novelSystemPrompt)
        }

        const selectedSkillsPrompt = buildSelectedSkillsPrompt(input.selectedSkills)
        if (selectedSkillsPrompt) {
          parts.push(selectedSkillsPrompt)
        }

        if (input.planExecuteEnabled && input.aiWorkflowMode) {
          const routeForPlan = input.effectiveTaskRoute || input.taskRoute
          const isWritingTask = routeForPlan?.intent === "write_chapter" ||
            routeForPlan?.intent === "continue_chapter"
          if (isWritingTask) {
            parts.push(buildChapterPlanProtocol(input.aiWorkflowMode))
          }
        }

        if (route) {
          const taskDirective = buildDirective(route)
          if (taskDirective) {
            parts.push(taskDirective)
          }
        }

        const finalSystemPrompt = parts.join("\n\n")
        return { finalSystemPrompt }
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error(String(error)))
        return {}
      }
    },
  }
}

function buildChapterPlanProtocol(mode: AiWorkflowMode): string {
  // 章节计划统一使用完整七维度分析，不再按 fast/standard/strict 裁剪维度。
  // mode 仅用于在协议头标注当前工作流强度，不改变计划结构。
  const modeLabel =
    mode === "fast" ? "快速" : mode === "strict" ? "严格" : "标准"
  return [
    "## 章节创作计划协议（章节计划）",
    "",
    `当前工作流强度：${modeLabel}模式，已开启 Plan Execute。写正文前先输出章节计划供用户确认。`,
    "计划是可追溯、可执行的创作决策，不写正文片段或工具流程。",
    "",
    "输出规范：",
    "1. 计划必须整体包裹在 `<!-- chapter_plan -->` 和 `<!-- /chapter_plan -->` 标记中。",
    "2. 计划只供用户确认，不写正文、工具日志或旧工作流说明。",
    "3. 计划必须基于会话上下文包；读取资料前先用 list_chapters、list_outlines、list_memories 确认可用文件名，绝不编造资料名称。",
    "4. 计划必须按以下七个维度组织，每个维度都不可省略；场景用 S1/S2/S3 编号，后续正文必须按编号执行。",
    "5. 计划末尾必须列出执行分层：必须执行 / 禁止违背 / 可自由发挥，避免正文阶段把所有内容混成同等优先级。",
    "",
    "维度一·输入校验",
    "- 核对 chapterGoal、outline、previousChapterEnding、recentSummaries、characterStates、cognitionStates、foreshadowingStates、timeline、canonRules、mustDo、mustAvoid、nextChapterAdvice。",
    "- 字段缺失则写明原因和最小补全方向，不得伪装成已读取。",
    "",
    "维度二·章节定位分析",
    "- 卷/段落阶段：开篇、发展、转折、高潮或收束。",
    "- 承接 previousChapterEnding 的待解问题、情绪或未完成动作。",
    "- 写明本章把哪条主线推进到哪个节点，并为后文哪条伏笔铺垫。",
    "",
    "维度三·戏剧问题与信息流",
    "- 本章核心戏剧问题：这一章要回答“……？”",
    "- 章首悬念 → 章末新悬念或新问题。",
    "- 信息差：依据 cognitionStates 写清揭示、隐藏、误导，禁止提前泄露角色未知信息。",
    "- 伏笔动作：依据 foreshadowingStates 标明埋设/推进/回收及程度。",
    "- 爽点/期待点设计：写清满足哪个期待、制造哪个新期待，必须有情绪、冲突或悬念回报。",
    "",
    "维度四·场景序列编排（计划核心）",
    "- 列出 2-4 个场景，统一写成 S1/S2/S3；每场写明：场景戏剧功能（制造/升级/反转/暂解/引出新问题）、情绪目标、地点、在场人物及目标、进入状态 → 出场状态、转场方式。",
    "- 场景序列必须连成“起—承—转—合（或钩）”，不得只列一个场景。",
    "",
    "维度五·冲突与人物引擎",
    "- 核心冲突链：谁要什么 → 谁阻拦 → 结果如何 → 导向下一章什么问题。",
    "- 人物动机必须溯源到 characterStates，禁止凭空给动机。",
    "- 对话目标：写清角色想得到什么、不愿说什么、如何试探/隐瞒/压迫/诱导；对话后关系或信息状态必须变化。",
    "- 章末人物变化：认知、关系、能力或处境。",
    "",
    "维度六·边界与禁忌",
    "- 列出不得违背的 canonRules、不得超越的 timeline、不得破坏的 cognitionStates、不得提前回收的伏笔。",
    "",
    "维度七·节奏、字数与结尾钩子",
    "- 开头与结尾：开头承接上一章并立刻给当前问题；结尾完成阶段结果，并留下下一章必须解决的问题。",
    "- 写明情绪/张力曲线、场景篇幅预算和章末钩子（悬念/反转/未决动作/新威胁）。",
    "- 执行分层：必须执行写漏即偏离；禁止违背写了即错误；可自由发挥只允许补环境、动作、心理、过渡和细节。",
    "",
    "确认后动作：用户点击确认后，把整份计划作为 run_chapter_workflow 的 planBlueprint 参数传入，再进入正文生成，不再重复输出计划。",
    "输出计划后暂停，等用户确认后再进入正文。",
  ].join("\n")
}
