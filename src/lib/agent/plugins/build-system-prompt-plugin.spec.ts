import { describe, expect, it } from "vitest"
import { createBuildSystemPromptPlugin } from "./build-system-prompt-plugin"
import { normalizeUserSkill } from "@/lib/novel/skill-library"

describe("BuildSystemPromptPlugin selected skills", () => {
  it("injects selected skill prompt before final model execution", async () => {
    const plugin = createBuildSystemPromptPlugin({
      baseSystemPrompt: "base prompt",
      buildTaskDirectiveFn: () => "task directive",
    })

    const result = await plugin.run({
      userMessage: "帮我写下一章",
      projectPath: "/project",
      agentConfig: {} as any,
      novelMode: true,
      novelSystemPrompt: "context prompt",
      taskRoute: { intent: "write_chapter", confidence: 0.9, extractedParams: {} },
      selectedSkills: [
        normalizeUserSkill({
          id: "three-four",
          name: "三翻四抖",
          kind: ["structure"],
          stages: ["drafting"],
          modes: ["standard"],
          content: "三次转折，四次震惊。",
          source: "project",
        }),
      ],
    })

    expect(result.finalSystemPrompt).toContain("base prompt")
    expect(result.finalSystemPrompt).toContain("context prompt")
    expect(result.finalSystemPrompt).toContain("本次启用 Skill")
    expect(result.finalSystemPrompt).toContain("三翻四抖")
    expect(result.finalSystemPrompt).toContain("三次转折，四次震惊。")
    expect(result.finalSystemPrompt).toContain("task directive")
  })

  it("does not inject chapter plan protocol from standard mode unless Plan Execute is enabled", async () => {
    const plugin = createBuildSystemPromptPlugin({
      baseSystemPrompt: "base prompt",
      buildTaskDirectiveFn: () => "task directive",
    })

    const result = await plugin.run({
      userMessage: "帮我写下一章",
      projectPath: "/project",
      agentConfig: {} as any,
      novelMode: true,
      aiWorkflowMode: "standard",
      planExecuteEnabled: false,
      taskRoute: { intent: "write_chapter", confidence: 0.9, extractedParams: {} },
    })

    expect(result.finalSystemPrompt).not.toContain("章节创作计划协议")
    expect(result.finalSystemPrompt).not.toContain("chapter_plan")
  })

  it("injects chapter plan protocol when Plan Execute is enabled with standard mode", async () => {
    const plugin = createBuildSystemPromptPlugin({
      baseSystemPrompt: "base prompt",
      buildTaskDirectiveFn: () => "task directive",
    })

    const result = await plugin.run({
      userMessage: "帮我写下一章",
      projectPath: "/project",
      agentConfig: {} as any,
      novelMode: true,
      aiWorkflowMode: "standard",
      planExecuteEnabled: true,
      taskRoute: { intent: "write_chapter", confidence: 0.9, extractedParams: {} },
    })

    expect(result.finalSystemPrompt).toContain("章节创作计划协议")
    expect(result.finalSystemPrompt).toContain("chapter_plan")
    expect(result.finalSystemPrompt).toContain("章节计划")
    expect(result.finalSystemPrompt).not.toContain("章节蓝图")
    expect(result.finalSystemPrompt).toContain("维度一·输入校验")
    expect(result.finalSystemPrompt).toContain("维度四·场景序列编排（计划核心）")
    expect(result.finalSystemPrompt).toContain("维度七·节奏、字数与结尾钩子")
    expect(result.finalSystemPrompt).toContain("爽点/期待点设计")
    expect(result.finalSystemPrompt).toContain("场景戏剧功能")
    expect(result.finalSystemPrompt).toContain("对话目标")
    expect(result.finalSystemPrompt).toContain("开头与结尾")
    expect(result.finalSystemPrompt).toContain("S1/S2/S3")
    expect(result.finalSystemPrompt).toContain("必须执行")
    expect(result.finalSystemPrompt).toContain("禁止违背")
    expect(result.finalSystemPrompt).toContain("可自由发挥")
    expect(result.finalSystemPrompt).toContain("planBlueprint")
    const finalPrompt = result.finalSystemPrompt ?? ""
    expect(finalPrompt.length).toBeLessThan(3000)
  })
})
