import type { Tool } from "../types"
import { readFile, writeFile } from "@/commands/fs"

export function createWriteOutlineNodeTool(outlinesDir: string): Tool {
  return {
    name: "write_outline_node",
    description: "写入或更新大纲节点内容。参数 outlineName 为大纲文件名，nodeTitle 为节点标题，nodeContent 为节点内容。将追加或更新对应节点。",
    category: "write",
    permission: "confirm",
    parameters: {
      outlineName: { type: "string", description: "大纲文件名称", required: true },
      nodeTitle: { type: "string", description: "节点标题", required: true },
      nodeContent: { type: "string", description: "节点内容", required: true },
    },
    execute: async (params) => {
      const outlineName = params.outlineName as string
      const nodeTitle = params.nodeTitle as string
      const nodeContent = params.nodeContent as string
      const path = `${outlinesDir}/${outlineName}`
      const content = `## ${nodeTitle}\n\n${nodeContent}\n`
      try {
        await writeFile(path, content)
        const verified = await readFile(path)
        if (verified !== content) {
          return `已写入大纲节点「${nodeTitle}」到「${outlineName}」，警告：写入后读回验证失败，请手动检查文件内容。`
        }
        return `已写入大纲节点「${nodeTitle}」到「${outlineName}」，读回验证通过。`
      } catch (err) {
        return `错误：写入大纲失败 — ${err instanceof Error ? err.message : String(err)}`
      }
    },
  }
}
