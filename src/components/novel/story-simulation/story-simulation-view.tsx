import { useRef } from "react"
import { useTranslation } from "react-i18next"

import { useWikiStore } from "@/stores/wiki-store"
import { useStorySimulationStore } from "@/stores/story-simulation-store"
import { extractStoryContent } from "@/lib/novel/story-simulation/story-extractor"
import { generateStoryFramework } from "@/lib/novel/story-simulation/story-framework-generator"
import { buildAgents } from "@/lib/novel/story-simulation/agent-profile-builder"
import {
  runSimulation,
  type SimulationCallbacks,
} from "@/lib/novel/story-simulation/simulation-engine"
import { generateSimulationReport } from "@/lib/novel/story-simulation/simulation-report-agent"
import { generateStoryDraft } from "@/lib/novel/story-simulation/story-draft-generator"
import { saveFramework } from "@/lib/novel/story-simulation/framework-store"
import { resolveDefaultModel } from "@/lib/novel/model-resolver"
import type {
  ExtractionResult,
  StoryBranch,
  StoryFramework,
} from "@/lib/novel/story-simulation/types"

import { FrameworkList } from "./framework-list"
import { SimulationConfigPanel } from "./simulation-config-panel"
import { FrameworkConfirmPanel } from "./framework-confirm-panel"
import { SimulationReportView } from "./simulation-report-view"
import { StoryDraftView } from "./story-draft-view"

const PROGRESS_PHASES = [
  "extracting",
  "framework-generating",
  "simulating",
  "report-generating",
  "draft-generating",
] as const

/**
 * 故事推演室主视图。
 *
 * 左右两栏布局：左栏展示已保存的框架列表，右栏根据当前 phase
 * 切换不同面板，串联提取 → 框架生成 → 确认 → 仿真 → 报告 → 草稿
 * 的完整流程。
 */
