// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@/i18n"
import { useWikiStore } from "@/stores/wiki-store"
import { useOutlineChatStore } from "@/stores/outline-chat-store"
import { OutlineChatPanel } from "./outline-chat-panel"

const reactActEnv = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

vi.mock("@/commands/fs", () => ({
  createDirectory: vi.fn(),
  fileExists: vi.fn(),
  listDirectory: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}))

function installScrollMetrics(container: HTMLDivElement, scrollHeight = 1000, clientHeight = 100, initialScrollTop = scrollHeight) {
  let currentScrollTop = initialScrollTop

  Object.defineProperty(container, "scrollHeight", {
    configurable: true,
    get: () => scrollHeight,
  })

  Object.defineProperty(container, "clientHeight", {
    configurable: true,
    get: () => clientHeight,
  })

  Object.defineProperty(container, "scrollTop", {
    configurable: true,
    get: () => currentScrollTop,
    set: (value: number) => {
      currentScrollTop = value
    },
  })

  return {
    getScrollTop: () => currentScrollTop,
    setScrollTop: (value: number) => {
      currentScrollTop = value
    },
  }
}

function getMessageContainer(host: HTMLDivElement): HTMLDivElement {
  const container = host.querySelector("div.flex-1.overflow-y-auto.px-3.py-2.space-y-3")
  if (!(container instanceof HTMLDivElement)) {
    throw new Error("未找到大纲会话滚动容器")
  }
  return container
}

let host: HTMLDivElement
let root: Root

describe("outline-chat-panel streaming scroll", () => {
  beforeEach(() => {
    reactActEnv.IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)

    useOutlineChatStore.setState({
      conversations: [
        {
          id: "outline-conv-1",
          title: "测试大纲会话",
          createdAt: 1,
          messages: [{ id: "msg-1", role: "user", content: "请继续生成大纲" }],
        },
      ],
      activeConversationId: "outline-conv-1",
      streamingContent: "第一段输出",
      isStreaming: true,
      loaded: true,
    })

    useWikiStore.setState({
      project: null,
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    host.remove()
    delete reactActEnv.IS_REACT_ACT_ENVIRONMENT
    vi.restoreAllMocks()
  })

  it("流式生成时，用户轻微上滑后不会被下一批 token 强制拉回底部", () => {
    act(() => {
      root.render(<OutlineChatPanel onClose={() => {}} />)
    })

    const container = getMessageContainer(host)
    const metrics = installScrollMetrics(container)

    act(() => {
      useOutlineChatStore.setState({ streamingContent: "第一段输出\n第二批 token" })
    })

    expect(metrics.getScrollTop()).toBe(1000)

    act(() => {
      metrics.setScrollTop(880)
      container.dispatchEvent(new Event("scroll"))
    })

    act(() => {
      useOutlineChatStore.setState({ streamingContent: "第一段输出\n第二批 token\n第三批 token" })
    })

    expect(metrics.getScrollTop()).toBe(880)
  })
})
