import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  BookText,
  Brain,
  ChevronDown,
  Clock3,
  FileText,
  GitBranchPlus,
  Plus,
  RefreshCw,
  Sparkles,
  Users,
} from "lucide-react"
import { KnowledgeTree, RawSourcesSection, type KnowledgeCreateRequest } from "./knowledge-tree"
import { TrashPanel } from "./trash-panel"
import { GraphSidebarPanel } from "./graph-sidebar-panel"
import { SoulSidebarPanel } from "./soul-sidebar-panel"
import { ReviewCenterSidebarPanel } from "./review-center-sidebar-panel"
import { useWikiStore } from "@/stores/wiki-store"
import { createDirectory, fileExists, listDirectory, readFile, writeFile } from "@/commands/fs"
import { countChapterBodyWords } from "@/lib/chapter-word-count"
import { buildChapterTotalWordCountLabel } from "@/lib/chapter-display"
import { normalizePath } from "@/lib/path-utils"
import { flattenMdFiles, getNextChapterNumber } from "@/lib/novel/chapter-utils"
import { Button } from "@/components/ui/button"
import type { MemoryCenterData, MemoryCenterFilePreview } from "@/lib/novel/memory-center"
import { OUTLINE_IMPORT_EXTENSIONS, importOutlineFiles, importOutlineFolder } from "@/lib/novel/outline-import"
import {
  CHAPTER_IMPORT_EXTENSIONS,
  collectChapterImportCandidatesFromFolder,
  importChapterFiles,
  runImportedChapterMemoryExtraction,
  type ImportedChapter,
} from "@/lib/novel/chapter-import"
import { resolveReviewModel } from "@/lib/novel/review-model"
import { isTauri } from "@/lib/platform"
import { makeChapterFileName, makeDefaultChapterTitle, makeSafeFileSlug } from "@/lib/wiki-filename"

