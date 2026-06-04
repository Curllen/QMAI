import { describe, expect, it } from "vitest"
import { allChangelog, currentVersionChangelog } from "./changelog"

describe("changelog", () => {
  it("shows the consolidated 2.1.0 release before the 2.0.0 major release", () => {
    const entries = allChangelog()
    const versions = entries.map((entry) => entry.version)

    expect(versions[0]).toBe("2.1.0")
    expect(versions[1]).toBe("2.0.0")
    for (let patch = 1; patch <= 12; patch += 1) {
      expect(versions).not.toContain(`2.0.${patch}`)
      expect(currentVersionChangelog(`2.0.${patch}`)).toEqual([])
    }
    expect(versions).toContain("1.0.7")
    for (let patch = 8; patch <= 32; patch += 1) {
      expect(versions).not.toContain(`1.0.${patch}`)
    }

    const release = currentVersionChangelog("2.0.0")[0]
    expect(release.highlights.en.join("\n")).toContain("Major release")
    expect(release.highlights.en.join("\n")).toContain("Review Center")
    expect(release.highlights.en.join("\n")).toContain("AI Rewrite")
  })

  it("returns the 2.1.0 changelog entry for the current version", () => {
    const release = currentVersionChangelog("2.1.0")[0]
    const zh = release.highlights.zh.join("\n")

    expect(release.version).toBe("2.1.0")
    expect(zh).toContain("黄金三章")
    expect(zh).toContain("章节侧栏新增导入文件")
    expect(zh).toContain("4500 字")
    expect(zh).toContain("AI 审查")
    expect(zh).not.toContain("联系方式")
  })
})
