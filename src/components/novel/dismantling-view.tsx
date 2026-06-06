import { useEffect, useMemo, useState } from "react"
import { BookOpenCheck, CheckCircle2, FilePlus2, FolderPlus, Loader2, Play, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { preprocessFile, readFile } from "@/commands/fs"
import { useWikiStore } from "@/stores/wiki-store"
import { streamChat, type ChatMessage } from "@/lib/llm-client"
import { resolveNovelModel } from "@/lib/novel/model-resolver"
import {
  buildDismantlingAnalysisPrompt,
  extractStructureMemoryFromAnalysis,
  loadDismantlingLibrary,
  saveDismantlingLibrary,
  selectNextDismantlingBatch,
  splitDismantlingTextIntoChapters,
  type DismantlingAnalysis,
  type DismantlingChapter,
  type DismantlingLibrary,
  type DismantlingProject,
} from "@/lib/novel/dismantling"
import { collectChapterImportCandidatesFromFolder, sortChapterImportCandidates, type ChapterImportCandidate } from "@/lib/novel/chapter-import"
import { getFileName, getFileStem, normalizePath } from "@/lib/path-utils"

const DEFAULT_BATCH_SIZE = 3

export function DismantlingView() {
  const project = useWikiStore((state) => state.project)
  const llmConfig = useWikiStore((state) => state.llmConfig)
  const novelConfig = useWikiStore((state) => state.novelConfig)
  const [library, setLibrary] = useState<DismantlingLibrary>({ version: 1, projects: [], selectedProjectId: null })
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([])
  const [batchSize, setBatchSize] = useState(DEFAULT_BATCH_SIZE)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState("")

  const selectedProject = useMemo(
    () => library.projects.find((item) => item.id === library.selectedProjectId) ?? library.projects[0] ?? null,
    [library],
  )

  useEffect(() => {
    if (!project) {
      setLibrary({ version: 1, projects: [], selectedProjectId: null })
      return
    }
    let cancelled = false
    setLoading(true)
    void loadDismantlingLibrary(project.path)
      .then((value) => {
        if (cancelled) return
        setLibrary(value)
        const first = value.projects.find((item) => item.id === value.selectedProjectId) ?? value.projects[0]
        setSelectedChapterIds(first?.chapters.map((chapter) => chapter.id) ?? [])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [project])

  const persistLibrary = async (next: DismantlingLibrary) => {
    if (!project) return
    setLibrary(next)
    await saveDismantlingLibrary(project.path, next)
  }

  const upsertSelectedProject = async (updater: (current: DismantlingProject) => DismantlingProject) => {
    if (!selectedProject) return
    const nextProjects = library.projects.map((item) => item.id === selectedProject.id ? updater(item) : item)
    await persistLibrary({ ...library, projects: nextProjects, selectedProjectId: selectedProject.id })
  }

  const importCandidates = async (candidates: ChapterImportCandidate[], titleFallback: string) => {
    if (!project) return
    setStatus("正在导入拆文资料...")
    const chapters: DismantlingChapter[] = []
    const sorted = sortChapterImportCandidates(candidates)
    for (const candidate of sorted) {
      let content = ""
      try {
        content = await preprocessFile(candidate.path)
      } catch {
        content = await readFile(candidate.path)
      }
      const split = splitDismantlingTextIntoChapters(content)
      if (split.length <= 1) {
        const chapterNumber = chapters.length + 1
        chapters.push({
          id: `chapter-${String(chapterNumber).padStart(3, "0")}`,
          chapterNumber,
          title: split[0]?.title === "第1章" ? getFileStem(candidate.name) || `第${chapterNumber}章` : split[0]?.title ?? getFileStem(candidate.name),
          content: split[0]?.content || content,
          status: "pending",
        })
      } else {
        for (const item of split) {
          chapters.push({ ...item, id: `chapter-${String(chapters.length + 1).padStart(3, "0")}`, chapterNumber: chapters.length + 1 })
        }
      }
    }

    if (chapters.length === 0) {
      setStatus("没有找到可导入的章节。")
      return
    }

    const now = Date.now()
    const nextProject: DismantlingProject = {
      id: `dismantling-${now}`,
      title: titleFallback || "未命名拆文作品",
      createdAt: now,
      updatedAt: now,
      chapters,
      analyses: [],
      structureMemory: [],
      useInChat: false,
    }
    const nextLibrary = {
      ...library,
      projects: [nextProject, ...library.projects],
      selectedProjectId: nextProject.id,
    }
    await persistLibrary(nextLibrary)
    setSelectedChapterIds(chapters.map((chapter) => chapter.id))
    setStatus(`已导入 ${chapters.length} 章，内容只保存到独立拆文记忆库，不会写入小说记忆。`)
  }

  const handleImportFiles = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog")
    const selected = await open({
      multiple: true,
      filters: [{ name: "文档", extensions: ["txt", "md", "mdx", "doc", "docx"] }],
    })
    const paths = Array.isArray(selected) ? selected : selected ? [selected] : []
    if (paths.length === 0) return
    const candidates = paths.map((path) => ({ path: normalizePath(path), name: getFileName(path) }))
    await importCandidates(candidates, getFileStem(candidates[0]?.name ?? "") || "拆文作品")
  }

  const handleImportFolder = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog")
    const selected = await open({ directory: true })
    if (!selected || Array.isArray(selected)) return
    const candidates = await collectChapterImportCandidatesFromFolder(selected)
    await importCandidates(candidates, getFileName(selected) || "拆文作品")
  }

  const handleRunDismantling = async () => {
    if (!project || !selectedProject || running) return
    const batch = selectNextDismantlingBatch(selectedProject, { selectedChapterIds, batchSize })
    if (batch.length === 0) {
      setStatus("当前选择范围内没有待拆章节。")
      return
    }

    setRunning(true)
    setStatus(`正在拆文：本批 ${batch.length} 章。`)
    const runningIds = new Set(batch.map((chapter) => chapter.id))
    await upsertSelectedProject((current) => ({
      ...current,
      updatedAt: Date.now(),
      chapters: current.chapters.map((chapter) => runningIds.has(chapter.id) ? { ...chapter, status: "running" } : chapter),
    }))

    let output = ""
    try {
      const messages: ChatMessage[] = [
        { role: "system", content: "你是严谨的小说拆文分析助手，必须用中文输出结构化结果。" },
        { role: "user", content: buildDismantlingAnalysisPrompt({ projectTitle: selectedProject.title, chapters: batch }) },
      ]
      await new Promise<void>((resolve, reject) => {
        void streamChat(
          resolveNovelModel(llmConfig, novelConfig, "extract"),
          messages,
          {
            onToken: (token) => { output += token },
            onDone: resolve,
            onError: reject,
          },
        )
      })
      const memory = extractStructureMemoryFromAnalysis(output)
      const analysis: DismantlingAnalysis = {
        id: `analysis-${Date.now()}`,
        chapterIds: batch.map((chapter) => chapter.id),
        title: `第 ${batch[0].chapterNumber}-${batch[batch.length - 1].chapterNumber} 章拆文`,
        createdAt: Date.now(),
        markdown: output,
        structureMemory: memory,
      }
      await upsertSelectedProject((current) => ({
        ...current,
        updatedAt: Date.now(),
        chapters: current.chapters.map((chapter) => runningIds.has(chapter.id) ? { ...chapter, status: "done", error: undefined } : chapter),
        analyses: [analysis, ...current.analyses],
        structureMemory: mergeUnique([...memory, ...current.structureMemory]).slice(0, 120),
      }))
      setStatus(`本批拆文完成，新增 ${memory.length} 条结构记忆。`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await upsertSelectedProject((current) => ({
        ...current,
        updatedAt: Date.now(),
        chapters: current.chapters.map((chapter) => runningIds.has(chapter.id) ? { ...chapter, status: "failed", error: message } : chapter),
      }))
      setStatus(`拆文失败：${message}`)
    } finally {
      setRunning(false)
    }
  }

  const toggleUseInChat = async (checked: boolean) => {
    await upsertSelectedProject((current) => ({ ...current, useInChat: checked, updatedAt: Date.now() }))
    setStatus(checked ? "已启用：AI 会话会在用户写作时参考拆文结构。" : "已关闭：AI 会话不会读取该拆文结构。")
  }

  const toggleChapter = (id: string, checked: boolean) => {
    setSelectedChapterIds((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id))
  }

  if (!project) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">请先打开小说项目。</div>
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="border-b px-5 py-3">
        <div className="flex items-center gap-2 text-sm text-primary">
          <BookOpenCheck className="h-4 w-4" />
          <span>独立拆文记忆库</span>
          <span className="text-muted-foreground">— 拆文结果独立保存，不会写入小说记忆、章节记忆或大纲记忆。</span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_380px]">
        {/* Column 1: 拆文作品列表（含导入按钮） */}
        <aside className="min-h-0 border-r bg-muted/20 flex flex-col">
          <div className="border-b p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">拆文作品</div>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleImportFiles}>
                  <FilePlus2 className="mr-1 h-3.5 w-3.5" />
                  导入文件
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleImportFolder}>
                  <FolderPlus className="mr-1 h-3.5 w-3.5" />
                  导入文件夹
                </Button>
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {loading ? (
              <div className="text-sm text-muted-foreground">正在读取拆文库...</div>
            ) : library.projects.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">还没有拆文作品，使用上方按钮导入。</div>
            ) : library.projects.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setLibrary({ ...library, selectedProjectId: item.id })
                  setSelectedChapterIds(item.chapters.map((chapter) => chapter.id))
                }}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${selectedProject?.id === item.id ? "border-primary bg-primary/10" : "bg-background hover:bg-muted"}`}
              >
                <div className="font-medium truncate">{item.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{item.chapters.length} 章 · {item.structureMemory.length} 条结构记忆</div>
              </button>
            ))}
          </div>
        </aside>

        {/* Column 2: 章节详情与拆文操作 */}
        <main className="min-h-0 flex flex-col overflow-hidden border-r">
          {!selectedProject ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">请从左侧选择拆文作品</div>
          ) : (
            <>
              <div className="border-b px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold">{selectedProject.title}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">{selectedProject.chapters.length} 章 · {selectedProject.structureMemory.length} 条结构记忆</p>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
                <section className="rounded-lg border bg-card p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    使用拆文结构
                  </div>
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedProject.useInChat)}
                      onChange={(event) => void toggleUseInChat(event.target.checked)}
                    />
                    <span>在 AI 会话写作时参考当前拆文作品的结构记忆。</span>
                  </label>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">只学习节奏、冲突推进、爽点安排和章节钩子；不得复用原作人物、设定、剧情和具体表达。</p>
                </section>

                <section className="rounded-lg border bg-card">
                  <div className="flex items-center justify-between border-b px-4 py-2.5">
                    <div className="text-sm font-medium">章节列表</div>
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedChapterIds(selectedProject.chapters.map((chapter) => chapter.id))}>全选</Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedChapterIds([])}>清空</Button>
                      </div>
                      <label className="flex items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground">每批</span>
                        <select
                          value={batchSize}
                          onChange={(event) => setBatchSize(Number(event.target.value))}
                          className="rounded border bg-background px-1.5 py-0.5 text-xs"
                        >
                          {[1, 3, 5, 10].map((size) => <option key={size} value={size}>{size}章</option>)}
                        </select>
                      </label>
                    </div>
                  </div>
                  <div className="divide-y max-h-[calc(100vh-420px)] min-h-[120px] overflow-y-auto">
                    {selectedProject.chapters.map((chapter) => (
                      <label key={chapter.id} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/40">
                        <input
                          type="checkbox"
                          checked={selectedChapterIds.includes(chapter.id)}
                          onChange={(event) => toggleChapter(chapter.id, event.target.checked)}
                        />
                        <span className="w-14 shrink-0 text-muted-foreground">第{chapter.chapterNumber}章</span>
                        <span className="min-w-0 flex-1 truncate">{chapter.title}</span>
                        <StatusBadge status={chapter.status} />
                      </label>
                    ))}
                  </div>
                  <div className="border-t px-4 py-3">
                    <Button size="sm" className="w-full" onClick={handleRunDismantling} disabled={running || !selectedProject || selectedChapterIds.length === 0}>
                      {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                      {running ? "拆文中..." : selectedChapterIds.length === 0 ? "请先选择章节" : `开始拆文（${selectedChapterIds.length} 章）`}
                    </Button>
                  </div>
                </section>
              </div>
            </>
          )}
        </main>

        {/* Column 3: 拆文结果 */}
        <aside className="min-h-0 overflow-y-auto bg-muted/20 p-4">
          {!selectedProject ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">选择作品后，拆文结果将显示在此处。</div>
          ) : (
            <div className="space-y-4">
              <section className="rounded-lg border bg-card p-3">
                <div className="mb-2 text-sm font-medium">结构记忆</div>
                {selectedProject.structureMemory.length === 0 ? (
                  <div className="text-xs text-muted-foreground">拆文完成后，这里会显示可供 AI 引用的结构记忆。</div>
                ) : (
                  <ul className="space-y-1.5 text-xs leading-5">
                    {selectedProject.structureMemory.slice(0, 30).map((item) => <li key={item}>- {item}</li>)}
                  </ul>
                )}
              </section>

              <section className="rounded-lg border bg-card p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <RefreshCw className="h-4 w-4" />
                  最近拆文结果
                </div>
                {selectedProject.analyses.length === 0 ? (
                  <div className="text-xs text-muted-foreground">还没有拆文结果。</div>
                ) : (
                  <div className="space-y-3">
                    {selectedProject.analyses.slice(0, 5).map((analysis) => (
                      <article key={analysis.id} className="rounded-lg border bg-background p-3">
                        <div className="mb-2 text-sm font-medium">{analysis.title}</div>
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-6 text-muted-foreground">{analysis.markdown}</pre>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {status && (
                <div className="rounded-lg border bg-card p-3 text-xs leading-5 text-muted-foreground">{status}</div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: DismantlingChapter["status"] }) {
  const label = status === "done" ? "已拆" : status === "running" ? "拆文中" : status === "failed" ? "失败" : "待拆"
  return <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{label}</span>
}

function mergeUnique(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))]
}

