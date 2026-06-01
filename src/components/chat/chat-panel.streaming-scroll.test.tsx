// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@/i18n"
import { useChatStore } from "@/stores/chat-store"
import { useWikiStore } from "@/stores/wiki-store"
import { ChatPanel } from "./chat-panel"

const reactActEnv = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

vi.mock("./chat-shared", () => ({
  setLastQueryPages: vi.fn(),
  useSourceFiles: () => {},
}))

vi.mock("./chat-message", () => ({
  ChatMessage: ({ message }: { message: { content: string } }) => <div>{message.content}</div>,
  StreamingMessage: ({ content }: { content: string }) => <div>{content}</div>,
}))

vi.mock("./chat-input", () => ({
  ChatInput: () => <div data-testid="chat-input" />,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}))

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
  const container = host.querySelector("div.flex-1.overflow-y-auto.px-3.py-2")
  if (!(container instanceof HTMLDivElement)) {
    throw new Error("未找到 AI 会话滚动容器")
  }
  return container
}

let host: HTMLDivElement
let root: Root

describe("chat-panel streaming scroll", () => {
  beforeEach(() => {
    reactActEnv.IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)

    useChatStore.setState({
      conversations: [
        { id: "conv-1", title: "测试会话", createdAt: 1, updatedAt: 1, deAiMode: false },
      ],
      activeConversationId: "conv-1",
      messages: [
        { id: "msg-1", role: "user", content: "你好", timestamp: 1, conversationId: "conv-1" },
      ],
      isStreaming: true,
      streamingContent: "第一段输出",
      mode: "chat",
      ingestSource: null,
      maxHistoryMessages: 20,
    })

    useWikiStore.setState({
      project: null,
      novelMode: false,
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
      root.render(<ChatPanel />)
    })

    const container = getMessageContainer(host)
    const metrics = installScrollMetrics(container)

    act(() => {
      useChatStore.setState({ streamingContent: "第一段输出\n第二批 token" })
    })

    expect(metrics.getScrollTop()).toBe(1000)

    act(() => {
      metrics.setScrollTop(880)
      container.dispatchEvent(new Event("scroll"))
    })

    act(() => {
      useChatStore.setState({ streamingContent: "第一段输出\n第二批 token\n第三批 token" })
    })

    expect(metrics.getScrollTop()).toBe(880)
  })
})
