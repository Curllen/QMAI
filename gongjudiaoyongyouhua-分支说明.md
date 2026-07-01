# gongjudiaoyongyouhua 分支说明

## 分支目标

本分支用于优化 AI 工具调用流程，把当前工具调用从单纯执行器增强为更可控、可追踪、可验证的 Agent 流程。

## 使用要求

1. 不合并到 main，等待用户完成全面软件测试后再决定合并。
2. 本分支只处理工具调用流程增强，不顺手改动无关 UI、主题或模型配置。
3. 读取类工具默认自动执行，写入类工具必须进入确认/预览路径。
4. 工具返回给模型的长内容可以压缩，但界面和记录中保留完整工具结果。
5. 修改完成后必须完成源码启动、旧功能测试、构建和便携版打包验证。

## 本次更新

### 20260701-132053

- 新增统一工具事件层 `applyAgentToolEvent`，聊天面板和 AI 大纲面板统一通过工具事件更新运行中、完成、错误和待确认状态。
- 新增工具结果压缩模块，长工具结果回灌给模型前保留首尾证据并标记“已压缩给模型使用”，完整结果仍保存在工具调用记录中。
- 写入类工具默认标记为需要确认，AgentRunner 在没有用户确认时不会执行写入，只返回可审核预览提示。
- `write_chapter`、`write_memory`、`write_outline_node` 写入后会读回验证，成功显示“读回验证通过”，不一致时返回中文警告。
- AI 大纲加入固定分析流程：先 list 确认可用资料，再 read 读取内容，分析冲突、缺口、伏笔、角色动机和章节承接，最后生成建议。

## 验证记录

- 20260701-132053：
  - `npm.cmd exec -- vitest run src/lib/agent/runner.spec.ts src/lib/agent/tool-events.spec.ts src/lib/agent/tool-result.spec.ts src/lib/agent/tools/read-tools.spec.ts src/lib/agent/tools/write-tools.spec.ts src/components/chat/agent-tool-call-message.spec.tsx src/components/chat/chat-panel.spec.tsx src/components/sources/outline-chat-panel.spec.tsx src/components/reference/ReferenceInput.spec.tsx src/components/reference/ReferencePickerDialog.spec.tsx src/lib/reference/providers.spec.ts`：11 个测试文件、75 个用例通过。
  - `npm.cmd run typecheck`：通过。
  - `npm.cmd run test:mocks`：287 个测试文件、2127 个用例通过。
  - `npm.cmd run build`：通过，存在既有 Vite chunk/dynamic import 警告。
  - 源码启动：`npm.cmd run dev -- --host 127.0.0.1 --port 5173` 通过 Job 验证，Vite ready 后已停止。
  - `npm.cmd run build:portable`：通过，生成 `release-portable\QMaiWrite.exe` 和 `version-info.json`；Rust 构建存在既有 `file_sync.rs` dead-code 警告。

## Git 状态

- 20260701-132053 工具调用流程优化纳入本次提交。
- 不合并 main。
