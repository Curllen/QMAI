import { parseFrontmatter } from "./frontmatter"

export interface OutlineSaveDraft {
  title: string
  content: string
}

const DEFAULT_TITLE_PREFIX = "AI大纲"

export function prepareOutlineSaveDraft(content: string, existingTitles: string[]): OutlineSaveDraft {
  const parsed = parseFrontmatter(content)
  const body = normalizeOutlineMarkdown(parsed.body).trim()
  const baseTitle = sanitizeOutlineTitle(extractOutlineTitle(body))
  const title = makeDistinctOutlineTitle(baseTitle, existingTitles)
  return { title, content: body }
}

function looksLikeHeading(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed.length < 2 || trimmed.length > 50) return false
  if (/^#{1,6}\s/.test(trimmed)) return false
  if (/^[-*+]\s/.test(trimmed)) return false
  if (/^\d+\.\s/.test(trimmed)) return false
  if (trimmed.includes("：") || trimmed.includes(":")) return false
  if (trimmed.startsWith("```") || trimmed.endsWith("```")) return false
  return true
}

function convertChineseNumberedHeadings(lines: string[]): string[] {
  const result: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!looksLikeHeading(trimmed)) {
      result.push(line)
      i++
      continue
    }

    if (/^[一二三四五六七八九十百]+[、．.]\s*/.test(trimmed)) {
      const title = trimmed.replace(/^[一二三四五六七八九十百]+[、．.]\s*/, "")
      if (title && !/^#/.test(trimmed)) {
        result.push(`# ${trimmed}`)
        i++
        continue
      }
    }

    if (/^（[一二三四五六七八九十百]+）\s*/.test(trimmed)) {
      const title = trimmed.replace(/^（[一二三四五六七八九十百]+）\s*/, "")
      if (title && !/^#/.test(trimmed)) {
        result.push(`## ${trimmed}`)
        i++
        continue
      }
    }

    if (/^\([一二三四五六七八九十百]+\)\s*/.test(trimmed)) {
      const title = trimmed.replace(/^\([一二三四五六七八九十百]+\)\s*/, "")
      if (title && !/^#/.test(trimmed)) {
        result.push(`## ${trimmed}`)
        i++
        continue
      }
    }

    if (/^\d+[、．.]\s*/.test(trimmed) && trimmed.length < 30) {
      const title = trimmed.replace(/^\d+[、．.]\s*/, "")
      if (title && !/^#/.test(trimmed)) {
        result.push(`## ${trimmed}`)
        i++
        continue
      }
    }

    const commonH2Keywords = /^(核心主角|核心配角|主要人物|次要人物|反派|主角团|世界观|修炼体系|能力体系|金手指|势力分布|伏笔|大纲|总纲|卷纲|章纲|分卷大纲|章节细纲|故事背景|核心设定|主要设定|分卷)/
    if (commonH2Keywords.test(trimmed)) {
      result.push(`## ${trimmed}`)
      i++
      continue
    }

    const nextLines = lines.slice(i + 1, i + 4).map(l => l.trim()).filter(Boolean)
    const hasAttributeLines = nextLines.length > 0 && nextLines.every(l =>
      /^[：:]/.test(l) ||
      /(年龄|身份|技能|性格|核心|外貌|背景|目标|动机|欲望|恐惧|关系|冲突|弧光|定位|阵营|资源|能力|限制|代价|成长|功法|武器|装备)/.test(l) ||
      /^[-*+]\s/.test(l)
    )

    if (hasAttributeLines && trimmed.length < 30 && !trimmed.endsWith("。") && !trimmed.endsWith("，")) {
      if (/（.*）/.test(trimmed) || /\(.*\)/.test(trimmed) || /^[\u4e00-\u9fa5]{2,6}$/.test(trimmed)) {
        result.push(`### ${trimmed}`)
        i++
        continue
      }
    }

    result.push(line)
    i++
  }

  return result
}

function convertAttributeLines(lines: string[]): string[] {
  return lines.map(line => {
    const trimmed = line.trim()
    if (/^#{1,6}\s/.test(trimmed)) return line
    if (/^[-*+]\s/.test(trimmed)) return line
    if (/^\d+\.\s/.test(trimmed)) return line
    if (trimmed.startsWith("```") || trimmed.endsWith("```")) return line

    const attrMatch = trimmed.match(/^([^：:]{1,12})[：:]\s*(.*)$/)
    if (attrMatch) {
      const attrName = attrMatch[1].trim()
      const attrValue = attrMatch[2].trim()
      if (attrName && attrValue && attrName.length <= 12) {
        return `- **${attrName}：** ${attrValue}`
      }
    }

    return line
  })
}

export function normalizeOutlineMarkdown(content: string): string {
  let result = content
    .replace(/```(?:markdown|md)\s*\r?\n([\s\S]*?)\r?\n```/gi, (_, inner: string) => inner.trim())
    .replace(/^\\(#{1,6}\s)/gm, "$1")
    .replace(/^\\([-*+]\s)/gm, "$1")
    .replace(/^\\(>\s)/gm, "$1")
    .replace(/^\\(\d+\.\s)/gm, "$1")
    .replace(/\\([*_`[\]])/g, "$1")

  const lines = result.split(/\r?\n/)
  const withHeadings = convertChineseNumberedHeadings(lines)
  const withAttributes = convertAttributeLines(withHeadings)

  return withAttributes.join("\n")
}

function extractOutlineTitle(content: string): string {
  const lines = content.split("\n").map((line) => line.trim()).filter(Boolean)
  for (const line of lines.slice(0, 8)) {
    const headingMatch = line.match(/^#+\s+(.+)/)
    if (headingMatch) return headingMatch[1].trim()
    if (
      line.length > 2 &&
      line.length < 40 &&
      !line.startsWith("-") &&
      !line.startsWith("*") &&
      !line.includes(":")
    ) {
      return line
    }
  }
  return `${DEFAULT_TITLE_PREFIX}-${new Date().toISOString().slice(0, 10)}`
}

function sanitizeOutlineTitle(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|#`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24)
  return cleaned || `${DEFAULT_TITLE_PREFIX}-${new Date().toISOString().slice(0, 10)}`
}

function makeDistinctOutlineTitle(title: string, existingTitles: string[]): string {
  const existing = new Set(existingTitles.map((item) => item.trim()).filter(Boolean))
  if (!existing.has(title)) return title

  const first = `${title}-AI生成`
  if (!existing.has(first)) return first

  for (let index = 2; index <= 99; index++) {
    const candidate = `${first}-${index}`
    if (!existing.has(candidate)) return candidate
  }
  return `${first}-${Date.now()}`
}
