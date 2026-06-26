import type { CharacterAura } from "@/lib/novel/character-aura"
import type { CognitionState } from "@/lib/novel/character-cognition"
import type { ForeshadowingStore } from "@/lib/novel/foreshadowing-tracker"
import type { LlmConfig } from "@/stores/wiki-store"

// ── 仿真模式 ──
export type SimulationMode = "event-driven" | "free-emergence" | "decision-tree" | "hybrid"

// ── 提取结果 ──
export interface ExtractionResult {
  characters: ExtractedCharacter[]
  chapterContents: ExtractedChapterContent[]
  memoryData: ExtractedMemoryData
  worldRules: string
  powerSystem: string
  foreshadowing: ForeshadowingStore | null
  timeline: string[]
  outlineContent: string
  soulDoc: string
}

export interface ExtractedCharacter {
  id: string
  name: string
  profile: string
  aura: CharacterAura | null
  cognition: { knows: string[]; doesNotKnow: string[] } | null
  soul: string
  skillContent: string
}

export interface ExtractedChapterContent {
  chapterNumber: number
  title: string
  summary: string
  content: string
}

export interface ExtractedMemoryData {
  characterStates: string
  characterCognition: CognitionState | null
  foreshadowingTracker: ForeshadowingStore | null
  timeline: string[]
  canonFacts: string
  conflicts: string
}

// ── 故事框架 ──
export interface StoryFramework {
  id: string
  title: string
  premise: string
  targetWords: number
  simulationMode: SimulationMode
  userIdea?: string
  sourceChapters: number
  nodes: StoryNode[]
  createdAt: string
}

export interface StoryNode {
  index: number
  phase: "起" | "承" | "转" | "合"
  title: string
  coreConflict: string
  involvedCharacters: string[]
  goal: string
  causeFromPrev: string
  expectedOutcome: string
}

// ── Agent ──
export interface NovelAgent {
  characterId: string
  name: string
  profile: string
  aura: CharacterAura | null
  cognition: { knows: string[]; doesNotKnow: string[] } | null
  soul: string
  currentGoal: string
  emotionalState: string
  knownFacts: Set<string>
  relationships: Map<string, AgentRelation>
  powerLevel: string
}

export interface AgentRelation {
  targetId: string
  relationType: string
  sentiment: number
}

// ── Agent 行为 ──
export type AgentAction =
  | { type: "speak"; target?: string; content: string }
  | { type: "act"; content: string }
  | { type: "react"; target: string; content: string }
  | { type: "decide"; content: string }
  | { type: "investigate"; content: string }
  | { type: "conflict"; target: string; content: string }
  | { type: "cooperate"; target: string; content: string }
  | { type: "withhold"; content: string }

// ── 仿真事件 ──
export interface SimulationEvent {
  type: "agent-action" | "node-complete" | "node-start"
  agent?: NovelAgent
  action?: AgentAction
  round?: number
  node?: StoryNode
  stateChanges?: string[]
  timestamp: string
}

// ── 推演报告 ──
export interface SimulationReport {
  frameworkId: string
  mode: SimulationMode
  characterAnalyses: CharacterAnalysis[]
  branches: StoryBranch[]
  recommendation: string
  createdAt: string
}

export interface CharacterAnalysis {
  characterId: string
  name: string
  behaviors: { node: string; action: string; motivation: string }[]
  stateChanges: string[]
  consistencyScore: number
}

export interface StoryBranch {
  title: string
  summary: string
  keyEvents: string[]
  probability: "high" | "medium" | "low"
  pros: string
  cons: string
  recommendation: boolean
}

// ── 故事草稿 ──
export interface StoryDraft {
  branchId: string
  frameworkId: string
  chapters: DraftChapter[]
  totalWords: number
  createdAt: string
}

export interface DraftChapter {
  title: string
  content: string
  correspondingNode: number
}

// ── 框架绑定 ──
export interface FrameworkBinding {
  frameworkId: string
  frameworkTitle: string
  targetChapterCount: number
  chapterAllocation: ChapterAllocation[]
  boundAt: string
}

export interface ChapterAllocation {
  nodeIndex: number
  nodeTitle: string
  startChapter: number
  endChapter: number
}

// ── 仿真输入 ──
export interface SimulationInput {
  agents: NovelAgent[]
  framework: StoryFramework
  mode: SimulationMode
  wordBudget: number
  llmConfig: LlmConfig
  userIdea?: string
  injectionEvent?: string
}

// ── 仿真配置 ──
export interface SimulationConfig {
  mode: SimulationMode
  userIdea?: string
  targetWords: number
  sourceChapters: number
}

// ── 字数预算 ──
export const WORD_BUDGET_PRESETS = [10000, 30000, 50000] as const

export function calcNodeCount(targetWords: number): number {
  if (targetWords <= 10000) return 4
  if (targetWords <= 30000) return 6
  return 8
}

export function calcMaxRoundsPerNode(wordBudget: number): number {
  return Math.max(2, Math.floor(wordBudget / 10000))
}

export function calcMaxAgentsPerRound(activeAgentCount: number): number {
  return Math.min(8, activeAgentCount)
}
