import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ArrowLeft, Check, Copy, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useStorySimulationStore } from "@/stores/story-simulation-store"

interface StoryDraftViewProps {
  onBack: () => void
}

export function StoryDraftView({ onBack }: StoryDraftViewProps) {
  const { t } = useTranslation()
  const draft = useStorySimulationStore((s) => s.currentDraft)
  const [copied, setCopied] = useState(false)

  if (!draft) return null

  const handleCopyAll = async () => {
    const text = draft.chapters
      .map((ch) => `${ch.title}\n\n${ch.content}`)
      .join("\n\n---\n\n")
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-sm font-semibold">{t("storySimulation.draftTitle")}</h2>
        </div>
        <Button variant="outline" size="sm" onClick={handleCopyAll}>
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? t("storySimulation.copied") : t("storySimulation.copyAll")}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="text-xs text-muted-foreground">
            {t("storySimulation.totalWords")}: {draft.totalWords}
          </div>

          {draft.chapters.map((chapter, idx) => (
            <div key={idx} className="rounded-lg border p-4">
              <h3 className="mb-2 flex items-center gap-2 font-medium">
                <FileText className="h-4 w-4 text-muted-foreground" />
                {chapter.title}
              </h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {chapter.content}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
