# juqingtuiyanshi-duozhinengti 分支说明

## 分支目标

本分支用于实现剧情推演室多 Agent 第一期架构底座：新增轻量黑板和多 Agent 轮次编排层，并接入现有推演流程。

## 使用要求

1. 不删除现有剧情推演室功能。
2. 不大改 UI。
3. 不接 MCP/web search。
4. 不引入导演/审查/投票等额外 LLM 调用。
5. 所有新增行为先写测试并确认失败，再实现。
6. 修改完成后必须验证、打包，并记录本文件和 `GenxinLOG/更新日志.md`。

## 20260703-143532

问题分析：
1. 用户反馈“继续未完成任务”弹窗总是弹出。
2. 代码追踪确认：`ChatPanel` 挂载时只要 `loadTaskBreakpoint(projectPath)` 读到 `.qm/breakpoint.json` 中的断点对象，就会打开断点恢复弹窗。
3. 取消弹窗会清理旧断点，但确认恢复只关闭弹窗并发送恢复提示，没有先清理旧断点；如果恢复过程被中断、失败或后续没有走到成功清理，下次打开仍会读到旧断点并再次弹出。
4. 弹窗复用 `ModifyConfirmDialog`，断点类型也显示“确认保存”，容易让用户误以为这是保存文件弹窗。

实现内容：
1. `confirmBreakpointResume` 在确认恢复时先关闭弹窗、清空 `lastBreakpoint`，并调用 `clearTaskBreakpoint(projectPath)` 清理磁盘旧断点，再发送恢复提示。
2. `ModifyConfirmDialog` 增加按类型配置的确认按钮文案，断点类型显示“继续执行”，其他写入/修改类弹窗仍显示“确认保存”。
3. `chat-panel-mount` 测试工具支持注入模拟断点，并补齐 `getLastQueryPages` mock，避免确认恢复后渲染引用面板时报测试 mock 缺失。
4. 新增 ChatPanel mount 回归测试，覆盖断点弹窗按钮文案和确认恢复时清理旧断点。

验证记录：
1. RED：新增断点弹窗文案和确认恢复清理测试后，当前代码分别因“没有继续执行按钮”和“clearTaskBreakpoint 未调用”失败。
2. GREEN：实现修复后，`npm.cmd run test:mocks -- src/components/chat/chat-panel.mount.spec.tsx`：1 个测试文件、5 个用例通过，6 个 todo。
3. 相邻验证：`npm.cmd run test:mocks -- src/components/chat/chat-panel.mount.spec.tsx src/components/chat/chat-panel.spec.tsx src/lib/agent/runner.spec.ts src/lib/agent/task-breakpoint.spec.ts`：4 个测试文件、82 个用例通过，6 个 todo。
4. `npm.cmd run typecheck`：通过。
5. `npm.cmd run test:mocks`：347 个测试文件、2599 个用例通过，6 个 todo。
6. `npm.cmd run build`：通过；保留既有 dynamic import、chunk size、plugin timings 警告。
7. 源码启动烟测：`http://127.0.0.1:5179/` 返回 200，页面包含 React root。
8. `npm.cmd run build:portable`：通过，产物 `release-portable\QMaiWrite.exe`，版本 `2.2.31`，大小 `149403648` 字节。

Git 状态：本轮未提交 git，未合并 main。

## 20260703-141801

问题分析：
1. 用户多次遇到“模型只输出了思考内容，但没有输出正文”。
2. 代码追踪确认：`llm-client.ts` 正确识别到了流式响应里只有 `reasoning` / `reasoning_content`，没有 `content`。
3. 章节生成会把 reasoning token 用于进度显示，但最终正文只接受 `content`，所以用户会先看到思考片段，最后仍报“没有正文”。
4. 根因不是应用侧 `max_tokens`，而是当前兼容接口/推理模型在该轮调用里没有从思考流切换到正文流；上层 Agent/工作流也没有像 Codex 一样自动换参数重试。

