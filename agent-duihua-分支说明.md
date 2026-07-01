# agent-duihua 分支说明

## 分支目标

本分支用于将 AI 会话面板接入 Agent 工具调用流程，并接入 @引用输入与引用弹窗。

## 使用要求

1. 不合并到 main，等待用户完成全面软件测试后再决定合并。
2. 本分支只处理 AI 会话面板，不处理 AI 大纲面板。
3. 保留旧 `ChatInput` 组件源码，不删除不修改。
4. 面向用户的提示语保持中文。
5. 修改完成后必须完成源码启动、旧功能测试、构建和便携版打包验证。

## 本次更新

### 20260701-092043

- 将 `chat-panel` 的发送流程接入 `AgentRunner`。
- 将 AI 会话输入区替换为 `ReferenceInput`，并接入 `ReferencePickerDialog`。
- 用户消息保存 `attachedReferences`，assistant 占位消息保存 `isAgentRunning` 与 `agentToolCalls`。
- 用户消息区域展示只读引用芯片。
- `useAgentConfig` 返回已加载技能配置，并修正内置工具注册使用的 wiki 目录路径。
- 保留章节生成相关的 QM-QUAI、目标章节解析和角色灵魂确认逻辑，避免旧功能回退。

## 验证记录

- `npm.cmd exec -- vitest run src/components/chat/chat-panel.spec.tsx src/components/chat/chat-message.spec.tsx src/hooks/use-agent-config.spec.ts`：17 个用例通过。
- `npm.cmd exec -- vitest run src/components/layout/chat-layout.test.ts`：11 个用例通过。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run build`：通过，存在既有 Vite chunk/动态导入警告。
- `npm.cmd run test:mocks`：2088/2089 个用例通过，剩余 1 个既有失败为 `src/lib/changelog.spec.ts` 未包含当前 `2.2.31`。
- 源码启动：Vite ready，`http://127.0.0.1:1420/` 返回 HTTP 200。
- `npm.cmd run build:portable`：通过，生成 `release-portable\QMaiWrite.exe`。

## Git 状态

- 本次更新随当前分支提交入库。
- 不合并 main。
