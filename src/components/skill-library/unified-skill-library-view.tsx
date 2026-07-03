import { useEffect, useMemo, useState } from "react"
import { loadDeAiSkillConfig, type DeAiSkillConfig } from "@/lib/novel/de-ai-skill-library"
import { SKILL_KIND_LABELS, SKILL_MODE_LABELS, SKILL_STAGE_LABELS } from "@/lib/novel/skill-library"
import { loadUserSkillConfig, type UserSkillConfig } from "@/lib/novel/user-skill-store"
import { useWikiStore } from "@/stores/wiki-store"
import { SkillLibraryView } from "./skill-library-view"
import {
  buildUnifiedSkillEntries,
  filterUnifiedSkillEntries,
  type UnifiedSkillEntry,
  type UnifiedSkillFilter,
} from "./unified-skill-model"
import { WritingSkillLibraryView } from "./writing-skill-library-view"

interface SkillLibraryQuickFilter {
  label: string
  filter: UnifiedSkillFilter
}

const quickFilters: SkillLibraryQuickFilter[] = [
  { label: "全部", filter: {} },
  { label: "写作", filter: { library: "writing" } },
  { label: "去AI味", filter: { category: "去AI味" } },
  { label: "审稿", filter: { category: "审稿" } },
  { label: "输出", filter: { category: "输出" } },
  { label: "知识", filter: { category: "知识" } },
]

function sourceLabel(entry: UnifiedSkillEntry): string {
  if (entry.library === "de-ai") {
    if (entry.source === "built-in") return "内置"
    if (entry.source === "legacy") return "旧版"
    return "项目"
  }
  if (entry.source === "built-in") return "内置"
  if (entry.source === "project") return "项目"
  return "写作"
}

function entryMeta(entry: UnifiedSkillEntry): string {
  const modes = entry.modes.map((mode) => SKILL_MODE_LABELS[mode]).join("、")
  const stages = entry.stages.map((stage) => SKILL_STAGE_LABELS[stage]).join("、")
  const kinds = entry.kind.map((kind) => SKILL_KIND_LABELS[kind]).join("、")
  return [modes, stages, kinds].filter(Boolean).join(" / ")
}

function useUnifiedSkillEntries() {
  const projectPath = useWikiStore((s) => s.project?.path)
  const dataVersion = useWikiStore((s) => s.dataVersion)
  const [deAiConfig, setDeAiConfig] = useState<DeAiSkillConfig | null>(null)
  const [writingConfig, setWritingConfig] = useState<UserSkillConfig | null>(null)
  const [loadError, setLoadError] = useState("")

  useEffect(() => {
    let cancelled = false
    setDeAiConfig(null)
    setWritingConfig(null)
    setLoadError("")

    Promise.all([
      loadDeAiSkillConfig(projectPath),
      loadUserSkillConfig(projectPath),
    ])
      .then(([nextDeAiConfig, nextWritingConfig]) => {
        if (cancelled) return
        setDeAiConfig(nextDeAiConfig)
        setWritingConfig(nextWritingConfig)
      })
      .catch(() => {
        if (cancelled) return
        setLoadError("技能库加载失败")
      })

    return () => {
      cancelled = true
    }
  }, [dataVersion, projectPath])

  const entries = useMemo(() => {
    if (!deAiConfig || !writingConfig) return []
    return buildUnifiedSkillEntries(deAiConfig, writingConfig)
  }, [deAiConfig, writingConfig])

  return {
    entries,
    loading: !loadError && (!deAiConfig || !writingConfig),
    loadError,
  }
}

function selectUnifiedEntry(entry: UnifiedSkillEntry) {
  const store = useWikiStore.getState()
  if (entry.library === "writing") {
    store.setActiveView("writingSkillLibrary")
    if (useWikiStore.getState().activeView !== "writingSkillLibrary") return
    useWikiStore.getState().setSelectedWritingSkillLibrarySkillId(entry.skillId)
    return
  }

  store.setActiveView("skillLibrary")
  if (useWikiStore.getState().activeView !== "skillLibrary") return
  useWikiStore.getState().setSelectedSkillLibrarySkillId(entry.skillId)
}