function SearchHistoryPanel() {
  const { t } = useTranslation()
  const searchHistory = useWikiStore((s) => s.searchHistory)
  const setActiveView = useWikiStore((s) => s.setActiveView)
  const setSearchTrigger = useWikiStore((s) => s.setSearchTrigger)

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <div className="text-sm font-semibold text-foreground">
          {t("novel.nav.search")}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {searchHistory.length === 0 ? (
          <div className="px-2 py-4 text-xs text-muted-foreground">暂无历史搜索</div>
        ) : (
          <div className="space-y-1">
            {searchHistory.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setActiveView("search")
                  setSearchTrigger({ query: item, ts: Date.now() })
                }}
                className="w-full rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
              >
                <span className="line-clamp-2 break-all">{item}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function inferModeFromPath(path: string): "knowledge" | "files" {
  const normalized = normalizePath(path)
  if (normalized.includes("/wiki/outlines/")) return "files"
  return "knowledge"
}

interface PendingPageInfo {
  path: string
  title: string
  type: "chapter" | "outline"
  tags: string[]
  origin?: string
}

interface ChapterImportProgressState {
  completed: number
  total: number
  currentTitle: string
  cancelling: boolean
  doneMessage?: string
}

const MEMORY_LABEL_KEYS: Record<string, string> = {
  snapshots: "novel.memoryCenter.snapshots.title",
  "character-states": "novel.memoryCenter.sections.characterStates",
  "character-cognition": "novel.memoryCenter.sections.cognition",
  "foreshadowing-tracker": "novel.memoryCenter.sections.foreshadowing",
  timeline: "novel.memoryCenter.sections.timeline",
  "canon-facts": "novel.memoryCenter.sections.canonFacts",
  conflicts: "novel.memoryCenter.sections.conflicts",
}

const MEMORY_ICONS: Record<string, typeof Users> = {
  snapshots: FileText,
  "character-states": Users,
  "character-cognition": Brain,
  "foreshadowing-tracker": Sparkles,
  timeline: Clock3,
  "canon-facts": BookText,
  conflicts: GitBranchPlus,
}

function countMemoryFileEntries(file: MemoryCenterFilePreview | null | undefined): number {
  if (!file) return 0
  return file.sections.reduce(
    (sum, section) => sum + section.items.length + section.groups.length,
    0,
  )
}

function MemoryCenterListButton({
  label,
  count,
  selected,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string
  count: number
  selected: boolean
  icon: typeof Users
  disabled: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant={selected ? "secondary" : "ghost"}
      className="h-auto w-full justify-between px-3 py-2.5"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{label}</span>
      </span>
      <span className="ml-3 shrink-0 text-sm font-semibold leading-none">{count}</span>
    </Button>
  )
}

async function getExistingChapterTitles(projectPath: string): Promise<Set<string>> {
  const titles = new Set<string>()
  try {
    const tree = await listDirectory(`${projectPath}/wiki/chapters`)
    const files = flattenMdFiles(tree)
    for (const file of files) {
      try {
        const content = await readFile(file.path)
        const titleMatch = content.match(/^title:\s*["']?(.+?)["']?\s*$/m)
        if (titleMatch?.[1]) {
          titles.add(titleMatch[1].trim())
        } else {
          titles.add(file.name.replace(/\.md$/, "").replace(/-/g, " ").trim())
        }
      } catch {
        titles.add(file.name.replace(/\.md$/, "").replace(/-/g, " ").trim())
      }
    }
  } catch {
    // Ignore missing chapter directories.
  }
  return titles
}

async function getUniqueWikiPagePath(dir: string, fileName: string): Promise<string> {
  const firstPath = `${dir}/${fileName}`
  if (!(await fileExists(firstPath))) return firstPath

  const extensionIndex = fileName.lastIndexOf(".")
  const stem = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName
  const extension = extensionIndex > 0 ? fileName.slice(extensionIndex) : ""
  for (let index = 2; index <= 99; index += 1) {
    const candidate = `${dir}/${stem}-${index}${extension}`
    if (!(await fileExists(candidate))) return candidate
  }

  return `${dir}/${stem}-${Date.now()}${extension}`
}

export function SidebarPanel() {
  const { t } = useTranslation()
  const project = useWikiStore((s) => s.project)
  const activeView = useWikiStore((s) => s.activeView)
  const novelMode = useWikiStore((s) => s.novelMode)
  const selectedFile = useWikiStore((s) => s.selectedFile)
  const selectedMemoryCenterEntry = useWikiStore((s) => s.selectedMemoryCenterEntry)
  const setSelectedMemoryCenterEntry = useWikiStore((s) => s.setSelectedMemoryCenterEntry)
  const setSelectedFile = useWikiStore((s) => s.setSelectedFile)
  const setFileTree = useWikiStore((s) => s.setFileTree)
  const dataVersion = useWikiStore((s) => s.dataVersion)
  const [mode, setMode] = useState<"knowledge" | "files">("knowledge")
  const [refreshKey, setRefreshKey] = useState(0)
  const [pendingCreate, setPendingCreate] = useState<KnowledgeCreateRequest | null>(null)
  const [inputTitle, setInputTitle] = useState("")
  const [creating, setCreating] = useState(false)
  const [pendingPages, setPendingPages] = useState<PendingPageInfo[]>([])
  const [memoryData, setMemoryData] = useState<MemoryCenterData | null>(null)
  const [memoryLoading, setMemoryLoading] = useState(false)
  const [memoryError, setMemoryError] = useState<string | null>(null)
  const [sidebarTotalWordCount, setSidebarTotalWordCount] = useState<number | null>(null)
  const [outlineImporting, setOutlineImporting] = useState(false)
  const [outlineImportMenuOpen, setOutlineImportMenuOpen] = useState(false)
  const outlineImportMenuRef = useRef<HTMLDivElement | null>(null)
  const [chapterImporting, setChapterImporting] = useState(false)
  const [chapterImportMenuOpen, setChapterImportMenuOpen] = useState(false)
  const [chapterImportProgress, setChapterImportProgress] = useState<ChapterImportProgressState | null>(null)
  const chapterImportMenuRef = useRef<HTMLDivElement | null>(null)
  const chapterImportAbortRef = useRef<AbortController | null>(null)

  const loadMemoryCenter = useCallback(async (projectPath: string) => {
    const { loadMemoryCenterData } = await import("@/lib/novel/memory-center")
    return loadMemoryCenterData(projectPath)
  }, [])

  function cancelPendingCreate() {
    setPendingCreate(null)
    setInputTitle("")
  }

  useEffect(() => {
    if (activeView === "wiki") {
      setMode("knowledge")
      return
    }
    if (activeView === "sources") {
      setMode("files")
      return
    }
    if (!selectedFile) return
    setMode(inferModeFromPath(selectedFile))
  }, [activeView, selectedFile])

  const isChapter = mode === "knowledge"

  useEffect(() => {
    if (!project || !isChapter) {
      setSidebarTotalWordCount(null)
      return
    }

    let cancelled = false

    const loadSidebarTotalWordCount = async () => {
      try {
        const chapterNodes = await listDirectory(`${normalizePath(project.path)}/wiki/chapters`)
        const files = flattenMdFiles(chapterNodes)
        const contents = await Promise.all(files.map((file) => readFile(file.path).catch(() => "")))
        const total = contents.reduce((sum, markdown) => sum + countChapterBodyWords(markdown), 0)
        if (!cancelled) {
          setSidebarTotalWordCount(total)
        }
      } catch {
        if (!cancelled) {
          setSidebarTotalWordCount(null)
        }
      }
    }

    void loadSidebarTotalWordCount()

    return () => {
      cancelled = true
    }
  }, [dataVersion, isChapter, project])

  useEffect(() => {
    if (!pendingCreate?.kind) return
    if (isChapter && (pendingCreate.kind === "outline" || pendingCreate.kind === "folder")) {
      cancelPendingCreate()
    }
    if (!isChapter && pendingCreate.kind === "volume") {
      cancelPendingCreate()
    }
  }, [isChapter, pendingCreate?.kind])

  useEffect(() => {
    if (isChapter) {
      setOutlineImportMenuOpen(false)
    } else {
      setChapterImportMenuOpen(false)
    }
  }, [isChapter])

  useEffect(() => {
    if (!outlineImportMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (outlineImportMenuRef.current?.contains(target)) return
      setOutlineImportMenuOpen(false)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOutlineImportMenuOpen(false)
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleEscape)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [outlineImportMenuOpen])

  useEffect(() => {
    if (!chapterImportMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (chapterImportMenuRef.current?.contains(target)) return
      setChapterImportMenuOpen(false)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChapterImportMenuOpen(false)
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleEscape)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [chapterImportMenuOpen])

  const handleRemovePendingPage = (pagePath: string) => {
    setPendingPages((prev) => prev.filter((page) => page.path !== pagePath))
  }

  async function refreshTree(projectPath: string, selectedPath?: string) {
    const tree = await listDirectory(projectPath)
    setFileTree(tree)
    useWikiStore.getState().bumpDataVersion()
    setRefreshKey((current) => current + 1)
    if (selectedPath) setSelectedFile(selectedPath)
  }

  async function confirmChapterMemoryExtraction(count: number): Promise<boolean> {
    const targetDescription = count > 0 ? `本次导入的 ${count} 个章节` : "本次导入的章节"
    const message = `是否提取记忆？\n\n将为${targetDescription}逐章提取记忆并同步到记忆库。提取记忆会增加 token 消耗，速度较慢，请耐心等待。\n\n点击“提取记忆”开始提取记忆，点击“只导入”则只导入章节文件。`
    if (isTauri()) {
      const { confirm } = await import("@tauri-apps/plugin-dialog")
      return confirm(message, {
        title: "是否提取记忆",
        kind: "info",
        okLabel: "提取记忆",
        cancelLabel: "只导入",
      })
    }
    return window.confirm(message)
  }

  function handleCancelChapterMemoryExtraction() {
    chapterImportAbortRef.current?.abort()
    setChapterImportProgress((current) => current ? { ...current, cancelling: true } : current)
  }

  async function extractImportedChapterMemories(projectPath: string, importedChapters: ImportedChapter[]) {
    const abortController = new AbortController()
    chapterImportAbortRef.current = abortController
    const titleByPath = new Map(importedChapters.map((chapter) => [chapter.path, chapter.title]))
    setChapterImportProgress({
      completed: 0,
      total: importedChapters.length,
      currentTitle: importedChapters[0]?.title ?? "",
      cancelling: false,
    })

    const { ingestChapter } = await import("@/lib/novel/chapter-ingest")
    const configuredExtractModel = useWikiStore.getState().novelConfig.extractModel?.trim()
    const reviewModel = configuredExtractModel || resolveReviewModel()
    const result = await runImportedChapterMemoryExtraction({
      projectPath,
      chapterPaths: importedChapters.map((chapter) => chapter.path),
      signal: abortController.signal,
      reviewModel,
      ingestChapter,
      onProgress: (progress) => {
        setChapterImportProgress((current) => ({
          completed: progress.completed,
          total: progress.total,
          currentTitle: progress.currentPath ? titleByPath.get(progress.currentPath) ?? progress.currentPath : "",
          cancelling: current?.cancelling ?? false,
        }))
      },
    })

    const doneMessage = result.cancelled
      ? `已取消记忆提取，已完成 ${result.completed}/${importedChapters.length} 个章节。`
      : result.failed > 0
        ? `记忆提取完成：成功 ${result.completed} 个，失败 ${result.failed} 个。`
        : `记忆提取完成：成功 ${result.completed} 个章节。`
    setChapterImportProgress({
      completed: result.completed,
      total: importedChapters.length,
      currentTitle: "",
      cancelling: result.cancelled,
      doneMessage,
    })
    chapterImportAbortRef.current = null
    await refreshTree(projectPath, importedChapters[0]?.path)
  }

  async function finishChapterImport(projectPath: string, importedChapters: ImportedChapter[], extractMemory: boolean) {
    if (importedChapters.length === 0) {
      window.alert("没有找到可导入的章节文档。")
      return
    }
    await refreshTree(projectPath, importedChapters[0].path)
    if (extractMemory) {
      await extractImportedChapterMemories(projectPath, importedChapters)
    }
  }

  async function handleImportChapterFiles() {
    if (!project || chapterImporting) return
    if (!isTauri()) {
      window.alert("导入章节文档功能仅在桌面端可用。")
      return
    }

    const { open } = await import("@tauri-apps/plugin-dialog")
    const selected = await open({
      multiple: true,
      title: "导入章节文件",
      filters: [{ name: "章节文档", extensions: [...CHAPTER_IMPORT_EXTENSIONS] }],
    })
    if (!selected || (Array.isArray(selected) && selected.length === 0)) return

    const sourcePaths = Array.isArray(selected) ? selected : [selected]
    const extractMemory = await confirmChapterMemoryExtraction(sourcePaths.length)
    setChapterImporting(true)
    setChapterImportProgress(null)
    try {
      const projectPath = normalizePath(project.path)
      const importedChapters = await importChapterFiles(projectPath, sourcePaths, {
        finalForMemoryExtraction: extractMemory,
      })
      await finishChapterImport(projectPath, importedChapters, extractMemory)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("[SidebarPanel] chapter file import failed:", error)
      window.alert(`导入失败：${message}`)
    } finally {
      setChapterImporting(false)
      setChapterImportMenuOpen(false)
    }
  }

  async function handleImportChapterFolder() {
    if (!project || chapterImporting) return
    if (!isTauri()) {
      window.alert("导入章节文件夹功能仅在桌面端可用。")
      return
    }

    const { open } = await import("@tauri-apps/plugin-dialog")
    const selected = await open({
      directory: true,
      title: "导入章节文件夹",
    })
    const selectedFolder = Array.isArray(selected) ? selected[0] : selected
    if (!selectedFolder || typeof selectedFolder !== "string") return

    const candidates = await collectChapterImportCandidatesFromFolder(selectedFolder)
    if (candidates.length === 0) {
      window.alert("没有找到可导入的章节文档。")
      setChapterImportMenuOpen(false)
      return
    }

    const extractMemory = await confirmChapterMemoryExtraction(candidates.length)
    setChapterImporting(true)
    setChapterImportProgress(null)
    try {
      const projectPath = normalizePath(project.path)
      const importedChapters = await importChapterFiles(projectPath, candidates.map((candidate) => candidate.path), {
        finalForMemoryExtraction: extractMemory,
      })
      await finishChapterImport(projectPath, importedChapters, extractMemory)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("[SidebarPanel] chapter folder import failed:", error)
      window.alert(`导入失败：${message}`)
    } finally {
      setChapterImporting(false)
      setChapterImportMenuOpen(false)
    }
  }

  async function handleImportOutlineFiles() {
    if (!project || outlineImporting) return
    if (!isTauri()) {
      window.alert(t("novel.outlineImport.desktopOnly", { defaultValue: "导入大纲文档功能仅在桌面端可用。" }))
      return
    }

    const { open } = await import("@tauri-apps/plugin-dialog")
    const selected = await open({
      multiple: true,
      title: t("novel.outlineImport.importFilesTitle", { defaultValue: "导入大纲文件" }),
      filters: [
        {
          name: t("novel.outlineImport.documentFilter", { defaultValue: "文档" }),
          extensions: [...OUTLINE_IMPORT_EXTENSIONS],
        },
      ],
    })
    if (!selected || (Array.isArray(selected) && selected.length === 0)) return

    setOutlineImporting(true)
    try {
      const projectPath = normalizePath(project.path)
      const sourcePaths = Array.isArray(selected) ? selected : [selected]
      const importedPaths = await importOutlineFiles(projectPath, sourcePaths)
      if (importedPaths.length === 0) {
        window.alert(t("novel.outlineImport.emptyResult", { defaultValue: "没有找到可导入的大纲文档。" }))
        return
      }
      await refreshTree(projectPath, importedPaths[0])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("[SidebarPanel] outline file import failed:", error)
      window.alert(t("novel.outlineImport.importFailed", {
        message,
        defaultValue: `导入失败：${message}`,
      }))
    } finally {
      setOutlineImporting(false)
      setOutlineImportMenuOpen(false)
    }
  }

  async function handleImportOutlineFolder() {
    if (!project || outlineImporting) return
    if (!isTauri()) {
      window.alert(t("novel.outlineImport.desktopOnly", { defaultValue: "导入大纲文档功能仅在桌面端可用。" }))
      return
    }

    const { open } = await import("@tauri-apps/plugin-dialog")
    const selected = await open({
      directory: true,
      title: t("novel.outlineImport.importFolderTitle", { defaultValue: "导入大纲文件夹" }),
    })
    if (!selected || typeof selected !== "string") return

    setOutlineImporting(true)
    try {
      const projectPath = normalizePath(project.path)
      const importedPaths = await importOutlineFolder(projectPath, selected)
      if (importedPaths.length === 0) {
        window.alert(t("novel.outlineImport.emptyResult", { defaultValue: "没有找到可导入的大纲文档。" }))
        return
      }
      await refreshTree(projectPath, importedPaths[0])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("[SidebarPanel] outline folder import failed:", error)
      window.alert(t("novel.outlineImport.importFailed", {
        message,
        defaultValue: `导入失败：${message}`,
      }))
    } finally {
      setOutlineImporting(false)
      setOutlineImportMenuOpen(false)
    }
  }

  async function handleCreateNextChapter(parentDir?: string) {
    if (!project) return
    setCreating(true)
    try {
      const projectPath = normalizePath(project.path)
      const chaptersRoot = `${projectPath}/wiki/chapters`
      const targetDir = parentDir ?? chaptersRoot
      await createDirectory(chaptersRoot).catch(() => {})
      await createDirectory(targetDir).catch(() => {})

      const existingTitles = await getExistingChapterTitles(projectPath)
      let nextNumber = await getNextChapterNumber(projectPath)
      while (existingTitles.has(makeDefaultChapterTitle(nextNumber))) {
        nextNumber += 1
      }

      const title = makeDefaultChapterTitle(nextNumber)
      const filePath = await getUniqueWikiPagePath(targetDir, makeChapterFileName(title, nextNumber))
      const content = [
        "---",
        "type: chapter",
        `title: "${title}"`,
        `chapter_number: ${nextNumber}`,
        "chapter_status: draft",
        "---",
        "",
        `# ${title}`,
        "",
      ].join("\n")

      await writeFile(filePath, content)
      setPendingPages((prev) => [
        { path: filePath, title, type: "chapter", tags: [] },
        ...prev.filter((page) => page.path !== filePath),
      ])
      await refreshTree(projectPath, filePath)
    } catch (error) {
      console.error("[SidebarPanel] auto chapter create failed:", error)
    } finally {
      setCreating(false)
    }
  }

  async function handleCreateFromInput() {
    if (!project || !pendingCreate || !inputTitle.trim()) return
    setCreating(true)
    try {
      const projectPath = normalizePath(project.path)
      const title = inputTitle.trim()

      if (pendingCreate.kind === "outline") {
        const outlinesRoot = `${projectPath}/wiki/outlines`
        const targetDir = pendingCreate.parentDir ?? outlinesRoot
        await createDirectory(outlinesRoot).catch(() => {})
        await createDirectory(targetDir).catch(() => {})
        const filePath = await getUniqueWikiPagePath(targetDir, `${makeSafeFileSlug(title)}.md`)
        const content = [
          "---",
          "type: outline",
          `title: "${title.replace(/"/g, '\\"')}"`,
          "---",
          "",
          `# ${title}`,
          "",
        ].join("\n")
        await writeFile(filePath, content)
        setPendingPages((prev) => [
          { path: filePath, title, type: "outline", tags: [] },
          ...prev.filter((page) => page.path !== filePath),
        ])
        await refreshTree(projectPath, filePath)
      } else {
        const baseDir = pendingCreate.parentDir
          ?? `${projectPath}/wiki/${pendingCreate.kind === "volume" ? "chapters" : "outlines"}`
        await createDirectory(baseDir).catch(() => {})
        const folderPath = `${baseDir}/${makeSafeFileSlug(title)}`
        await createDirectory(folderPath)
        await refreshTree(projectPath)
      }

      setPendingCreate(null)
      setInputTitle("")
    } catch (error) {
      console.error("[SidebarPanel] create failed:", error)
    } finally {
      setCreating(false)
    }
  }

  function beginCreate(request: KnowledgeCreateRequest) {
    if (request.kind === "chapter") {
      void handleCreateNextChapter(request.parentDir)
      return
    }
    setPendingCreate(request)
    setInputTitle("")
  }

  const inputPlaceholder = pendingCreate?.kind === "outline"
    ? t("sidebar.newOutlinePrompt")
    : pendingCreate?.kind === "volume"
      ? t("sidebar.newVolumePrompt")
      : pendingCreate?.kind === "folder"
        ? t("sidebar.newFolderPrompt")
        : ""

  useEffect(() => {
    if (!(activeView === "lint" && novelMode)) return
    setSelectedMemoryCenterEntry(null)
  }, [activeView, novelMode, setSelectedMemoryCenterEntry])

  useEffect(() => {
    if (!(activeView === "lint" && novelMode) || !project?.path) {
      setMemoryData(null)
      setMemoryError(null)
      setMemoryLoading(false)
      return
    }

    let cancelled = false
    setMemoryLoading(true)
    setMemoryError(null)

    void loadMemoryCenter(project.path)
      .then((nextData) => {
        if (cancelled) return
        setMemoryData(nextData)
      })
      .catch((err) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        setMemoryError(message)
      })
      .finally(() => {
        if (cancelled) return
        setMemoryLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeView, loadMemoryCenter, novelMode, project?.path])

  if (activeView === "graph") {
    return <GraphSidebarPanel />
  }

  if (activeView === "soul") {
    return <SoulSidebarPanel />
  }

  if (activeView === "reviewCenter") {
    return <ReviewCenterSidebarPanel />
  }

  if (activeView === "search") {
    return <SearchHistoryPanel />
  }

  if (activeView === "trash") {
    return <TrashPanel />
  }

  if (activeView === "lint" && novelMode) {
    const fileMap = new Map(memoryData?.files.map((file) => [file.key, file]) ?? [])
    const entries = Object.keys(MEMORY_LABEL_KEYS).map((key) => {
      if (key === "snapshots") {
        return {
          key,
          label: t(MEMORY_LABEL_KEYS[key]),
          count: memoryData?.stats.snapshotCount ?? 0,
          icon: MEMORY_ICONS[key] ?? FileText,
          disabled: (memoryData?.snapshots.length ?? 0) === 0,
        }
      }

      const file = fileMap.get(key)
      return {
        key,
        label: t(MEMORY_LABEL_KEYS[key]),
        count: countMemoryFileEntries(file),
        icon: MEMORY_ICONS[key] ?? FileText,
        disabled: !file,
      }
    })

    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
          <div className="text-sm font-semibold text-foreground">
            {t("novel.memoryCenter.title")}
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => {
              if (!project?.path) return
              setMemoryLoading(true)
              setMemoryError(null)
              void loadMemoryCenter(project.path)
                .then((nextData) => setMemoryData(nextData))
                .catch((err) => {
                  const message = err instanceof Error ? err.message : String(err)
                  setMemoryError(message)
                })
                .finally(() => setMemoryLoading(false))
            }}
            disabled={memoryLoading}
            title={t("novel.memoryCenter.refresh")}
          >
            <RefreshCw className={`h-4 w-4 ${memoryLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3">
          {memoryError ? (
            <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {memoryError}
            </div>
          ) : null}

          {memoryLoading && !memoryData ? (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
              <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
              {t("novel.memoryCenter.loading")}
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map((entry) => (
                <MemoryCenterListButton
                  key={entry.key}
                  label={entry.label}
                  count={entry.count}
                  selected={selectedMemoryCenterEntry === entry.key}
                  icon={entry.icon}
                  disabled={entry.disabled}
                  onClick={() => setSelectedMemoryCenterEntry(entry.key)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">
            {isChapter ? t("sidebar.knowledge") : t("sidebar.files")}
          </div>
          {isChapter && sidebarTotalWordCount !== null ? (
            <div className="mt-0.5 text-xs text-muted-foreground">
              {buildChapterTotalWordCountLabel(sidebarTotalWordCount)}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {isChapter ? (
            <div ref={chapterImportMenuRef} className="relative">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => setChapterImportMenuOpen((prev) => !prev)}
                disabled={chapterImporting}
              >
                {chapterImporting ? "导入中..." : "导入"}
                <ChevronDown className="ml-1 h-3.5 w-3.5" />
              </Button>
              {chapterImportMenuOpen ? (
                <div className="absolute right-0 top-full z-20 mt-1 w-28 rounded-md border bg-popover py-1 text-xs text-popover-foreground shadow-lg">
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left hover:bg-accent"
                    onClick={() => void handleImportChapterFiles()}
                  >
                    导入文件
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left hover:bg-accent"
                    onClick={() => void handleImportChapterFolder()}
                  >
                    导入文件夹
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div ref={outlineImportMenuRef} className="relative">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => setOutlineImportMenuOpen((prev) => !prev)}
                disabled={outlineImporting}
              >
                {outlineImporting ? t("sources.importing") : t("sources.import")}
                <ChevronDown className="ml-1 h-3.5 w-3.5" />
              </Button>
              {outlineImportMenuOpen ? (
                <div className="absolute right-0 top-full z-20 mt-1 w-28 rounded-md border bg-popover py-1 text-xs text-popover-foreground shadow-lg">
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left hover:bg-accent"
                    onClick={() => void handleImportOutlineFiles()}
                  >
                    {t("sources.importFiles")}
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left hover:bg-accent"
                    onClick={() => void handleImportOutlineFolder()}
                  >
                    {t("sources.importFolder")}
                  </button>
                </div>
              ) : null}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              if (isChapter) {
                void handleCreateNextChapter()
                return
              }
              beginCreate({ kind: "outline" })
            }}
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={isChapter ? t("sidebar.newChapter") : t("sidebar.newOutline")}
            disabled={creating || outlineImporting || chapterImporting}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isChapter && chapterImportProgress ? (
        <div className="border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {chapterImportProgress.doneMessage ? (
            <div className="font-medium text-foreground">{chapterImportProgress.doneMessage}</div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  {chapterImportProgress.cancelling
                    ? "正在取消记忆提取，当前章节完成后停止..."
                    : `正在提取记忆：${chapterImportProgress.completed}/${chapterImportProgress.total} ${chapterImportProgress.currentTitle}`}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 shrink-0 px-2 text-xs"
                  onClick={handleCancelChapterMemoryExtraction}
                  disabled={chapterImportProgress.cancelling}
                >
                  取消
                </Button>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${chapterImportProgress.total > 0 ? Math.round((chapterImportProgress.completed / chapterImportProgress.total) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      ) : null}

      {pendingCreate && (
        <div className="flex items-center gap-1 border-b px-2 py-1">
          <input
            type="text"
            value={inputTitle}
            onChange={(event) => setInputTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && inputTitle.trim()) {
                void handleCreateFromInput()
              } else if (event.key === "Escape") {
                cancelPendingCreate()
              }
            }}
            placeholder={inputPlaceholder}
            className="flex-1 rounded-md border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
            autoFocus
            disabled={creating}
          />
          <button
            type="button"
            onClick={() => void handleCreateFromInput()}
            disabled={!inputTitle.trim() || creating}
            className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {creating ? "..." : "创建"}
          </button>
          <button
            type="button"
            onClick={() => {
              cancelPendingCreate()
            }}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            取消
          </button>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <KnowledgeTree
          filterType={isChapter ? "chapter" : "outline"}
          refreshKey={refreshKey}
          pendingPages={pendingPages.filter((page) => page.type === (isChapter ? "chapter" : "outline"))}
          onRemovePendingPage={handleRemovePendingPage}
          onRequestCreate={beginCreate}
        />
      </div>
      <RawSourcesSection />
    </div>
  )
}
