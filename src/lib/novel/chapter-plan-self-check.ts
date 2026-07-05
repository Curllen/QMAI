import { streamChat } from "@/lib/llm-client"
import type { LlmConfig } from "@/stores/wiki-store"

export type ChapterPlanSelfCheckStatus = "pass" | "warning" | "error" | "unknown"

export interface ChapterPlanSelfCheckIssue {
  severity: "warning" | "error" | "info"
  problem: string
  risk: string
  suggestion: string
}

export interface ParsedChapterPlanSelfCheckResult {
  status: ChapterPlanSelfCheckStatus
  summary: string
  issues: ChapterPlanSelfCheckIssue[]
  formattedText: string
}

export interface ChapterPlanSelfCheckContext {
  chapterGoal?: string
  characterStates?: string
  cognitionStates?: string
  foreshadowingStates?: string
  timeline?: string
  canonRules?: string
  mustAvoid?: string
}

function buildContextSection(context?: ChapterPlanSelfCheckContext): string {
  if (!context) return ""
  const rows = [
    ["当前章节目标", context.chapterGoal],
    ["人物状态", context.characterStates],
    ["角色认知状态", context.cognitionStates],
    ["伏笔状态", context.foreshadowingStates],
    ["时间线", context.timeline],
    ["正史规则", context.canonRules],
    ["必须避免", context.mustAvoid],
  ].filter(([, value]) => typeof value === "string" && value.trim())

  if (rows.length === 0) return ""
  return [
    "",
    "项目上下文核对资料：",
    "请把章节计划逐项对照以下资料，不得只检查计划形式完整性。",
    ...rows.map(([label, value]) => `${label}：${String(value).trim().slice(0, 1200)}`),
  ].join("\n")
}

export function buildChapterPlanSelfCheckPrompt(
  planContent: string,
  context?: ChapterPlanSelfCheckContext,
): string {
  const contextSection = buildContextSection(context)
  return [
    "你是小说章节计划自检助手。",
    "请轻量检查这份章节计划是否足以指导后续正文生成。",
    "",
    "计划自检维度：",
    "1. 七个维度是否完整：输入校验、章节定位、戏剧问题与信息流、场景序列编排、冲突与人物引擎、边界与禁忌、节奏字数与结尾钩子。",
    "2. 场景序列能否连成起承转合/钩，是否单场景或缺转场。",
    "3. 信息流是否写清揭示、隐藏、误导，是否提前泄露角色未知信息。",
    "4. 伏笔动作是否清楚：埋设、推进、回收分别是什么。",
    "5. 边界与禁忌能否约束大纲、时间线、角色认知和正史规则。",
    "6. 结尾钩子是否具体，并自然导向下一章。",
    "7. 爽点/期待点是否明确：满足什么期待、制造什么新期待。",
    "8. 场景戏剧功能是否明确：制造/升级/反转/暂解/引出新问题。",
    "9. 对话目标是否明确：想得到什么、不愿说什么、如何试探/隐瞒/压迫/诱导。",
    "10. 是否有水文风险：只写气氛/解释/字数，不推动剧情/人物关系/信息差/伏笔/危机。",
    "11. 开头和结尾是否成立：开头承接上一章并给当前问题；结尾完成阶段结果并留下一章问题。",
    "",
    "输出要求：",
    "1. 只输出一个 JSON 对象，不改计划、不写正文、不输出 markdown 代码块。",
    "2. 字段：status、summary、issues；status 只能是 pass、warning、error。",
    "3. summary 用一句中文概括；issues 最多 5 条，每条含 severity、problem、risk、suggestion。",
    "4. 可确认通过时 status 为 pass，issues 为空数组。",
    contextSection,
    "",
    "待自检章节计划：",
    planContent.trim(),
  ].join("\n")
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  return text.slice(start, end + 1)
}

function normalizeStatus(value: unknown): ChapterPlanSelfCheckStatus {
  return value === "pass" || value === "warning" || value === "error" ? value : "unknown"
}

function normalizeSeverity(value: unknown): "warning" | "error" | "info" {
  return value === "error" || value === "info" || value === "warning" ? value : "warning"
}

