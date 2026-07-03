import type { PrePlugin, PrePluginInput, PrePluginOutput } from "../pipeline"
import type { AiWorkflowMode } from "../workflow-mode"
import type { NovelTaskIntent } from "@/lib/novel/task-router"
import type { SkillKind, SkillStage, UserSkill } from "@/lib/novel/skill-library"

const WRITING_INTENTS = new Set<NovelTaskIntent>([
  "write_chapter",
  "continue_chapter",
  "rewrite_chapter",
  "polish_chapter",
])

const REVIEW_INTENTS = new Set<NovelTaskIntent>(["review_chapter", "lint_chapter"])
const QUERY_INTENTS = new Set<NovelTaskIntent>([
  "search_plot",
  "character_query",
  "foreshadowing_query",
  "timeline_query",
  "setting_query",
])

const STANDARD_WRITING_SKILL_NAMES = [
  "章节承接",
  "下一章计划",
  "人物动机",
  "冲突升级",
  "剧情自检",
  "正文输出协议",
  "去AI味",
  "基础去AI味",
  "审稿返修",
]

const STRICT_WRITING_SKILL_NAMES = [
  ...STANDARD_WRITING_SKILL_NAMES,
  "主线检查",
  "伏笔管理",
  "节奏检查",
  "结尾钩子",
]

const FAST_WRITING_SKILL_NAMES = ["正文输出协议", "去AI味"]

interface SkillSelectionProfile {
  preferredNames?: string[]
  kinds: SkillKind[]
  stages: SkillStage[]
  keywords: string[]
  limit: number
  fastHighImpactOnly?: boolean
  requireKindOrKeyword?: boolean
}

export function createSelectSkillsPlugin(): PrePlugin {
  return {
    name: "select_skills",
    priority: 35,
    run: async (input: PrePluginInput): Promise<PrePluginOutput> => {
      if (!input.novelMode) return { selectedSkills: [] }

      const route = input.effectiveTaskRoute || input.taskRoute
      if (!route) return { selectedSkills: [] }

      const availableSkills = input.availableSkills ?? []
      if (availableSkills.length === 0) return { selectedSkills: [] }

      const mode = input.aiWorkflowMode ?? "standard"
      return {
        selectedSkills: selectSkillsForRoute(availableSkills, route.intent, mode, input.userMessage),
      }
    },
  }
}

export function selectSkillsForRoute(
  skills: UserSkill[],
  intent: NovelTaskIntent,
  mode: AiWorkflowMode,
  userMessage = "",
): UserSkill[] {
  const modeSkills = skills.filter((skill) => skill.modes.includes(mode))
  if (modeSkills.length === 0) return []

  if (WRITING_INTENTS.has(intent)) {
    return selectWritingSkills(modeSkills, mode, userMessage)
  }

  if (intent === "generate_outline") {
    return selectByProfile(modeSkills, mode, userMessage, {
      kinds: ["planning", "structure", "output"],
      stages: ["planning", "output"],
      keywords: ["大纲", "主线", "世界观", "人物", "动机", "冲突", "伏笔", "章节", "计划"],
      limit: mode === "strict" ? 8 : 5,
    })
  }

  if (REVIEW_INTENTS.has(intent)) {
    return selectByProfile(modeSkills, mode, userMessage, {
      kinds: ["review", "knowledge", "output"],
      stages: ["review", "output"],
      keywords: ["审稿", "检查", "问题", "修改", "返修", "节奏", "逻辑", "人物", "伏笔", "去AI"],
      limit: mode === "strict" ? 8 : 5,
    })
  }

  if (QUERY_INTENTS.has(intent)) {
    return selectByProfile(modeSkills, mode, userMessage, {
      kinds: ["knowledge", "review", "output"],
      stages: ["planning", "review", "output"],
      keywords: ["查询", "检索", "资料", "世界观", "人物", "伏笔", "时间线", "设定"],
      limit: mode === "strict" ? 6 : 3,
    })
  }

  return []
}

