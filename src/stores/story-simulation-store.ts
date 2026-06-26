import { create } from "zustand"
import type {
  SimulationMode,
  StoryFramework,
  SimulationReport,
  StoryDraft,
  ExtractionResult,
  FrameworkBinding,
} from "@/lib/novel/story-simulation/types"

export type SimulationPhase =
  | "idle"
  | "configuring"
  | "extracting"
  | "framework-generating"
  | "framework-confirming"
  | "simulating"
  | "report-generating"
  | "report-viewing"
  | "draft-generating"
  | "draft-viewing"

export interface StorySimulationState {
  phase: SimulationPhase
  mode: SimulationMode
  userIdea: string
  targetWords: number
  sourceChapters: number
  extractionResult: ExtractionResult | null
  currentFramework: StoryFramework | null
  currentReport: SimulationReport | null
  currentDraft: StoryDraft | null
  frameworks: StoryFramework[]
  selectedFrameworkId: string | null
  binding: FrameworkBinding | null
  error: string | null
  progress: number
  progressLabel: string

  setPhase: (phase: SimulationPhase) => void
  setMode: (mode: SimulationMode) => void
  setUserIdea: (idea: string) => void
  setTargetWords: (words: number) => void
  setSourceChapters: (count: number) => void
  setExtractionResult: (result: ExtractionResult | null) => void
  setCurrentFramework: (framework: StoryFramework | null) => void
  setCurrentReport: (report: SimulationReport | null) => void
  setCurrentDraft: (draft: StoryDraft | null) => void
  setFrameworks: (frameworks: StoryFramework[]) => void
  setSelectedFrameworkId: (id: string | null) => void
  setBinding: (binding: FrameworkBinding | null) => void
  setError: (error: string | null) => void
  setProgress: (progress: number, label: string) => void
  reset: () => void
}

export const useStorySimulationStore = create<StorySimulationState>((set) => ({
  phase: "idle",
  mode: "event-driven",
  userIdea: "",
  targetWords: 10000,
  sourceChapters: 10,
  extractionResult: null,
  currentFramework: null,
  currentReport: null,
  currentDraft: null,
  frameworks: [],
  selectedFrameworkId: null,
  binding: null,
  error: null,
  progress: 0,
  progressLabel: "",

  setPhase: (phase) => set({ phase }),
  setMode: (mode) => set({ mode }),
  setUserIdea: (userIdea) => set({ userIdea }),
  setTargetWords: (targetWords) => set({ targetWords }),
  setSourceChapters: (sourceChapters) => set({ sourceChapters }),
  setExtractionResult: (extractionResult) => set({ extractionResult }),
  setCurrentFramework: (currentFramework) => set({ currentFramework }),
  setCurrentReport: (currentReport) => set({ currentReport }),
  setCurrentDraft: (currentDraft) => set({ currentDraft }),
  setFrameworks: (frameworks) => set({ frameworks }),
  setSelectedFrameworkId: (selectedFrameworkId) => set({ selectedFrameworkId }),
  setBinding: (binding) => set({ binding }),
  setError: (error) => set({ error }),
  setProgress: (progress, progressLabel) => set({ progress, progressLabel }),
  reset: () =>
    set({
      phase: "idle",
      extractionResult: null,
      currentFramework: null,
      currentReport: null,
      currentDraft: null,
      error: null,
      progress: 0,
      progressLabel: "",
    }),
}))
