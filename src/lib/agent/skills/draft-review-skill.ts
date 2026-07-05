import {
  loadCognitionState,
  type CognitionState,
} from "@/lib/novel/character-cognition";
import {
  loadCharacterStates,
  type CharacterStateStore,
} from "@/lib/novel/character-state";
import {
  loadForeshadowingTracker,
  type ForeshadowingStore,
} from "@/lib/novel/foreshadowing-tracker";
import {
  listSnapshots,
  loadSnapshot,
  type ChapterSnapshot,
} from "@/lib/novel/chapter-ingest";

export type DeviationType =
  "cognition" | "state" | "continuity" | "foreshadowing";
export type DeviationSeverity = "high" | "mid" | "low";

export interface Deviation {
  id: string;
  type: DeviationType;
  location: string;
  originalText: string;
  expected: string;
  memoryEvidence: string;
  severity: DeviationSeverity;
  repairAction?: string;
}

export interface DraftReviewInput {
  projectPath: string;
  draftChapterText: string;
  draftChapterNumber: number;
  mode: "full" | "incremental";
  previousRound?: DraftReviewResult;
}

export interface DraftReviewResult {
  deviations: Deviation[];
  revisedDraft: string;
  repairSummary: string;
  retryRound: number;
  truncated: boolean;
}

export interface ReviewEvidence {
  cognition: CognitionState | null;
  characterStates: CharacterStateStore;
  foreshadowing: ForeshadowingStore;
  previousSnapshot: ChapterSnapshot | null;
  /** 派生数据内部矛盾标志，Task 3/4 会扩展检测逻辑 */
  internalConflict: boolean;
  rawLoadError: boolean;
}

export async function loadReviewEvidence(
  projectPath: string,
): Promise<ReviewEvidence> {
  let cognition: CognitionState | null = null;
  let characterStates: CharacterStateStore = {
    characters: [],
    lastUpdated: "",
  };
  let foreshadowing: ForeshadowingStore = { items: [], lastUpdated: "" };
  let previousSnapshot: ChapterSnapshot | null = null;
  let rawLoadError = false;

  try {
    cognition = await loadCognitionState(projectPath);
  } catch {
    rawLoadError = true;
  }
  try {
    characterStates = await loadCharacterStates(projectPath);
  } catch {
    rawLoadError = true;
  }
  try {
    foreshadowing = await loadForeshadowingTracker(projectPath);
  } catch {
    rawLoadError = true;
  }
  try {
    const numbers = await listSnapshots(projectPath);
    const valid = numbers.filter((n) => n > 0);
    if (valid.length > 0)
      previousSnapshot = await loadSnapshot(projectPath, Math.max(...valid));
  } catch {
    rawLoadError = true;
  }

  return {
    cognition,
    characterStates,
    foreshadowing,
    previousSnapshot,
    internalConflict: false,
    rawLoadError,
  };
}
