import { describe, expect, it } from "vitest"
import { allChangelog, currentVersionChangelog } from "./changelog"

describe("changelog", () => {
  it("shows the latest feature release before the CI fix release", () => {
    const entries = allChangelog()
    const versions = entries.map((entry) => entry.version)

    expect(versions[0]).toBe("2.0.12")
    expect(versions[1]).toBe("2.0.11")
    expect(versions[2]).toBe("2.0.10")
    expect(versions[3]).toBe("2.0.9")
    expect(versions[4]).toBe("2.0.8")
    expect(versions[5]).toBe("2.0.7")
    expect(versions[6]).toBe("2.0.6")
    expect(versions[7]).toBe("2.0.5")
    expect(versions[8]).toBe("2.0.4")
    expect(versions[9]).toBe("2.0.3")
    expect(versions[10]).toBe("2.0.2")
    expect(versions[11]).toBe("2.0.1")
    expect(versions[12]).toBe("2.0.0")
    expect(versions).toContain("1.0.7")
    for (let patch = 8; patch <= 32; patch += 1) {
      expect(versions).not.toContain(`1.0.${patch}`)
    }

    const ciRelease = currentVersionChangelog("2.0.1")[0]
    expect(ciRelease.highlights.en.join("\n")).toContain("GitHub Actions CI")
    expect(ciRelease.highlights.en.join("\n")).toContain("PDFium")

    const release = currentVersionChangelog("2.0.0")[0]
    expect(release.highlights.en.join("\n")).toContain("Major release")
    expect(release.highlights.en.join("\n")).toContain("Review Center")
    expect(release.highlights.en.join("\n")).toContain("AI Rewrite")
  })

  it("returns the 2.0.12 changelog entry for the current version", () => {
    const release = currentVersionChangelog("2.0.12")[0]

    expect(release.version).toBe("2.0.12")
    expect(release.highlights.zh.join("\n")).toContain("4500 字")
    expect(release.highlights.zh.join("\n")).toContain("逐章生成")
    expect(release.highlights.zh.join("\n")).toContain("AI 审查")
    expect(release.highlights.zh.join("\n")).toContain("换行或空格差异")
  })
})
