import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(resolve(__dirname, "outline-chat-panel.tsx"), "utf8")
const outlineSectionConfigsSource = readFileSync(resolve(__dirname, "../../lib/novel/outline-section-configs.ts"), "utf8")

describe("OutlineChatPanel controls", () => {
  it("uses the shared accent new conversation button style", () => {
    expect(source).toContain("qmai-new-conversation-button")
    expect(source).toContain('aria-label="新建大纲对话"')
    expect(source).not.toContain("border-emerald-300")
    expect(source).not.toContain("bg-emerald-50")
    expect(source).not.toContain("text-emerald-700")
  })

  it("uses the same top conversation/history split as AI chat", () => {
    expect(source).toContain("splitConversationToolbarItems")
    expect(source).toContain("topConversations")
    expect(source).toContain("historyConversations")
    expect(source).toContain("qmai-outline-history-button")
    expect(source).toContain('aria-label="大纲会话历史"')
    expect(source).not.toContain("conversations.map((conv) => (")
  })

  it("passes confirm and reject handlers into the outline tool workflow", () => {
    expect(source).toContain("handleConfirmToolSave")
    expect(source).toContain("handleRejectTool")
    expect(source).toContain("createWriteOutlineNodeTool")
    expect(source).toContain("onConfirmToolSave={handleConfirmToolSave}")
    expect(source).toContain("onRejectTool={handleRejectTool}")
    expect(source).toContain("onConfirmSave={onConfirmToolSave}")
    expect(source).toContain("onReject={onRejectTool}")
  })

  it("uses the shared reference input and picker for @ references", () => {
    expect(source).toContain("ReferenceInput")
    expect(source).toContain("ReferencePickerDialog")
    expect(source).toContain("InsertReferenceTokens")
    expect(source).toContain("outlineReferenceTokens")
    expect(source).toContain("onAtTrigger={() => setReferencePickerOpen(true)}")
    expect(source).toContain("onSubmit={handleSend}")
    expect(source).not.toContain("<ChatInput")
    expect(source).not.toContain('from "@/components/chat/chat-input"')
  })

  it("keeps dock controls before outline generation and model selection around the reference input", () => {
    expect(source).toContain("qmai-outline-bottom-left-controls")
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

  it("adds selected references to the outline agent request instead of only storing chips", () => {
    expect(source).toContain("buildOutlineAgentUserContent")
    expect(source).toContain("本条消息附带的 @ 引用")
    expect(source).toContain("请优先使用工具读取引用内容")
  })

  it("routes outline chat sends through AgentRunner with built-in tools", () => {
    expect(source).toContain("AgentRunner")
    expect(source).toContain("buildAgentConfig")
    expect(source).toContain("ToolRegistry")
    expect(source).toContain("read_outline")
    expect(source).toContain("read_chapter")
    expect(source).toContain("read_memory")
    expect(source).toContain("read_deduction")
    expect(source).not.toContain("runDeepOutlineGeneration(")
  })

  it("settles running outline tool calls when generation finishes", () => {
    expect(source).toContain("settleRunningAgentToolCalls")
    expect(source).toMatch(/settleRunningAgentToolCalls\(\s*record\.toolCalls\.length\s*\?\s*record\.toolCalls\s*:\s*message\.agentToolCalls/s)
    expect(source).toContain("historyPlan.showToolProcessOnError")
    expect(source).toContain("message.agentToolCalls?.length ? message.agentToolCalls : hiddenToolCalls")
  })

  it("uses an outline-only tool set that cannot write chapters or memory", () => {
    expect(source).toContain("OUTLINE_CHAT_DISABLED_TOOLS")
    expect(source).toContain('"write_chapter"')
    expect(source).toContain('"write_memory"')
    expect(source).toContain("disabledTools: OUTLINE_CHAT_DISABLED_TOOLS")
    expect(source).toContain("需要保存大纲时只能使用 write_outline_node")
    expect(source).toContain("核心事件不少于6条")
    expect(source).toContain("用户确认前不得生成完整文件")
  })

  it("后续普通追问复用 AI 大纲上下文并节流资料读取工具", () => {
    expect(source).toContain("planOutlineContextReuse")
    expect(source).toContain("planOutlineAgentHistory")
    expect(source).toContain("buildOutlineContextSummary")
    expect(source).toContain("contextDecision")
    expect(source).toContain("historyPlan")
    expect(source).toContain("contextDecision.instruction")
    expect(source).toContain("contextDecision.disabledTools")
    expect(source).toContain("contextDecision.sourceLabel")
    expect(source).toContain("historyPlan.messages")
    expect(source).toContain("hiddenToolCalls")
    expect(source).toContain("mergeDisabledTools")
  })

  it("提供 AI 大纲上下文状态、强制刷新和预算面板", () => {
    // 已删除上下文状态条，不再展示 "上下文状态" 和 "强制刷新上下文"
    // 改为在输入框之上展示 "正在生成..." 状态提示
    expect(source).not.toContain("上下文状态")
    expect(source).not.toContain("强制刷新上下文")
    expect(source).toContain("正在生成...")
    expect(source).toContain("isStreaming")
  })

  it("将 AI 大纲上下文摘要持久化到会话字段而不是组件内存缓存", () => {
    expect(source).toContain("contextSummary:")
    expect(source).toContain("buildOutlineContextSummary")
    // 上下文摘要已通过 setConversationContextSummary 持久化到会话字段
    expect(source).toContain("setConversationContextSummary")
    expect(source).not.toContain("contextSummaryByConversation")
    expect(source).not.toContain("setContextSummaryByConversation")
  })

  it("keeps outline reference chips as tool-readable hints instead of preloading file contents", () => {
    expect(source).toContain("buildOutlineAgentUserContent")
    expect(source).toContain("请优先使用工具读取引用内容")
    expect(source).not.toContain("loadReferenceTokenContext(tokens)")
  })

  it("renders sent @ references in outline chat user messages", () => {
    expect(source).toContain('import { ReferenceChip } from "@/components/reference/ReferenceChip"')
    expect(source).toContain("msg.attachedReferences")
    expect(source).toContain("<ReferenceChip")
    expect(source).toContain("readonly")
  })

  it("consumes outline reference tokens sent from the left outline tree", () => {
    expect(source).toContain("pendingReferenceTokens")
    expect(source).toContain("consumePendingReferenceTokens")
    expect(source).toContain("insertReferenceTokensRef.current?.(tokens)")
  })

  it("forces outline chat through a dedicated list-read-analyze-generate workflow", () => {
    expect(source).toContain("## AI大纲固定分析流程")
    expect(source).toContain("先调用 list_outlines、list_chapters、list_memories、list_deductions")
    expect(source).toContain("再调用 read_outline、read_chapter、read_memory、read_deduction")
    expect(source).toContain("分析冲突、缺口、伏笔、角色动机和章节承接")
    expect(source).toContain("最后再生成大纲建议")
  })

  it("routes every outline generation menu item through the PRD 3.1 content workflow", () => {
    expect(source).toContain("buildOutlineSectionGenerationPrompt")
    expect(source).toContain("## AI大纲生成工作流")
    expect(source).toContain("提取请求关键词")
    expect(source).toContain("识别用户意图")
    expect(source).toContain("提取对小说创作有用的关键内容")
    expect(source).toContain("结合用户要用的 skill + soul.md 约束")
    expect(source).toContain("最终回复只输出大纲标题和大纲正文")
    expect(source).toContain("禁止输出工具调用报告、分析过程、完成报告、下一步行动")

    for (const title of ["章节细纲", "人物小传", "组织势力设定", "力量体系", "金手指设定", "伏笔计划", "地点设定"]) {
      expect(outlineSectionConfigsSource).toContain(title)
    }
  })

  it("locks outline generation to the upgraded staged workflow standard", () => {
    expect(source).toContain("充分性闸门")
    expect(source).toContain("先卷后章")
    expect(source).toContain("卷节拍表")
    expect(source).toContain("卷时间线")
    expect(source).toContain("滚动章纲")
    expect(source).toContain("新增设定写回")
    expect(source).toContain("CBN")
    expect(source).toContain("CPNs")
    expect(source).toContain("CEN")
    expect(source).toContain("CEN 必须能承接下一章 CBN")
  })

  it("lets outline chat bubbles expand to half of the window without overflowing narrow panels", () => {
    expect(source).toContain("lg:max-w-[50vw]")
    expect(source).toContain("max-w-full")
    expect(source).not.toContain("max-w-[85%]")
  })

  it("在 AI 大纲输入框上方接入固定生成向导并发送结构化 Prompt", () => {
    expect(source).toContain('import { OutlineWizardDialog } from "@/components/sources/outline-wizard-dialog"')
    expect(source).toContain("import {")
    expect(source).toContain("buildOutlineWizardPrompt")
    expect(source).toContain("选择生成你想要的小说")
    expect(source).toContain("handleSubmitOutlineWizard")
    expect(source).toContain("buildOutlineWizardPrompt(request)")
    expect(source).toContain("disableWriteTools: true")
    expect(source).toContain("OUTLINE_CHAT_WIZARD_DISABLED_TOOLS")
    expect(source).toContain("<OutlineWizardDialog")
  })

  it("AI 大纲向导入口接入多 Agent 并行生成与单 Agent 回退提示", () => {
    expect(source).toContain("planOutlineSubAgents")
    expect(source).toContain("runOutlineMultiAgentWorkflow")
    expect(source).toContain("await runOutlineMultiAgentWorkflow({")
    expect(source).toContain("runSubAgent: async (subAgentPlan)")
    expect(source).toContain("runSingleAgentFallback")
    expect(source).toContain("mergeResults")
    expect(source).toContain("enableMultiAgent: true")
    expect(source).toContain("多 Agent 并行生成")
    expect(source).toContain("自动回退为单 Agent")
  })

  it("AI 大纲多 Agent 过程写入消息状态并渲染结构化面板", () => {
    expect(source).toContain('import { OutlineMultiAgentPanel } from "@/components/sources/outline-multi-agent-panel"')
    expect(source).toContain("multiAgentRun")
    expect(source).toContain("updateOutlineMultiAgentRun")
    expect(source).toContain("<OutlineMultiAgentPanel run={msg.multiAgentRun} />")
    expect(source).toContain("status: \"pending\"")
    expect(source).toContain("status: \"running\"")
    expect(source).toContain("status: \"merging\"")
    expect(source).toContain("fallbackReason")
  })

  it("子 Agent 结构化输出为空或解析失败时会自动重试一次", () => {
    expect(source).toContain("retrySubAgentMessages")
    expect(source).toContain("结构化输出解析失败")
    expect(source).toContain("请只重新输出一个合法 JSON 对象")
    expect(source).toContain("subAgentRetryRun")
  })

  it("keeps wizard prompt bubbles readable and stops streaming in the original conversation", () => {
    expect(source).toContain("streamingConversationIdRef")
    expect(source).toContain("streamingConversationIdRef.current = convId")
    expect(source).toContain("streamingConversationIdRef.current ?? activeConversationId")
    expect(source).toContain('className="block whitespace-pre-wrap break-words"')
  })

  it("saves AI outline results into the inferred outline category folder", () => {
    expect(source).toContain("classifyOutlineSaveTarget")
    expect(source).toContain("classification.targetFolder")
    expect(source).toContain("classification.fileName")
    expect(source).toContain("保存大纲文件")
    expect(source).toContain("summarizeChapterOutlineQuality")
    expect(source).toContain("formatChapterOutlineQualityReport")
    expect(source).toContain("includeWarnings: true")
  })

  it("auto-saves structured AI outline save requests from assistant output", () => {
    expect(source).toContain("parseOutlineSaveRequests")
    expect(source).toContain("formatOutlineSaveParseFeedback")
    expect(source).toContain("saveOutlineSaveRequests")
    expect(source).toContain("outlineSaveRequest")
    expect(source).toContain("已自动保存")
    expect(source).toContain("AI 大纲输出协议")
  })

  it("生成后对可保存大纲内容输出质量检查反馈并支持继续修订", () => {
    expect(source).toContain("buildOutlineGenerationQualityFeedback")
    expect(source).toContain("qualityFeedback")
    expect(source).toContain("生成后质量检查")
    expect(source).toContain("修订质量问题")
    expect(source).toContain("repairPrompt")
  })

  it("uses save confirm dialog for classified outline saves", () => {
    expect(source).toContain("OutlineSaveConfirmDialog")
    expect(source).toContain("extractCharacterSaveDrafts")
    expect(source).toContain("classifyOutlineSaveTarget")
    expect(source).toContain("characterDraftsToSaveRequests")
    expect(source).toContain("splitConfirmRequiredSaveRequests")
  })

  it("does not silently auto-save character requests without confirmation", () => {
    expect(source).toContain("confirmRequired")
    expect(source).toContain("请确认要保存的人物角色")
  })

  it("keeps a confirmation fallback when character extraction fails", () => {
    expect(source).toContain("buildFallbackCharacterDraftsFromRequests")
    expect(source).toContain("无法自动拆分角色")
  })
})
