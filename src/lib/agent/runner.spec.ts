import { describe, expect, it, vi, beforeEach } from "vitest"
import { AgentRunner } from "./runner"
import { ToolRegistry } from "./registry"
import type { AgentConfig, AgentMessage } from "./types"
import type { Tool } from "./types"
import type { StreamCallbacks } from "../llm-client"
import type { LlmConfig } from "@/stores/wiki-store"

const mockLlmConfig: LlmConfig = {
  provider: "openai",
  apiKey: "",
  model: "test",
  ollamaUrl: "",
  customEndpoint: "",
  maxContextSize: 8192,
}

// Mock streamChat
const mockStreamChat = vi.fn()
vi.mock("../llm-client", () => ({
  streamChat: (...args: unknown[]) => mockStreamChat(...args),
}))

describe("AgentRunner", () => {
  let runner: AgentRunner
  let registry: ToolRegistry

  const systemMsg: AgentMessage = { role: "system", content: "You are helpful" }
  const userMsg: AgentMessage = { role: "user", content: "Hello" }

  beforeEach(() => {
    runner = new AgentRunner()
    registry = new ToolRegistry()
    mockStreamChat.mockReset()
  })

  it("returns final text when LLM responds without tool calls", async () => {
    mockStreamChat.mockImplementation(async (_config: unknown, _msgs: unknown[], cb: StreamCallbacks) => {
      for (const char of "Hello user!") {
        cb.onToken(char)
      }
      cb.onDone()
    })
    const callbacks = {
      onText: vi.fn(),
      onToolCall: vi.fn(),
      onToolResult: vi.fn(),
      onToolError: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    }
    const config: AgentConfig = { maxRounds: 3, tools: [], systemPrompt: "You are helpful", llmConfig: mockLlmConfig }
    const result = await runner.run(config, registry, [systemMsg, userMsg], callbacks, undefined)
    expect(result.finalText).toBe("Hello user!")
    expect(result.roundsUsed).toBe(1)
    expect(callbacks.onDone).toHaveBeenCalledOnce()
    expect(callbacks.onError).not.toHaveBeenCalled()
  })

  it("executes tool calls and continues the loop", async () => {
    const tool: Tool = {
      name: "read_chapter",
      description: "read",
      category: "read",
      parameters: { name: { type: "string", description: "name" } },
      execute: vi.fn().mockResolvedValue("Chapter content"),
    }
    registry.register(tool)

    // Round 1: tool call
    // Round 2: final text
    let callCount = 0
    mockStreamChat.mockImplementation(async (_config: unknown, _msgs: unknown[], cb: StreamCallbacks) => {
      callCount++
      if (callCount === 1) {
        cb.onToolCallDelta?.({ index: 0, id: "call_1", name: "read_chapter" })
        cb.onToolCallDelta?.({ index: 0, arguments: '{"name":"ch1"}' })
        cb.onDone()
      } else {
        cb.onToken("G")
        cb.onToken("ot it!")
        cb.onDone()
      }
    })

    const callbacks = {
      onText: vi.fn(),
      onToolCall: vi.fn(),
      onToolResult: vi.fn(),
      onToolError: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    }

    const config: AgentConfig = { maxRounds: 3, tools: [tool], systemPrompt: "You are helpful", llmConfig: mockLlmConfig }
    const result = await runner.run(config, registry, [systemMsg, userMsg], callbacks, undefined)

    expect(tool.execute).toHaveBeenCalledWith({ name: "ch1" }, undefined)
    expect(callbacks.onToolCall).toHaveBeenCalledOnce()
    expect(callbacks.onToolResult).toHaveBeenCalledOnce()
    expect(result.finalText).toBe("Got it!")
    expect(result.roundsUsed).toBe(2)
  })

  it("does not stream assistant narration from tool-call rounds", async () => {
    const tool: Tool = {
      name: "read_chapter",
      description: "read",
      category: "read",
      parameters: { name: { type: "string", description: "name" } },
      execute: vi.fn().mockResolvedValue("Chapter content"),
    }
    registry.register(tool)

    let callCount = 0
    mockStreamChat.mockImplementation(async (_config: unknown, _msgs: unknown[], cb: StreamCallbacks) => {
      callCount++
      if (callCount === 1) {
        cb.onToken("我先读取上一章。")
        cb.onToolCallDelta?.({ index: 0, id: "call_1", name: "read_chapter" })
        cb.onToolCallDelta?.({ index: 0, arguments: '{"name":"ch1"}' })
        cb.onDone()
      } else {
        cb.onToken("章节正文")
        cb.onDone()
      }
    })

    const callbacks = {
      onText: vi.fn(),
      onToolCall: vi.fn(),
      onToolResult: vi.fn(),
      onToolError: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    }

    const config: AgentConfig = { maxRounds: 3, tools: [tool], systemPrompt: "You are helpful", llmConfig: mockLlmConfig }
    const result = await runner.run(config, registry, [systemMsg, userMsg], callbacks, undefined)

    expect(callbacks.onText).toHaveBeenCalledTimes(1)
    expect(callbacks.onText).toHaveBeenCalledWith("章节正文")
    expect(result.finalText).toBe("章节正文")
  })

  it("stops after maxRounds exceeded", async () => {
    // Always return tool calls
    mockStreamChat.mockImplementation(async (_config: unknown, _msgs: unknown[], cb: StreamCallbacks) => {
      cb.onToolCallDelta?.({ index: 0, id: "call_1", name: "read_chapter" })
      cb.onToolCallDelta?.({ index: 0, arguments: "{}" })
      cb.onDone()
    })

    const tool: Tool = {
      name: "read_chapter",
      description: "",
      category: "read",
      parameters: {},
      execute: vi.fn().mockResolvedValue("ok"),
    }
    registry.register(tool)

    const onError = vi.fn()
    const config: AgentConfig = { maxRounds: 2, tools: [tool], systemPrompt: "", llmConfig: mockLlmConfig }
    await runner.run(config, registry, [systemMsg, userMsg], { onText: vi.fn(), onToolCall: vi.fn(), onToolResult: vi.fn(), onToolError: vi.fn(), onDone: vi.fn(), onError }, undefined)

    expect(onError).toHaveBeenCalled()
    expect(onError.mock.calls[0][0].message).toContain("轮次")
  })

  it("reports tool execution errors via onToolError", async () => {
    const tool: Tool = {
      name: "bad_tool",
      description: "",
      category: "read",
      parameters: {},
      execute: vi.fn().mockRejectedValue(new Error("execution failed")),
    }
    registry.register(tool)

    let callCount = 0
    mockStreamChat.mockImplementation(async (_config: unknown, _msgs: unknown[], cb: StreamCallbacks) => {
      callCount++
      if (callCount === 1) {
        cb.onToolCallDelta?.({ index: 0, id: "c1", name: "bad_tool" })
        cb.onToolCallDelta?.({ index: 0, arguments: "{}" })
        cb.onDone()
      } else {
        cb.onToken("ok")
        cb.onDone()
      }
    })

    const onToolError = vi.fn()
    const config: AgentConfig = { maxRounds: 3, tools: [tool], systemPrompt: "", llmConfig: mockLlmConfig }
    await runner.run(config, registry, [systemMsg, userMsg], { onText: vi.fn(), onToolCall: vi.fn(), onToolResult: vi.fn(), onToolError, onDone: vi.fn(), onError: vi.fn() }, undefined)

    expect(onToolError).toHaveBeenCalledOnce()
  })

  it("does not execute confirm-required write tools without approval", async () => {
    const tool: Tool = {
      name: "write_chapter",
      description: "",
      category: "write",
      permission: "confirm",
      parameters: {},
      execute: vi.fn().mockResolvedValue("written"),
    }
    registry.register(tool)

    let callCount = 0
    mockStreamChat.mockImplementation(async (_config: unknown, messages: AgentMessage[], cb: StreamCallbacks) => {
      callCount++
      if (callCount === 1) {
        cb.onToolCallDelta?.({ index: 0, id: "write_1", name: "write_chapter" })
        cb.onToolCallDelta?.({ index: 0, arguments: '{"name":"第1章","content":"正文"}' })
        cb.onDone()
      } else {
        expect(messages[messages.length - 1].content).toContain("需要用户确认")
        cb.onToken("已生成写入预览，等待确认。")
        cb.onDone()
      }
    })

    const onToolEvent = vi.fn()
    const config: AgentConfig = { maxRounds: 3, tools: [tool], systemPrompt: "", llmConfig: mockLlmConfig }
    const result = await runner.run(
      config,
      registry,
      [systemMsg, userMsg],
      {
        onText: vi.fn(),
        onToolCall: vi.fn(),
        onToolResult: vi.fn(),
        onToolError: vi.fn(),
        onToolEvent,
        onDone: vi.fn(),
        onError: vi.fn(),
      },
      undefined,
    )

    expect(tool.execute).not.toHaveBeenCalled()
    expect(result.toolCalls[0].status).toBe("approval_required")
    expect(onToolEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "approval_required", callId: "write_1" }))
  })

  it("keeps full tool result in record but sends compressed result back to the model", async () => {
    const longResult = `${"开头".repeat(2000)}\n中间内容\n${"结尾".repeat(2000)}`
    const tool: Tool = {
      name: "read_chapter",
      description: "read",
      category: "read",
      parameters: {},
      execute: vi.fn().mockResolvedValue(longResult),
    }
    registry.register(tool)

    let compressedToolMessage = ""
    let callCount = 0
    mockStreamChat.mockImplementation(async (_config: unknown, messages: AgentMessage[], cb: StreamCallbacks) => {
      callCount++
      if (callCount === 1) {
        cb.onToolCallDelta?.({ index: 0, id: "read_1", name: "read_chapter" })
        cb.onToolCallDelta?.({ index: 0, arguments: "{}" })
        cb.onDone()
      } else {
        compressedToolMessage = String(messages[messages.length - 1].content)
        cb.onToken("已分析")
        cb.onDone()
      }
    })

    const config: AgentConfig = {
      maxRounds: 3,
      tools: [tool],
      systemPrompt: "",
      llmConfig: mockLlmConfig,
      toolResultContextLimit: 1200,
    }
    const result = await runner.run(
      config,
      registry,
      [systemMsg, userMsg],
      { onText: vi.fn(), onToolCall: vi.fn(), onToolResult: vi.fn(), onToolError: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
      undefined,
    )

    expect(result.toolCalls[0].result).toBe(longResult)
    expect(compressedToolMessage.length).toBeLessThan(longResult.length)
    expect(compressedToolMessage).toContain("已压缩给模型使用")
    expect(compressedToolMessage).toContain("开头")
    expect(compressedToolMessage).toContain("结尾")
  })
})
