import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(resolve(__dirname, "outline-chat-panel.tsx"), "utf8")

describe("OutlineChatPanel controls", () => {
  it("uses the shared accent new conversation button style", () => {
    expect(source).toContain("qmai-new-conversation-button")
    expect(source).toContain('aria-label="新建大纲对话"')
    expect(source).not.toContain("border-emerald-300")
    expect(source).not.toContain("bg-emerald-50")
    expect(source).not.toContain("text-emerald-700")
  })

  it("moves dock controls into the bottom left toolbar before outline generation and model selection", () => {
    expect(source).toContain("bottomLeftControls={")
    expect(source).toContain("qmai-outline-bottom-left-controls")
    expect(source).not.toContain("leftControls={")
    expect(source).toContain("<ChatDockControls />")
    expect(source).toContain("<OutlineGenerationMenu")
    expect(source).toContain("<ChatModelSelector")

    const dockIndex = source.indexOf("<ChatDockControls />")
    const outlineIndex = source.indexOf("<OutlineGenerationMenu")
    const modelIndex = source.indexOf("<ChatModelSelector")

    expect(dockIndex).toBeGreaterThan(-1)
    expect(outlineIndex).toBeGreaterThan(dockIndex)
    expect(modelIndex).toBeGreaterThan(outlineIndex)
  })

  it("renders outline generation from an icon button and keeps the menu backed by existing configs", () => {
    expect(source).toContain("ListPlus")
    expect(source).toContain('aria-label="生成大纲模块"')
    expect(source).toContain("qmai-outline-generation-menu")
    expect(source).toContain('className="qmai-outline-generation-menu fixed')
    expect(source).toContain("OUTLINE_SECTION_GENERATION_CONFIGS.map")
    expect(source).toContain("onGenerate(config.title, config.requestHint)")
    expect(source).toContain("onGenerate={handleGenerateSection}")
  })
})
