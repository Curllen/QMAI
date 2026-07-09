import React, { useState } from "react"
import { CheckCircle2, ChevronRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { buildOutlineStages, type OutlineStageInput, type OutlineStage } from "@/lib/novel/outline-stage-trace"

interface OutlineWorkflowStagesProps extends OutlineStageInput {}

function StageRow({ stage, open, onToggle }: {
  stage: OutlineStage
  open: boolean
  onToggle: () => void
}) {
  return (
    <div
      className={cn(
        "rounded-md border transition-all duration-250 ease-out",
        stage.status === "active" && "border-sky-500/40 bg-sky-50/30 dark:bg-sky-950/10",
        stage.status === "done" && "border-emerald-500/20 bg-emerald-50/10 dark:bg-emerald-950/5",
        "opacity-0 translate-y-1 animate-[fadeIn_250ms_ease-out_forwards]"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs"
      >
        {stage.status === "done" ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : stage.status === "active" ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-sky-600 dark:text-sky-400" />
        ) : null}
        <span className="font-medium">{stage.title}</span>
        {stage.summary && (
          <span className="text-muted-foreground">· {stage.summary}</span>
        )}
        <ChevronRight
          className={cn(
            "ml-auto h-3 w-3 transition-transform",
            open && "rotate-90"
          )}
        />
      </button>
      {open && stage.details.length > 0 && (
        <div className="border-t border-border/50 px-3 py-2 text-xs text-muted-foreground space-y-1">
          {stage.details.map((detail, i) => (
            <div key={i}>{detail}</div>
          ))}
        </div>
      )}
    </div>
  )
}

export function OutlineWorkflowStages(props: OutlineWorkflowStagesProps) {
  const stages = buildOutlineStages(props)
  const visibleStages = stages.filter((s) => s.status !== "hidden")

  const defaultOpenId = stages.find((s) => s.status === "active")?.kind ?? null
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({})

  if (visibleStages.length === 0) return null

  return (
    <div className="mb-2 space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
        <span>思考过程</span>
      </div>
      {visibleStages.map((stage) => {
        const isOpen = openMap[stage.kind] ?? (stage.status === "active")
        return (
          <StageRow
            key={stage.kind}
            stage={stage}
            open={isOpen}
            onToggle={() => setOpenMap((prev) => ({ ...prev, [stage.kind]: !isOpen }))}
          />
        )
      })}
    </div>
  )
}
