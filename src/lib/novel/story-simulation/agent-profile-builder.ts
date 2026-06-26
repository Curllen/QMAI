import type { CharacterAura } from "@/lib/novel/character-aura"
import type {
  AgentRelation,
  ExtractionResult,
  ExtractedCharacter,
  NovelAgent,
  StoryFramework,
  StoryNode,
} from "@/lib/novel/story-simulation/types"

/**
 * 从故事框架中推断某个角色当前的目标。
 *
 * 策略：找到第一个涉及该角色的节点，返回该节点的 goal；
 * 如果没有涉及该角色的节点，使用框架前提作为兜底目标。
 */
function inferGoalFromFramework(
  framework: StoryFramework,
  characterName: string,
): string {
  const node = framework.nodes.find((n) =>
    n.involvedCharacters.includes(characterName),
  )
  if (node) {
    return node.goal
  }
  return framework.premise || "待定"
}

/**
 * 根据提取结果与故事框架构建仿真用 Agent 列表。
 *
 * - 从框架节点中收集所有涉及的角色名
 * - 如果框架未指定角色，则使用全部提取到的角色
 * - 为每个角色构建 NovelAgent，初始化目标、情绪、已知事实与关系
 */
export function buildAgents(
  extraction: ExtractionResult,
  framework: StoryFramework,
): NovelAgent[] {
  // 收集框架中涉及的角色名（去重，保持顺序）
  const frameworkCharacters: string[] = []
  for (const node of framework.nodes) {
    for (const name of node.involvedCharacters) {
      if (!frameworkCharacters.includes(name)) {
        frameworkCharacters.push(name)
      }
    }
  }

  // 根据框架指定角色筛选，若框架未指定则使用全部提取角色
  const selectedCharacters: ExtractedCharacter[] =
    frameworkCharacters.length > 0
      ? extraction.characters.filter((c) =>
          frameworkCharacters.includes(c.name),
        )
      : extraction.characters

  // 构建所有选中角色的 id 列表，用于初始化关系
  const allCharacterIds = selectedCharacters.map((c) => c.id)

  const agents: NovelAgent[] = selectedCharacters.map((character) => {
    // 已知事实从认知的 knows 初始化
    const knownFacts = new Set<string>(
      character.cognition?.knows ?? [],
    )

    // 初始化与其他角色的关系：relationType="neutral", sentiment=0
    const relationships = new Map<string, AgentRelation>()
    for (const otherId of allCharacterIds) {
      if (otherId === character.id) continue
      relationships.set(otherId, {
        targetId: otherId,
        relationType: "neutral",
        sentiment: 0,
      })
    }

    return {
      characterId: character.id,
      name: character.name,
      profile: character.profile,
      aura: character.aura,
      cognition: character.cognition,
      soul: character.soul,
      currentGoal: inferGoalFromFramework(framework, character.name),
      emotionalState: "neutral",
      knownFacts,
      relationships,
      powerLevel: "",
    }
  })

  return agents
}

/**
 * 构建 Agent 决策时的上下文文本。
 *
 * 包含当前场景、Agent 身份、认知边界、当前状态、人际关系、近期事件与世界规则。
 * CharacterAura 的字段以实际源码为准，不存在的字段会被跳过。
 */
export function buildAgentContext(
  agent: NovelAgent,
  node: StoryNode,
  recentEvents: string[],
  worldRules: string,
): string {
  const sections: string[] = []

  // ── 当前场景 ──
  sections.push("【当前场景】")
  sections.push(`节点 ${node.index}（${node.phase}）：${node.title}`)
  sections.push(`核心冲突：${node.coreConflict}`)
  sections.push(`本节点目标：${node.goal}`)
  if (node.causeFromPrev) {
    sections.push(`承前原因：${node.causeFromPrev}`)
  }
  if (node.expectedOutcome) {
    sections.push(`预期结果：${node.expectedOutcome}`)
  }
  if (node.involvedCharacters.length > 0) {
    sections.push(`涉及角色：${node.involvedCharacters.join("、")}`)
  }

  // ── Agent 身份 ──
  sections.push("")
  sections.push("【Agent 身份】")
  sections.push(`姓名：${agent.name}`)
  if (agent.profile) {
    sections.push(`档案：${agent.profile}`)
  }
  if (agent.soul) {
    sections.push(`灵魂：${agent.soul}`)
  }

  // 光环各字段（以实际源码为准，不存在的字段跳过）
  if (agent.aura) {
    const aura = agent.aura as CharacterAura
    sections.push("")
    sections.push("【角色光环】")
    appendAuraField(sections, "风格描述", aura.styleDescription)
    appendAuraField(sections, "行为规则", aura.behaviorRules)
    appendAuraField(sections, "边界", aura.boundaries)
    appendAuraField(sections, "表达 DNA", aura.expressionDna)
    appendAuraField(sections, "心智模型", aura.mentalModel)
    appendAuraField(sections, "决策启发式", aura.decisionHeuristics)
    appendAuraField(sections, "价值反模式", aura.valueAntiPatterns)
    appendAuraField(sections, "诚实边界", aura.honestyBoundaries)
    appendAuraField(sections, "备注", aura.notes)
  }

  // ── 认知边界 ──
  if (agent.cognition) {
    sections.push("")
    sections.push("【认知边界】")
    if (agent.cognition.knows.length > 0) {
      sections.push(`已知：${agent.cognition.knows.join("；")}`)
    }
    if (agent.cognition.doesNotKnow.length > 0) {
      sections.push(`未知：${agent.cognition.doesNotKnow.join("；")}`)
    }
  }

  // ── 当前状态 ──
  sections.push("")
  sections.push("【当前状态】")
  sections.push(`当前目标：${agent.currentGoal}`)
  sections.push(`情绪状态：${agent.emotionalState}`)

  // ── 人际关系 ──
  if (agent.relationships.size > 0) {
    sections.push("")
    sections.push("【人际关系】")
    for (const relation of agent.relationships.values()) {
      sections.push(
        `对 ${relation.targetId}：${relation.relationType}（情感值 ${relation.sentiment}）`,
      )
    }
  }

  // ── 近期事件 ──
  if (recentEvents.length > 0) {
    sections.push("")
    sections.push("【近期事件】")
    for (const event of recentEvents) {
      sections.push(`- ${event}`)
    }
  }

  // ── 世界规则 ──
  if (worldRules) {
    sections.push("")
    sections.push("【世界规则】")
    sections.push(worldRules)
  }

  return sections.join("\n")
}

/**
 * 将光环字段追加到 sections，仅当字段存在且非空时输出。
 */
function appendAuraField(
  sections: string[],
  label: string,
  value: string | undefined,
): void {
  if (value !== undefined && value !== "") {
    sections.push(`${label}：${value}`)
  }
}
