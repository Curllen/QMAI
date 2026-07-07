import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(__dirname, "../../..")
const visualStyleSource = readFileSync(resolve(root, "src/lib/visual-style-settings.ts"), "utf8")
const interfaceSectionSource = readFileSync(resolve(__dirname, "sections/interface-section.tsx"), "utf8")
const settingsViewSource = readFileSync(resolve(__dirname, "settings-view.tsx"), "utf8")
const appLayoutSource = readFileSync(resolve(root, "src/components/layout/app-layout.tsx"), "utf8")
const indexCssSource = readFileSync(resolve(root, "src/index.css"), "utf8")

describe("settings visual refresh style", () => {
  it("registers the compact square visual style as a selectable interface style", () => {
    expect(visualStyleSource).toContain('| "fangzheng"')
    expect(visualStyleSource).toContain('fangzheng: "visual-fangzheng"')
    expect(visualStyleSource).toContain("VISUAL_STYLE_STORAGE_VERSION")
    expect(visualStyleSource).toContain("resolveStoredVisualStyle")
    expect(visualStyleSource).toContain('"fangzheng"')
    expect(interfaceSectionSource).toContain('value: "fangzheng"')
    expect(interfaceSectionSource).toContain("直角工具型")
    expect(interfaceSectionSource).toContain("无圆角")
  })

  it("defines light and dark tokens with no rounded corners for the compact style", () => {
    expect(indexCssSource).toContain(":root.visual-fangzheng")
    expect(indexCssSource).toContain(".visual-fangzheng.dark")
    expect(indexCssSource).toContain("--radius: 0px")
    expect(indexCssSource).toContain(".visual-fangzheng *")
    expect(indexCssSource).toContain("--primary:")
    expect(indexCssSource).toContain("--sidebar-accent:")
    expect(indexCssSource).toContain("--sidebar-primary:")
    expect(indexCssSource).toContain("--popover:")
    expect(indexCssSource).toContain('.visual-fangzheng [role="listbox"]')
    expect(indexCssSource).toContain('.visual-fangzheng [role="option"][aria-selected="true"]')
    expect(indexCssSource).not.toContain(":root.visual-fangzheng {\n    --radius: 0px;\n    --background: #dde5f0")
    expect(indexCssSource).not.toContain(".visual-fangzheng.dark {\n    --radius: 0px;\n    --background: #1a1f35")
  })

  it("keeps settings navigation bound to the active visual style tokens", () => {
    expect(settingsViewSource).toContain("bg-sidebar")
    expect(settingsViewSource).toContain("text-sidebar-foreground")
    expect(settingsViewSource).toContain("border-sidebar-border")
    expect(settingsViewSource).toContain("bg-sidebar-accent")
    expect(settingsViewSource).not.toContain("bg-brand-50/60")
    expect(settingsViewSource).not.toContain("ring-1 ring-border/70")
  })

  it("uses softer tokenized selection and divider styling instead of hard fixed outlines", () => {
    expect(indexCssSource).not.toContain("rgba(62, 107, 88")
    expect(indexCssSource).not.toContain("border-left: 2px solid #c8a96e")
    expect(indexCssSource).not.toContain("border-left: 2px solid #d9c69a")
    expect(indexCssSource).not.toContain("box-shadow: inset 0 0 0 1px var(--primary)")
    expect(indexCssSource).toContain("background: color-mix(in oklch, var(--sidebar-accent)")
    expect(appLayoutSource).toContain("w-1 shrink-0 cursor-col-resize bg-border/20")
    expect(appLayoutSource).not.toContain("w-2 shrink-0 cursor-col-resize bg-border/40")
  })
})
