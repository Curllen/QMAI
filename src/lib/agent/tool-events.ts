import type { AgentRunRecord, AgentToolEvent } from "./types"

export type ToolCallRecord = AgentRunRecord["toolCalls"][number]

export function applyAgentToolEvent(
  records: ToolCallRecord[] | undefined,
  event: AgentToolEvent,
): ToolCallRecord[] {
  const current = records ?? []
  const existingIndex = current.findIndex((record) => record.id === event.callId)
  const status =
    event.type === "result"
      ? "done"
      : event.type === "error"
        ? "error"
        : event.type === "approval_required"
          ? "approval_required"
          : "running"

  const nextRecord: ToolCallRecord = {
    id: event.callId,
    name: event.name,
    params: event.params,
    result: event.result ?? "",
    status,
    startedAt: event.timestamp,
    finishedAt: event.type === "call_started" ? 0 : event.timestamp,
  }

  if (existingIndex < 0) {
    return [...current, nextRecord]
  }

  return current.map((record, index) => {
    if (index !== existingIndex) return record
    return {
      ...record,
      name: event.name,
      params: event.params,
      result: event.result ?? record.result,
      status,
      finishedAt: event.type === "call_started" ? record.finishedAt : event.timestamp,
    }
  })
}
