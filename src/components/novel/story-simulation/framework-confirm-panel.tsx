import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useStorySimulationStore } from "@/stores/story-simulation-store"
import type { StoryNode } from "@/lib/novel/story-simulation/types"
import { cn } from "@/lib/utils"

interface FrameworkConfirmPanelProps {
  onConfirm: () => void
  onRegenerate: () => void
  onSave?: () => void
}

// 起/承/转/合 阶段对应的标签配色
const PHASE_STYLES: Record<StoryNode["phase"], string> = {
  起: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  承: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  转: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  合: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
}

export function FrameworkConfirmPanel({
  onConfirm,
  onRegenerate,
  onSave,
}: FrameworkConfirmPanelProps) {
  const { t } = useTranslation()
  const currentFramework = useStorySimulationStore((s) => s.currentFramework)
  const [savedTip, setSavedTip] = useState(false)

  if (!currentFramework) return null

  const handleSave = () => {
    if (!onSave) return
    onSave()
    setSavedTip(true)
    setTimeout(() => setSavedTip(false), 2000)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 顶部：标题 + 操作按钮 */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">
          {t("storySimulation.frameworkTitle")}
        </h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onRegenerate}>
            {t("storySimulation.regenerateFramework")}
          </Button>
          {onSave && (
            <Button variant="outline" onClick={handleSave}>
              {savedTip ? (
                <>
                  <Check className="mr-1 h-4 w-4 text-emerald-500" />
                  已保存
                </>
              ) : (
                "保存框架"
              )}
            </Button>
          )}
          <Button onClick={onConfirm}>
            {t("storySimulation.confirmFramework")}
          </Button>
        </div>
      </div>

      {/* 前提区 */}
      <div className="rounded-lg bg-muted p-4">
        <div className="text-sm font-medium text-muted-foreground">
          {t("storySimulation.frameworkPremise")}
        </div>
        <p className="mt-1 text-sm leading-relaxed">{currentFramework.premise}</p>
      </div>

      {/* 节点列表 */}
      <div className="flex flex-col gap-3">
        <div className="text-sm font-medium text-muted-foreground">
          {t("storySimulation.frameworkNodes")}
        </div>
        {currentFramework.nodes.map((node) => (
          <FrameworkNodeCard key={node.index} node={node} />
        ))}
      </div>
    </div>
  )
}

function FrameworkNodeCard({ node }: { node: StoryNode }) {
  const { t } = useTranslation()

  return (
    <div className="rounded-lg border p-4">
      {/* 阶段标签 + 节点标题 */}
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-xs font-medium",
            PHASE_STYLES[node.phase]
          )}
        >
          {node.phase}
        </span>
        <span className="font-medium">{node.title}</span>
      </div>

      {/* 节点字段：dl/dt/dd 网格布局 */}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="whitespace-nowrap text-muted-foreground">
          {t("storySimulation.coreConflict")}
        </dt>
        <dd className="leading-relaxed">{node.coreConflict}</dd>

        <dt className="whitespace-nowrap text-muted-foreground">
          {t("storySimulation.involvedCharacters")}
        </dt>
        <dd className="leading-relaxed">{node.involvedCharacters.join("、")}</dd>

        <dt className="whitespace-nowrap text-muted-foreground">
          {t("storySimulation.goal")}
        </dt>
        <dd className="leading-relaxed">{node.goal}</dd>

        <dt className="whitespace-nowrap text-muted-foreground">
          {t("storySimulation.cause")}
        </dt>
        <dd className="leading-relaxed">{node.causeFromPrev}</dd>

        <dt className="whitespace-nowrap text-muted-foreground">
          {t("storySimulation.expectedOutcome")}
        </dt>
        <dd className="leading-relaxed">{node.expectedOutcome}</dd>
      </dl>
    </div>
  )
}