function formatSelfCheckResult(input: {
  status: ChapterPlanSelfCheckStatus
  summary: string
  issues: ChapterPlanSelfCheckIssue[]
}): string {
  const lines = [`状态：${input.status}`]
  if (input.summary) lines.push(input.summary)
  if (input.issues.length > 0) {
    lines.push("")
    input.issues.forEach((issue, index) => {
      lines.push(`${index + 1}. [${issue.severity}] ${issue.problem}`)
      if (issue.risk) lines.push(`风险：${issue.risk}`)
      if (issue.suggestion) lines.push(`建议：${issue.suggestion}`)
    })
  }
  return lines.join("\n")
}

export function parseChapterPlanSelfCheckResult(text: string): ParsedChapterPlanSelfCheckResult {
  const raw = text.trim()
  const jsonText = extractJsonObject(raw)
  if (!jsonText) {
    return { status: "unknown", summary: raw, issues: [], formattedText: raw }
  }

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues.map((item): ChapterPlanSelfCheckIssue => {
          const obj = typeof item === "object" && item ? item as Record<string, unknown> : {}
          return {
            severity: normalizeSeverity(obj.severity),
            problem: String(obj.problem ?? ""),
            risk: String(obj.risk ?? ""),
            suggestion: String(obj.suggestion ?? ""),
          }
        }).filter((issue) => issue.problem || issue.risk || issue.suggestion)
      : []
    const result = {
      status: normalizeStatus(parsed.status),
      summary: String(parsed.summary ?? ""),
      issues,
    }
    return {
      ...result,
      formattedText: formatSelfCheckResult(result),
    }
  } catch {
    return { status: "unknown", summary: raw, issues: [], formattedText: raw }
  }
}

export async function runChapterPlanSelfCheck(
  llmConfig: LlmConfig,
  planContent: string,
  context?: ChapterPlanSelfCheckContext,
): Promise<string> {
  const trimmedPlan = planContent.trim()
  if (!trimmedPlan) {
    throw new Error("没有可自检的章节计划")
  }

  let result = ""
  let streamError: Error | undefined
  await streamChat(
    llmConfig,
    [{ role: "user", content: buildChapterPlanSelfCheckPrompt(trimmedPlan, context) }],
    {
      onToken: (token) => { result += token },
      onDone: () => {},
      onError: (error) => { streamError = error },
    },
  )
  if (streamError) throw streamError
  return parseChapterPlanSelfCheckResult(result.trim()).formattedText || "自检完成，未返回具体结果。"
}

export function buildChapterPlanRevisionPrompt(planContent: string, selfCheckResult: string): string {
  return [
    "你是小说章节计划修订助手。",
    "请基于自检结果对原章节计划做最小必要修订。",
    "",
    "硬性要求：",
    "1. 只输出修订后的章节计划，不要输出解释、改动说明或正文。",
    "2. 保留原计划中合理的章节目标、场景序列、人物动机、伏笔动作和结尾钩子。",
    "3. 只修复自检指出的问题：缺维度、转场不清、信息流矛盾、伏笔不明、边界不足。",
    "4. 必须补足爽点/期待点、场景戏剧功能、对话目标、开头结尾和水文风险处理。",
    "5. 修订后的计划仍必须保持七个维度结构。",
    "",
    "原章节计划：",
    planContent.trim(),
    "",
    "计划自检结果：",
    selfCheckResult.trim(),
  ].join("\n")
}

export async function runChapterPlanRevision(
  llmConfig: LlmConfig,
  planContent: string,
  selfCheckResult: string,
): Promise<string> {
  if (!planContent.trim()) throw new Error("没有可修订的章节计划")
  if (!selfCheckResult.trim()) throw new Error("没有可用于修订的自检结果")

  let result = ""
  let streamError: Error | undefined
  await streamChat(
    llmConfig,
    [{ role: "user", content: buildChapterPlanRevisionPrompt(planContent, selfCheckResult) }],
    {
      onToken: (token) => { result += token },
      onDone: () => {},
      onError: (error) => { streamError = error },
    },
  )
  if (streamError) throw streamError
  return result.trim() || "修订失败：模型未返回修订计划。"
}