function selectWritingSkills(skills: UserSkill[], mode: AiWorkflowMode, userMessage: string): UserSkill[] {
  if (mode === "fast") {
    return selectByProfile(skills, mode, userMessage, {
      preferredNames: FAST_WRITING_SKILL_NAMES,
      kinds: ["output", "style", "rewrite"],
      stages: ["output", "rewrite"],
      keywords: ["正文", "输出", "去AI", "AI味", "改写"],
      limit: 3,
      fastHighImpactOnly: true,
      requireKindOrKeyword: true,
    })
  }
  if (mode === "strict") {
    return selectByProfile(skills, mode, userMessage, {
      preferredNames: STRICT_WRITING_SKILL_NAMES,
      kinds: ["planning", "structure", "review", "output", "style", "rewrite"],
      stages: ["planning", "drafting", "review", "rewrite", "output"],
      keywords: ["章节", "正文", "剧情", "人物", "动机", "冲突", "伏笔", "节奏", "结尾", "钩子", "审稿", "返修", "去AI", "AI味", "输出"],
      limit: 12,
      requireKindOrKeyword: true,
    })
  }
  return selectByProfile(skills, mode, userMessage, {
    preferredNames: STANDARD_WRITING_SKILL_NAMES,
    kinds: ["planning", "structure", "review", "output", "style", "rewrite"],
    stages: ["planning", "drafting", "review", "rewrite", "output"],
    keywords: ["章节", "正文", "剧情", "人物", "动机", "冲突", "审稿", "返修", "去AI", "AI味", "输出", "承接", "计划"],
    limit: 8,
    requireKindOrKeyword: true,
  })
}

function selectByProfile(
  skills: UserSkill[],
  mode: AiWorkflowMode,
  userMessage: string,
  profile: SkillSelectionProfile,
): UserSkill[] {
  return skills
    .map((skill, index) => ({
      skill,
      index,
      score: scoreSkill(skill, mode, userMessage, profile),
    }))
    .filter((item) => item.score > 0)
    .filter((item) => !profile.fastHighImpactOnly || isFastHighImpactSkill(item.skill))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, profile.limit)
    .map((item) => item.skill)
}

function scoreSkill(
  skill: UserSkill,
  mode: AiWorkflowMode,
  userMessage: string,
  profile: SkillSelectionProfile,
): number {
  const preferredScore = scorePreferredName(skill, profile.preferredNames ?? [])
  const kindMatches = skill.kind.filter((kind) => profile.kinds.includes(kind)).length
  const stageMatches = skill.stages.filter((stage) => profile.stages.includes(stage)).length
  const keywordHits = countKeywordHits(skill, [...profile.keywords, ...extractMessageKeywords(userMessage)])
  const relevant = preferredScore > 0
    || kindMatches > 0
    || keywordHits > 0
    || (!profile.requireKindOrKeyword && stageMatches > 0)
  if (!relevant) return 0

  let score = 0
  score += preferredScore
  score += kindMatches * 30
  score += stageMatches * 20
  score += keywordHits * 6
  if (skill.modes.includes(mode)) score += 5
  if (skill.source === "uploaded" || skill.source === "project") score += 12
  if (skill.source === "built-in") score += 2
  return score
}

function scorePreferredName(skill: UserSkill, preferredNames: string[]): number {
  for (let index = 0; index < preferredNames.length; index += 1) {
    const preferredName = preferredNames[index]
    if (skill.name === preferredName) return 10000 - index * 100
    if (skill.name.includes(preferredName)) return 9000 - index * 100
  }
  return 0
}

function countKeywordHits(skill: UserSkill, keywords: string[]): number {
  const text = `${skill.name}\n${skill.description}\n${skill.content}`.toLocaleLowerCase()
  const uniqueKeywords = [...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))]
  return uniqueKeywords.filter((keyword) => text.includes(keyword.toLocaleLowerCase())).length
}

function extractMessageKeywords(userMessage: string): string[] {
  return userMessage
    .split(/[\s,，。！？!?、:：；;（）()《》「」"']+/)
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length >= 2)
}

function isFastHighImpactSkill(skill: UserSkill): boolean {
  return skill.kind.some((kind) => kind === "output" || kind === "style" || kind === "rewrite")
    || skill.stages.some((stage) => stage === "output" || stage === "rewrite")
}

export function buildSelectedSkillsPrompt(skills: UserSkill[] | undefined): string {
  if (!skills || skills.length === 0) return ""

  const blocks = skills.map((skill, index) => [
    `### ${index + 1}. ${skill.name}`,
    `类型：${skill.kind.join(", ")}`,
    `阶段：${skill.stages.join(", ")}`,
    skill.description ? `说明：${skill.description}` : "",
    "规则：",
    skill.content,
  ].filter(Boolean).join("\n"))

  return [
    "## 本次启用 Skill",
    "以下 Skill 只用于本次任务的内部写作决策和输出约束。不要在最终回复中解释 Skill、列出 Skill 分析过程，除非用户明确要求。",
    ...blocks,
  ].join("\n\n")
}