export function StorySimulationView() {
  const { t } = useTranslation()
  const projectPath = useWikiStore((s) => s.project?.path)
  const baseLlmConfig = useWikiStore((s) => s.llmConfig)

  const phase = useStorySimulationStore((s) => s.phase)
  const mode = useStorySimulationStore((s) => s.mode)
  const userIdea = useStorySimulationStore((s) => s.userIdea)
  const targetWords = useStorySimulationStore((s) => s.targetWords)
  const sourceChapters = useStorySimulationStore((s) => s.sourceChapters)
  const extractionResult = useStorySimulationStore((s) => s.extractionResult)
  const currentFramework = useStorySimulationStore((s) => s.currentFramework)
  const currentReport = useStorySimulationStore((s) => s.currentReport)
  const error = useStorySimulationStore((s) => s.error)
  const progress = useStorySimulationStore((s) => s.progress)
  const progressLabel = useStorySimulationStore((s) => s.progressLabel)

  const setPhase = useStorySimulationStore((s) => s.setPhase)
  const setExtractionResult = useStorySimulationStore(
    (s) => s.setExtractionResult,
  )
  const setCurrentFramework = useStorySimulationStore(
    (s) => s.setCurrentFramework,
  )
  const setCurrentReport = useStorySimulationStore((s) => s.setCurrentReport)
  const setCurrentDraft = useStorySimulationStore((s) => s.setCurrentDraft)
  const setError = useStorySimulationStore((s) => s.setError)
  const setProgress = useStorySimulationStore((s) => s.setProgress)
  const reset = useStorySimulationStore((s) => s.reset)

  // 当前阶段的进度基线。对于只回调 label（无 progress 数值）的步骤，
  // 用此基线保持进度条位置，仅更新文字。
  const phaseBaseProgressRef = useRef(0)

  // ── 核心流程 ──

  /** 提取内容并生成故事框架，进入框架确认阶段。 */
  const handleStart = async () => {
    if (!projectPath) {
      setError("请先打开一个项目")
      return
    }
    setError(null)
    setCurrentFramework(null)
    try {
      // 1. 提取内容
      setPhase("extracting")
      phaseBaseProgressRef.current = 0
      setProgress(0, t("storySimulation.extracting"))
      const extraction: ExtractionResult = await extractStoryContent(
        projectPath,
        {
          sourceChapters,
          onProgress: (p, label) => setProgress(p, label),
        },
      )
      setExtractionResult(extraction)

      // 2. 生成框架
      setPhase("framework-generating")
      phaseBaseProgressRef.current = 30
      setProgress(30, "正在生成故事框架...")
      const llmConfig = resolveDefaultModel(baseLlmConfig)
      const framework: StoryFramework = await generateStoryFramework({
        extraction,
        mode,
        targetWords,
        userIdea: userIdea || undefined,
        llmConfig,
        onProgress: (label) =>
          setProgress(phaseBaseProgressRef.current, label),
      })
      setCurrentFramework(framework)
      setPhase("framework-confirming")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase("configuring")
    }
  }

  /** 确认框架：保存 → 构建角色 → 仿真 → 生成报告。 */
  const handleConfirmFramework = async () => {
    if (!projectPath || !currentFramework) {
      setError("缺少项目路径或故事框架")
      return
    }
    setError(null)
    try {
      // 若尚无提取结果（如从历史框架进入），先提取
      let extraction = extractionResult
      if (!extraction) {
        setPhase("extracting")
        phaseBaseProgressRef.current = 0
        setProgress(0, t("storySimulation.extracting"))
        extraction = await extractStoryContent(projectPath, {
          sourceChapters,
          onProgress: (p, label) => setProgress(p, label),
        })
        setExtractionResult(extraction)
      }

      // 1. 保存框架
      await saveFramework(projectPath, currentFramework)

      // 2. 构建角色并运行仿真
      setPhase("simulating")
      phaseBaseProgressRef.current = 50
      setProgress(50, t("storySimulation.simulating"))
      const agents = buildAgents(extraction, currentFramework)
      const llmConfig = resolveDefaultModel(baseLlmConfig)
      const callbacks: SimulationCallbacks = {
        onEvent: () => {},
        // 仿真进度映射到 50%–75% 区间
        onProgress: (p, label) =>
          setProgress(50 + Math.floor(p / 2), label),
        onComplete: () => {},
        // 错误由外层 try/catch 统一处理
        onError: () => {},
      }
      const events = await runSimulation(
        {
          agents,
          framework: currentFramework,
          mode,
          wordBudget: targetWords,
          llmConfig,
          userIdea: userIdea || undefined,
        },
        extraction,
        callbacks,
      )

      // 3. 生成推演报告
      setPhase("report-generating")
      phaseBaseProgressRef.current = 80
      setProgress(80, "正在生成推演报告...")
      const report = await generateSimulationReport({
        events,
        framework: currentFramework,
        mode,
        llmConfig,
        onProgress: (label) =>
          setProgress(phaseBaseProgressRef.current, label),
      })
      setCurrentReport(report)
      setPhase("report-viewing")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase("framework-confirming")
    }
  }

  /** 重新生成框架（重新提取 + 生成）。 */
  const handleRegenerateFramework = () => {
    void handleStart()
  }

  /** 重新推演：回退到框架确认阶段。 */
  const handleResimulate = () => {
    setPhase("framework-confirming")
  }

  /** 选择走向分支并生成故事草稿。 */
  const handleGenerateDraft = async (branch: StoryBranch) => {
    if (!currentFramework || !currentReport) {
      setError("缺少故事框架或推演报告")
      return
    }
    setError(null)
    try {
      setPhase("draft-generating")
      phaseBaseProgressRef.current = 90
      setProgress(90, "正在生成故事草稿...")
      const llmConfig = resolveDefaultModel(baseLlmConfig)
      const draft = await generateStoryDraft({
        framework: currentFramework,
        report: currentReport,
        selectedBranch: branch,
        llmConfig,
        onProgress: (label) =>
          setProgress(phaseBaseProgressRef.current, label),
      })
      setCurrentDraft(draft)
      setPhase("draft-viewing")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase("report-viewing")
    }
  }

  /** 新建框架：重置状态并进入配置阶段。 */
  const handleNewFramework = () => {
    reset()
    setPhase("configuring")
  }

  /** 从列表选择一个已有框架，进入框架确认阶段。 */
  const handleSelectFramework = (framework: StoryFramework) => {
    setCurrentFramework(framework)
    setPhase("framework-confirming")
  }

  /** 草稿视图返回报告视图。 */
  const handleBackToReport = () => {
    setPhase("report-viewing")
  }

  // ── 渲染 ──

  const isProgressPhase = (
    PROGRESS_PHASES as readonly string[]
  ).includes(phase)

  const progressTitle = (() => {
    switch (phase) {
      case "extracting":
        return t("storySimulation.extracting")
      case "framework-generating":
        return "正在生成故事框架..."
      case "simulating":
        return t("storySimulation.simulating")
      case "report-generating":
        return "正在生成推演报告..."
      case "draft-generating":
        return "正在生成故事草稿..."
      default:
        return ""
    }
  })()

  return (
    <div className="flex h-full">
      {/* 左栏：框架列表 */}
      <div className="w-56 shrink-0 border-r">
        <FrameworkList
          onSelectFramework={handleSelectFramework}
          onNewFramework={handleNewFramework}
        />
      </div>

      {/* 右栏：根据 phase 切换面板 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {error && (
          <div className="flex items-center justify-between gap-3 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400">
            <span>
              {t("storySimulation.error")}: {error}
            </span>
            <button
              type="button"
              className="shrink-0 text-xs underline"
              onClick={() => setError(null)}
            >
              {t("storySimulation.back")}
            </button>
          </div>
        )}

        {isProgressPhase ? (
          <ProgressPanel
            progress={progress}
            label={progressLabel || progressTitle}
          />
        ) : phase === "framework-confirming" ? (
          <div className="flex-1 overflow-y-auto p-4">
            <FrameworkConfirmPanel
              onConfirm={() => void handleConfirmFramework()}
              onRegenerate={handleRegenerateFramework}
            />
          </div>
        ) : phase === "report-viewing" ? (
          <SimulationReportView
            onResimulate={handleResimulate}
            onGenerateDraft={(branch) => void handleGenerateDraft(branch)}
          />
        ) : phase === "draft-viewing" ? (
          <StoryDraftView onBack={handleBackToReport} />
        ) : (
          <div className="flex-1 overflow-y-auto">
            <SimulationConfigPanel onStart={() => void handleStart()} />
          </div>
        )}
      </div>
    </div>
  )
}

/** 进度展示面板：文字 + 进度条。 */
function ProgressPanel({
  progress,
  label,
}: {
  progress: number
  label: string
}) {
  const clamped = Math.min(100, Math.max(0, progress))
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <div className="text-base font-medium">{label}</div>
      <div className="h-2 w-64 max-w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <div className="text-xs text-muted-foreground">{clamped}%</div>
    </div>
  )
}
