// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useWikiStore } from "@/stores/wiki-store"
import { SkillLibraryView } from "./skill-library-view"

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const readFileMock = vi.hoisted(() => vi.fn())
const writeFileMock = vi.hoisted(() => vi.fn())
const joinMock = vi.hoisted(() => vi.fn(async (...parts: string[]) => parts.join("/")))

vi.mock("@/commands/fs", () => ({
  readFile: readFileMock,
  writeFile: writeFileMock,
}))

vi.mock("@tauri-apps/api/path", () => ({
  join: joinMock,
}))

async function renderView() {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<SkillLibraryView />)
  })
  return { container, root }
}

function cleanup(root: Root, container: HTMLElement) {
  act(() => root.unmount())
  document.body.removeChild(container)
}

describe("SkillLibraryView", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    readFileMock.mockRejectedValue(new Error("missing"))
    useWikiStore.getState().setProject({
      id: "p1",
      name: "测试项目",
      path: "C:/project",
    })
  })

  it("renders built-in skills and selected detail editor", async () => {
    const { container, root } = await renderView()

    expect(container.querySelector('[data-testid="skill-library-view"]')).not.toBeNull()
    expect(container.textContent).toContain("综合去AI味")
    expect(container.querySelector<HTMLInputElement>('[data-testid="skill-name-input"]')?.value).toBe("综合去AI味")

    cleanup(root, container)
  })

  it("prevents saving an empty project skill name", async () => {
    const { container, root } = await renderView()
    const copyButton = container.querySelector<HTMLButtonElement>('[data-testid="skill-copy-button"]')
    expect(copyButton).not.toBeNull()

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    writeFileMock.mockClear()

    const nameInput = container.querySelector<HTMLInputElement>('[data-testid="skill-name-input"]')
    expect(nameInput).not.toBeNull()

    await act(async () => {
      if (!nameInput) return
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
      valueSetter?.call(nameInput, "")
      nameInput.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }))
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="skill-save-button"]')?.click()
    })

    expect(container.textContent).toContain("技能名称不能为空")
    expect(writeFileMock).not.toHaveBeenCalled()

    cleanup(root, container)
  })
})
