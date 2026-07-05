import { describe, it, expect } from "vitest"
import {
  computeContextBudget,
  computeNovelContextTokenBudget,
  contextScaleForLanguage,
} from "./context-budget"

// The base-math tests pin langScale=1 so they stay deterministic
// regardless of the active UI language (the app defaults to zh).
describe("computeContextBudget", () => {
  it("falls back to the 200K-char default for falsy input", () => {
    expect(computeContextBudget(undefined, 1).maxCtx).toBe(204_800)
    expect(computeContextBudget(0, 1).maxCtx).toBe(204_800)
    expect(computeContextBudget(Number.NaN, 1).maxCtx).toBe(204_800)
  })

  it("allocates fractional sub-budgets from the window", () => {
    const b = computeContextBudget(200_000, 1)
    expect(b.responseReserve).toBe(30_000)
    expect(b.indexBudget).toBe(10_000)
    expect(b.pageBudget).toBe(100_000)
  })
})

describe("contextScaleForLanguage", () => {
  it("keeps scale 1 for English and other non-CJK languages", () => {
    expect(contextScaleForLanguage("en")).toBe(1)
    expect(contextScaleForLanguage("en-US")).toBe(1)
    expect(contextScaleForLanguage("fr")).toBe(1)
  })

  it("falls back to the active UI language when none is given", () => {
    // Test env initialises i18n to zh, so the implicit lookup is CJK-scaled.
    expect(contextScaleForLanguage()).toBeCloseTo(0.425, 5)
  })

  it("shrinks the window for CJK languages", () => {
    expect(contextScaleForLanguage("zh")).toBeCloseTo(0.425, 5)
    expect(contextScaleForLanguage("zh-CN")).toBeCloseTo(0.425, 5)
    expect(contextScaleForLanguage("ja")).toBeCloseTo(0.425, 5)
    expect(contextScaleForLanguage("ko")).toBeCloseTo(0.425, 5)
  })
})

describe("computeContextBudget language scaling", () => {
  it("scales the effective window down for CJK UIs", () => {
    const zh = contextScaleForLanguage("zh")
    expect(computeContextBudget(200_000, zh).maxCtx).toBe(85_000)
    expect(computeContextBudget(204_800, zh).maxCtx).toBe(87_040)
  })

  it("leaves English windows untouched", () => {
    expect(computeContextBudget(200_000, contextScaleForLanguage("en")).maxCtx).toBe(200_000)
  })
})

describe("computeNovelContextTokenBudget", () => {
  it("preserves the legacy 32K-token deep-chapter budget on the default window", () => {
    // Default window (204800 chars) → cap 33280 tokens, so 32000 is kept intact.
    expect(computeNovelContextTokenBudget(204_800, 32_000, 1)).toBe(32_000)
    expect(computeNovelContextTokenBudget(undefined, 32_000, 1)).toBe(32_000)
  })

  it("caps an unset (0 / unlimited) budget at the window-derived ceiling", () => {
    expect(computeNovelContextTokenBudget(204_800, 0, 1)).toBe(33_280)
    expect(computeNovelContextTokenBudget(204_800, undefined, 1)).toBe(33_280)
  })

  it("clamps an over-large user budget down to the ceiling", () => {
    expect(computeNovelContextTokenBudget(204_800, 100_000, 1)).toBe(33_280)
  })

  it("shrinks the budget proportionally for small windows", () => {
    // 32000 chars → floor(32000 * 0.65 / 4) = 5200 tokens.
    expect(computeNovelContextTokenBudget(32_000, 32_000, 1)).toBe(5_200)
  })

  it("never drops below the token floor", () => {
    expect(computeNovelContextTokenBudget(1_000, 0, 1)).toBe(4_000)
  })

  it("tightens the ceiling for CJK UIs so the same request is capped down", () => {
    // zh: maxCtx 204800*0.425=87040 → cap floor(87040*0.65/4)=14144 tokens.
    const zh = contextScaleForLanguage("zh")
    expect(computeNovelContextTokenBudget(204_800, 32_000, zh)).toBe(14_144)
    expect(computeNovelContextTokenBudget(204_800, 0, zh)).toBe(14_144)
  })
})
