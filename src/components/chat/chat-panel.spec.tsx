import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(resolve(__dirname, "chat-panel.tsx"), "utf8")

describe("chat-panel de-AI skill handling", () => {
  it("loads the chat de-AI skill safely and surfaces a warning without aborting send", () => {
    expect(source).toContain("loadEffectiveDeAiSkillSafely")
    expect(source).toContain("deAiSkillWarning")
    expect(source).toContain("deAiSkillWarningMessage")
    expect(source).toContain("setDeAiSkillWarningMessage(deAiSkillWarning)")
    expect(source).not.toContain("setChapterSaveStatus(deAiSkillWarning)")
  })

  it("uses an icon-only de-AI skill trigger in the chat input toolbar", () => {
    expect(source).toContain("<DeAiSkillPicker")
    expect(source).toContain("iconOnly")
  })

  it("uses an icon-only accent new conversation button", () => {
    expect(source).toContain("qmai-new-conversation-button")
    expect(source).toContain('aria-label={t(novelMode ? "novel.chat.newChat" : "chat.newChat")}')
    expect(source).not.toContain('          {t(novelMode ? "novel.chat.newChat" : "chat.newChat")}')
  })
})