实现内容：
1. 新增 `src/lib/reasoning-retry.ts`，统一识别 reasoning-only 错误，并提供 `reasoning: off` 的兜底覆盖参数。
2. `src/lib/agent/runner.ts` 在 ReAct 单轮模型调用遇到 reasoning-only 时，自动清空本轮临时输出并用非推理模式重试一次。
3. `src/lib/novel/deep-chapter-generation.ts` 在章节/深度章节生成的当前阶段遇到 reasoning-only 时，自动切换非推理模式重试当前阶段，不重启整条工作流。
4. 新增 `src/lib/agent/runner.spec.ts` 与 `src/lib/novel/deep-chapter-generation.spec.ts` 回归测试，覆盖外层 Agent 和章节阶段的兜底路径。

验证记录：
1. RED：新增两个 reasoning-only 兜底测试后，当前代码分别因“只调用一次模型”和“直接抛错”失败。
2. GREEN：实现兜底后，`npm.cmd run test:mocks -- src/lib/agent/runner.spec.ts src/lib/novel/deep-chapter-generation.spec.ts`：2 个测试文件、40 个用例通过。
3. 相邻验证：`npm.cmd run test:mocks -- src/lib/agent/runner.spec.ts src/lib/novel/deep-chapter-generation.spec.ts src/lib/llm-client.test.ts src/lib/reasoning-detector.test.ts src/lib/llm-providers.test.ts src/lib/llm-providers.spec.ts`：6 个测试文件、100 个用例通过。
4. `npm.cmd run typecheck`：通过。
5. `npm.cmd run test:mocks`：347 个测试文件、2597 个用例通过，6 个 todo。
6. `npm.cmd run build`：通过；保留既有 dynamic import、chunk size、plugin timings 警告。
7. 源码启动烟测：`http://127.0.0.1:5179/` 返回 200，页面包含 React root。
8. `npm.cmd run build:portable`：通过，产物 `release-portable\QMaiWrite.exe`，版本 `2.2.31`，大小 `149403648` 字节。

Git 状态：本轮未提交 git，未合并 main。

## 20260703-130147

计划内容：
1. 新增 `multi-agent-orchestrator.ts`。
2. 新增 `multi-agent-orchestrator.spec.ts`。
3. 在 `simulation-engine.ts` 中接入 orchestrator。
4. 保持现有实时事件流、报告、草稿、采访流程不回退。

Git 状态：已创建分支，尚未提交。

## 20260703-131504

实现内容：
1. 新增 `src/lib/novel/story-simulation/multi-agent-orchestrator.ts`。
2. 新增 `src/lib/novel/story-simulation/multi-agent-orchestrator.spec.ts`。
3. `SimulationBlackboard` 支持 activeAgents、events、publicEvents、visibleEventsByAgent、roundPlans。
4. `recordBlackboardEvent` 根据 `TimelineEvent.observableBy` 写入全局事件、角色可见事件和公共事件。
5. `planMultiAgentRound` 根据模式的 `agentSubsetRatio` 生成每轮 Agent 行动计划。
6. `simulation-engine.ts` 接入 orchestrator：轮次角色选择交给 `planMultiAgentRound`，直接行动、react 反应和系统随机事件都写入 blackboard。

验证记录：
1. RED/GREEN：orchestrator 模块缺失测试先失败后通过。
2. RED/GREEN：`simulation-engine` 接线守卫测试先失败后通过。
3. `npx.cmd vitest run src/lib/novel/story-simulation/multi-agent-orchestrator.spec.ts`：1 个测试文件、6 个用例通过。
4. `npx.cmd vitest run src/lib/novel/story-simulation/multi-agent-orchestrator.spec.ts src/lib/novel/deep-chapter-generation.spec.ts`：2 个测试文件、31 个用例通过。
5. `npm.cmd run typecheck`：通过。
6. `npm.cmd run test:mocks`：345 个测试文件、2584 个用例通过，6 个 todo。
7. `npm.cmd run build`：通过；保留既有 Vite dynamic import、chunk size、plugin timings 警告。
8. 源码启动：`http://127.0.0.1:5179/` 返回 200，验证后端口无监听残留。
9. `npm.cmd run build:portable`：第一次出现一次性 Vite HTML emit 路径异常，重跑通过；产物 `release-portable\QMaiWrite.exe`，版本 `2.2.31`，大小 `149403648` 字节。

Git 状态：本轮未提交 git，未合并 main。

## 20260703-135904

