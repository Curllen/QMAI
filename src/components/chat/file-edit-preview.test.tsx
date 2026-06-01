// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FileEditPreview } from "./file-edit-preview"

const reactActEnv = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

let host: HTMLDivElement
let root: Root

describe("file-edit-preview", () => {
  beforeEach(() => {
    reactActEnv.IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    host.remove()
    delete reactActEnv.IS_REACT_ACT_ENVIRONMENT
    vi.restoreAllMocks()
  })

  it("edits 在流式过程中从 1 条增长到多条时会完整同步显示", () => {
    const onApply = vi.fn().mockResolvedValue([])
    const firstEdits = [
      { filePath: "wiki/outlines/a.md", search: "旧名称A", replace: "新名称A" },
    ]
    const secondEdits = [
      ...firstEdits,
      { filePath: "wiki/outlines/b.md", search: "旧名称B", replace: "新名称B" },
    ]

    act(() => {
      root.render(
        <FileEditPreview
          edits={firstEdits}
          onApply={onApply}
          onDismiss={() => {}}
        />,
      )
    })

    expect(host.textContent).toContain("wiki/outlines/a.md")
    expect(host.textContent).not.toContain("wiki/outlines/b.md")

    act(() => {
      root.render(
        <FileEditPreview
          edits={secondEdits}
          onApply={onApply}
          onDismiss={() => {}}
        />,
      )
    })

    expect(host.textContent).toContain("wiki/outlines/a.md")
    expect(host.textContent).toContain("wiki/outlines/b.md")
    expect(Array.from(host.querySelectorAll("button")).filter((button) => button.textContent?.trim() === "应用")).toHaveLength(2)
  })
})
