import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadReviewEvidence,
  type Deviation,
  type DraftReviewInput,
  type DraftReviewResult,
  type ReviewEvidence,
} from "./draft-review-skill";

vi.mock("@/lib/novel/character-cognition", () => ({
  loadCognitionState: vi.fn(),
  emptyCognitionState: vi.fn(() => ({
    characters: [],
    readerKnows: [],
    lastUpdatedChapter: 0,
  })),
}));

vi.mock("@/lib/novel/character-state", () => ({
  loadCharacterStates: vi.fn(),
  createEmptyCharacterStateStore: vi.fn(() => ({
    characters: [],
    lastUpdated: "2026-07-05T00:00:00.000Z",
  })),
}));

vi.mock("@/lib/novel/foreshadowing-tracker", () => ({
  loadForeshadowingTracker: vi.fn(),
  createEmptyForeshadowingStore: vi.fn(() => ({
    items: [],
    lastUpdated: "2026-07-05T00:00:00.000Z",
  })),
}));

vi.mock("@/lib/novel/chapter-ingest", () => ({
  listSnapshots: vi.fn(() => Promise.resolve([])),
  loadSnapshot: vi.fn(),
}));

vi.mock("@/commands/fs", () => ({
  readFile: vi.fn(),
  fileExists: vi.fn(),
  writeFileAtomic: vi.fn(),
  createDirectory: vi.fn(),
}));

describe("loadReviewEvidence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("返回空真源当记忆中心没有任何派生数据", async () => {
    const { loadCognitionState } =
      await import("@/lib/novel/character-cognition");
    const { loadCharacterStates } = await import("@/lib/novel/character-state");
    const { loadForeshadowingTracker } =
      await import("@/lib/novel/foreshadowing-tracker");
    const { listSnapshots, loadSnapshot } =
      await import("@/lib/novel/chapter-ingest");
    vi.mocked(loadCognitionState).mockResolvedValueOnce(null);
    vi.mocked(loadCharacterStates).mockResolvedValueOnce({
      characters: [],
      lastUpdated: "",
    });
    vi.mocked(loadForeshadowingTracker).mockResolvedValueOnce({
      items: [],
      lastUpdated: "",
    });
    vi.mocked(listSnapshots).mockResolvedValueOnce([]);
    vi.mocked(loadSnapshot).mockResolvedValueOnce(null);

    const evidence = await loadReviewEvidence("/proj");
    expect(evidence.cognition).toBeNull();
    expect(evidence.characterStates.characters).toHaveLength(0);
    expect(evidence.foreshadowing.items).toHaveLength(0);
    expect(evidence.previousSnapshot).toBeNull();
    expect(evidence.internalConflict).toBe(false);
    expect(evidence.rawLoadError).toBe(false);
  });

  it("当全部读取成功时聚合返回", async () => {
    const { loadCognitionState } =
      await import("@/lib/novel/character-cognition");
    vi.mocked(loadCognitionState).mockResolvedValueOnce({
      characters: [{ character: "李雷", knows: ["暗杀计划"], doesNotKnow: [] }],
      readerKnows: [],
      lastUpdatedChapter: 3,
    });
    const evidence = await loadReviewEvidence("/proj");
    expect(evidence.cognition?.characters[0].character).toBe("李雷");
    expect(evidence.rawLoadError).toBe(false);
  });

  it("读取异常时 rawLoadError=true 但不抛出", async () => {
    const { loadCognitionState } =
      await import("@/lib/novel/character-cognition");
    vi.mocked(loadCognitionState).mockRejectedValueOnce(new Error("文件损坏"));
    const evidence = await loadReviewEvidence("/proj");
    expect(evidence.rawLoadError).toBe(true);
    expect(evidence.cognition).toBeNull();
  });
});
