export const DEFAULT_RESIZABLE_INPUT_HEIGHT = 44
/** 输入框底部预留空间：发送按钮 + padding + 拖拽条 + 模型选择器等 */
const INPUT_BOTTOM_RESERVED = 80

export interface ResizableInputBounds {
  minHeight: number
  maxHeight: number
}

export function resolveResizableInputMaxHeight({
  panelHeight,
  viewportHeight,
}: {
  panelHeight: number
  viewportHeight: number
}): number {
  const availableHeight = panelHeight > 0 ? panelHeight : viewportHeight
  return Math.max(DEFAULT_RESIZABLE_INPUT_HEIGHT, Math.floor(availableHeight / 2))
}

/**
 * 根据输入框在视口中的位置计算最大高度，防止向上拖动时超出软件界面下沿边界。
 * @param inputTopOffset 输入框顶部距视口顶部的距离（通过 getBoundingClientRect().top 获取）
 * @param viewportHeight 视口高度（window.innerHeight）
 */
export function resolveViewportAwareMaxHeight(
  inputTopOffset: number,
  viewportHeight: number,
): number {
  const availableSpace = viewportHeight - inputTopOffset - INPUT_BOTTOM_RESERVED
  return Math.max(DEFAULT_RESIZABLE_INPUT_HEIGHT, Math.floor(availableSpace))
}

export function clampResizableInputHeight(
  nextHeight: number,
  bounds: ResizableInputBounds,
): number {
  const minHeight = Math.max(1, Math.floor(bounds.minHeight))
  const maxHeight = Math.max(minHeight, Math.floor(bounds.maxHeight))
  if (!Number.isFinite(nextHeight)) return minHeight
  return Math.min(maxHeight, Math.max(minHeight, Math.round(nextHeight)))
}
