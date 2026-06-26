import { useTranslation } from "react-i18next"
import { RefreshCw, Sparkles, TrendingUp } from "lucide-react"
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
}

export function SimulationReportView({
  onResimulate,
  onGenerateDraft,
}: SimulationReportViewProps) {
  const { t } = useTranslation()
  const report = useStorySimulationStore((s) => s.currentReport)

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