实现内容：
1. 在 `types.ts` 中新增推演过程观察快照类型：`SimulationDebugTrace`、`SimulationDebugAgent`、`SimulationDebugVisibleEvent`。
2. 在 `multi-agent-orchestrator.ts` 中新增 `createBlackboardDebugTrace`，输出 blackboard 统计、候选 Agent、本轮行动 Agent、角色可见事件摘要和最近事件。
3. 在 `simulation-engine.ts` 中新增可选 `onDebugTrace` 回调；每轮计划生成后、直接行动/反应/系统事件写入 blackboard 后都会发出调试快照。
4. 在 `story-simulation-store.ts` 中新增 `debugTraces` 状态和写入/清空方法。
5. 在 `story-simulation-view.tsx` 的推演中面板增加“时间线 / 过程观察”切换，过程观察区展示 Blackboard、Agent 调度和可见事件。
6. 更新实施计划文档，加入 Phase 3 推演过程观察面板任务。

验证记录：
1. RED/GREEN：调试快照 helper、store trace、engine/source、UI source guard 测试先失败后通过。
2. `npx.cmd vitest run src/lib/novel/story-simulation/multi-agent-orchestrator.spec.ts src/stores/story-simulation-store.spec.ts src/components/novel/story-simulation/story-simulation-view.debug.spec.ts`：3 个测试文件、17 个用例通过。
3. `npx.cmd vitest run src/lib/novel/story-simulation/multi-agent-orchestrator.spec.ts src/stores/story-simulation-store.spec.ts src/components/novel/story-simulation/story-simulation-view.debug.spec.ts src/lib/novel/deep-chapter-generation.spec.ts`：4 个测试文件、42 个用例通过。
4. `npm.cmd run typecheck`：通过。
5. `npm.cmd run test:mocks`：347 个测试文件、2595 个用例通过，6 个 todo。
6. `npm.cmd run build`：通过；保留既有 Vite dynamic import、chunk size、plugin timings 警告。
7. 源码启动：`http://127.0.0.1:5179/` 返回 200，验证后端口无监听残留。
8. `npm.cmd run build:portable`：通过，产物 `release-portable\QMaiWrite.exe`，版本 `2.2.31`，大小 `149403648` 字节。

Git 状态：本轮未提交 git，未合并 main。

## 20260703-133222

实现内容：
1. `SimulationBlackboard` 增加 `allAgents`，把全量角色名册和当前轮次行动集分开维护。
2. 新增 `selectNodeAgentCandidates`，节点角色候选从全量角色名册选择，避免上一节点缩窄 `activeAgents` 后导致后续节点角色丢失。
3. 新增 `getBlackboardVisibleEvents`，Agent 决策 prompt 只读取 blackboard 中对自己可见的事件，并支持最新事件数量限制。
4. `simulation-engine.ts` 接入 `selectNodeAgentCandidates` 和 `getBlackboardVisibleEvents`，Agent 可见上下文不再从 `state.timelineEvents` 直接构造。
5. 更新设计文档和实施计划，记录 Phase 2 blackboard 上下文接管范围。

验证记录：
1. RED/GREEN：全量角色名册、节点候选选择、可见事件过滤、最新事件限制和 `simulation-engine.ts` 接线守卫测试先失败后通过。
2. `npx.cmd vitest run src/lib/novel/story-simulation/multi-agent-orchestrator.spec.ts`：1 个测试文件、11 个用例通过。
3. `npx.cmd vitest run src/lib/novel/story-simulation/multi-agent-orchestrator.spec.ts src/lib/novel/deep-chapter-generation.spec.ts`：2 个测试文件、36 个用例通过。
4. `npm.cmd run typecheck`：通过。
5. `npm.cmd run test:mocks`：345 个测试文件、2589 个用例通过，6 个 todo。
6. `npm.cmd run build`：通过；保留既有 Vite dynamic import、chunk size、plugin timings 警告。
7. 源码启动：`http://127.0.0.1:5179/` 返回 200，验证后端口无监听残留。
8. `npm.cmd run build:portable`：第一次出现一次性 Vite HTML emit 路径异常，单独 `npm.cmd run build` 通过后重跑 portable 成功；产物 `release-portable\QMaiWrite.exe`，版本 `2.2.31`，大小 `149403648` 字节。

Git 状态：本轮未提交 git，未合并 main。
