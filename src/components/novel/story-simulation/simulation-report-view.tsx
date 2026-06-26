import { useTranslation } from "react-i18next"
import { MessageCircle, RefreshCw, Sparkles, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useStorySimulationStore } from "@/stores/story-simulation-store"
import type { StoryBranch } from "@/lib/novel/story-simulation/types"

const PROBABILITY_COLORS: Record<string, string> = {
  high: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  low: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
}

interface SimulationReportViewProps {
  onResimulate: () => void
  onGenerateDraft: (branch: StoryBranch) => void
  onInterviewAgent: (agentId: string, agentName: string) => void
}

/** 将 actionType 映射为中文动词短语 */
function actionLabel(type: string): string {
  switch (type) {
    case "evaluate":
      return "评价"
    case "pushPlot":
      return "推动事态"
    case "observe":
      return "观察"
    case "react":
      return "反应"
    case "speak":
      return "说"
    case "ally":
      return "结盟"
    case "confront":
      return "对抗"
    case "conceal":
      return "隐瞒"
    case "investigate":
      return "调查"
    default:
      return "行动"
  }
}

export function SimulationReportView({
  onResimulate,
  onGenerateDraft,
  onInterviewAgent,
}: SimulationReportViewProps) {
  const { t } = useTranslation()
  const report = useStorySimulationStore((s) => s.currentReport)
  const timelineEvents = useStorySimulationStore((s) => s.timelineEvents)

  if (!report) return null

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">{t("storySimulation.reportTitle")}</h2>
        </div>
        <Button variant="outline" size="sm" onClick={onResimulate}>
          <RefreshCw className="h-3.5 w-3.5" />
          {t("storySimulation.resimulate")}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* 关键剧情事件时间线 */}
          {timelineEvents.length > 0 && (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                关键剧情事件
              </h3>
              <div className="space-y-2">
                {timelineEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        节点{ev.nodeIndex + 1}·R{ev.round + 1}
                      </span>
                      <span className="font-medium">{ev.actorName}</span>
                      <span className="text-xs text-muted-foreground">
                        {actionLabel(ev.actionType)}
                      </span>
                      {ev.targetName && (
                        <span className="text-xs text-muted-foreground">
                          → {ev.targetName}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-foreground/90">
                      {ev.content}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 角色采访区 */}
          {report.characterAnalyses.length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <MessageCircle className="h-3.5 w-3.5" />
                采访角色
              </h3>
              <div className="flex flex-wrap gap-2">
                {report.characterAnalyses.map((char) => (
                  <Button
                    key={char.characterId}
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onInterviewAgent(char.characterId, char.name)
                    }
                  >
                    <MessageCircle className="mr-1 h-3.5 w-3.5" />
                    与 {char.name} 对话
                  </Button>
                ))}
              </div>
            </section>
          )}

          {/* 角色行为分析 */}
          {report.characterAnalyses.length > 0 && (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("storySimulation.characterAnalysis")}
              </h3>
              <div className="space-y-3">
                {report.characterAnalyses.map((char) => (
                  <div key={char.characterId} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{char.name}</span>
                      <span className="rounded px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                        {t("storySimulation.consistencyScore")}: {char.consistencyScore}
                      </span>
                    </div>

                    {char.behaviors.length > 0 && (
                      <div className="mt-2">
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          {t("storySimulation.behaviors")}
                        </p>
                        <ul className="space-y-1">
                          {char.behaviors.map((b, i) => (
                            <li key={i} className="text-sm">
                              <span className="text-muted-foreground">[{b.node}]</span>{" "}
                              {b.action}
                              <span className="text-muted-foreground">
                                {" "}
                                — {t("storySimulation.motivation")}: {b.motivation}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {char.stateChanges.length > 0 && (
                      <div className="mt-2">
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          {t("storySimulation.stateChanges")}
                        </p>
                        <ul className="list-disc space-y-0.5 pl-4 text-sm">
                          {char.stateChanges.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 走向分支 */}
          {report.branches.length > 0 && (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("storySimulation.storyBranches")}
              </h3>
              <div className="space-y-3">
                {report.branches.map((branch, idx) => (
                  <div key={idx} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{branch.title}</span>
                      {branch.recommendation && (
                        <span className="rounded px-1.5 py-0.5 text-xs bg-primary/10 text-primary">
                          {t("storySimulation.recommended")}
                        </span>
                      )}
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs ${PROBABILITY_COLORS[branch.probability]}`}
                      >
                        {t("storySimulation.probability")}:{" "}
                        {t(`storySimulation.probability${branch.probability.charAt(0).toUpperCase()}${branch.probability.slice(1)}`)}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-muted-foreground">{branch.summary}</p>

                    {branch.keyEvents.length > 0 && (
                      <div className="mt-2">
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          {t("storySimulation.keyEvents")}
                        </p>
                        <ul className="list-disc space-y-0.5 pl-4 text-sm">
                          {branch.keyEvents.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {branch.pros && (
                        <div className="rounded-md bg-green-50 p-2 text-sm dark:bg-green-950/30">
                          <span className="font-medium text-green-700 dark:text-green-400">
                            {t("storySimulation.pros")}:{" "}
                          </span>
                          {branch.pros}
                        </div>
                      )}
                      {branch.cons && (
                        <div className="rounded-md bg-red-50 p-2 text-sm dark:bg-red-950/30">
                          <span className="font-medium text-red-700 dark:text-red-400">
                            {t("storySimulation.cons")}:{" "}
                          </span>
                          {branch.cons}
                        </div>
                      )}
                    </div>

                    <Button
                      variant="default"
                      size="sm"
                      className="mt-3"
                      onClick={() => onGenerateDraft(branch)}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {t("storySimulation.generateDraft")}
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 综合推荐 */}
          {report.recommendation && (
            <section>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  {t("storySimulation.recommendation")}
                </h3>
                <p className="text-sm leading-relaxed">{report.recommendation}</p>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