function UnifiedSkillRow({ entry }: { entry: UnifiedSkillEntry }) {
  const activeView = useWikiStore((s) => s.activeView)
  const selectedDeAiSkillId = useWikiStore((s) => s.selectedSkillLibrarySkillId)
  const selectedWritingSkillId = useWikiStore((s) => s.selectedWritingSkillLibrarySkillId)
  const active = entry.library === "writing"
    ? activeView === "writingSkillLibrary" && selectedWritingSkillId === entry.skillId
    : activeView !== "writingSkillLibrary" && selectedDeAiSkillId === entry.skillId

  return (
    <div
      data-testid={`unified-skill-entry-${entry.id}`}
      role="button"
      tabIndex={0}
      onClick={() => selectUnifiedEntry(entry)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          selectUnifiedEntry(entry)
        }
      }}
      className={`mb-2 rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent ${
        active ? "border-primary bg-accent/60" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{entry.name}</span>
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {entry.library === "writing" ? "写作" : "去AI味"}
        </span>
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {sourceLabel(entry)}
        </span>
      </div>
      <div className="mt-1 truncate text-xs text-muted-foreground">
        {entry.description || "未填写说明"}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">{entry.category}</span>
        <span className={`rounded px-1.5 py-0.5 ${
          entry.enabled ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"
        }`}
        >
          {entry.status}
        </span>
        {entry.defaultSkill ? (
          <span className="rounded bg-primary px-1.5 py-0.5 text-primary-foreground">默认</span>
        ) : null}
        {entry.modified ? (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">已修改</span>
        ) : null}
      </div>
      <div className="mt-1 truncate text-[10px] text-muted-foreground">{entryMeta(entry)}</div>
    </div>
  )
}

export function UnifiedSkillLibraryView() {
  const activeView = useWikiStore((s) => s.activeView)
  const showWritingSkill = activeView === "writingSkillLibrary"

  return (
    <div data-testid="unified-skill-library-view" className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">
        {showWritingSkill ? <WritingSkillLibraryView /> : <SkillLibraryView />}
      </div>
    </div>
  )
}

export function UnifiedSkillLibrarySidebarPanel() {
  const { entries, loading, loadError } = useUnifiedSkillEntries()
  const [query, setQuery] = useState("")
  const [activeFilterLabel, setActiveFilterLabel] = useState("全部")
  const activeFilter = quickFilters.find((filter) => filter.label === activeFilterLabel)?.filter ?? {}
  const visibleEntries = useMemo(() => {
    return filterUnifiedSkillEntries(entries, {
      ...activeFilter,
      query,
    })
  }, [activeFilter, entries, query])

  return (
    <div data-testid="unified-skill-library-sidebar" className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b px-3 py-2">
        <h1 className="text-sm font-semibold">技能库</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">统一管理写作 Skill 与去AI味技能。</p>
      </div>

      <div className="shrink-0 border-b px-3 py-2">
        <label className="sr-only" htmlFor="unified-skill-search-input">搜索技能</label>
        <input
          id="unified-skill-search-input"
          data-testid="unified-skill-search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索 Skill 名称、说明、规则"
          className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {quickFilters.map((filter) => {
            const active = activeFilterLabel === filter.label
            return (
              <button
                key={filter.label}
                type="button"
                aria-pressed={active}
                onClick={() => setActiveFilterLabel(filter.label)}
                className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {filter.label}
              </button>
            )
          })}
        </div>
      </div>

      {loadError ? (
        <div className="border-b px-3 py-2 text-xs text-destructive">{loadError}</div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">正在加载技能库...</div>
        ) : null}
        {!loading && visibleEntries.length === 0 ? (
          <div className="rounded-md border border-dashed p-3 text-xs leading-5 text-muted-foreground">
            没有匹配的 Skill。
          </div>
        ) : null}
        {visibleEntries.map((entry) => (
          <UnifiedSkillRow key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  )
}
