# dagangbugxiu 分支说明

## 分支用途

AI 大纲模块 4 个 Bug 修复。

## 使用要求

- 本分支仅修复大纲生成相关的 4 个 Bug，不涉及其他功能
- 修复完成后需运行类型检查和单元测试确认不回退
- 不自动合并到 main，等待用户确认

## Bug 列表

1. Bug 1: 思考内容区域下拉箭头遮挡时间显示（EventStream）
2. Bug 2: 多 Agent 失败后无法续传（编排器 + UI + Store）
3. Bug 3: intent_clarity 标记在流式输出中可见（stripStructuredMarkers）
4. Bug 4: "继续完善当前模块"导致重复读取全部资料（planOutlineContextReuse）

## 更新记录

### 20260713-1930 初始创建

- 从 main（2.2.34）创建分支
- 设计文档：`docs/superpowers/specs/2026-07-13-outline-bugfixes-design.html`
- 是否提交 git：未提交

### 20260713-1940 四个 Bug 修复完成

#### Bug 1: EventStream 下拉箭头遮挡
- 文件：`src/components/common/event-stream.tsx`
- 改动：新增 useEffect，isStreaming 变为 false 时重置 showScrollButton 和 userScrolledRef

#### Bug 2: 多 Agent 续传
- 文件：`src/lib/novel/outline-multi-agent-orchestrator.ts` — 新增 resumeOutlineMultiAgentWorkflow 函数
- 文件：`src/stores/outline-chat-store.ts` — OutlineMultiAgentRunState 增加 resumeablePlan 字段
- 文件：`src/components/sources/outline-multi-agent-panel.tsx` — 新增"继续未完成的任务"按钮 + onResume/resumeDisabled 属性
- 文件：`src/components/sources/outline-chat-panel.tsx` — 新增 handleResumeMultiAgent 回调 + 失败时填充 resumeablePlan

#### Bug 3: intent_clarity 标记泄漏
- 文件：`src/lib/novel/outline-intent-clarity.ts`
- 改动：stripStructuredMarkers 增加不完整标记清理（开标签无闭标签时截断）

#### Bug 4: 重复读取资料
- 文件：`src/lib/novel/outline-context-reuse.ts` — OutlineContextReuseInput 增加 systemGenerated 字段，跳过关键词检测
- 文件：`src/components/sources/outline-chat-panel.tsx` — handleSend options 增加 systemGenerated，3 处系统生成 prompt 调用传入 systemGenerated: true

#### 验证
- TypeScript 类型检查：通过
- 单元测试：46/46 通过（chat-message 16 + intent-clarity 8 + next-step 7 + context-reuse 10 + multi-agent-orchestrator 5）
- 是否提交 git：未提交

### 20260713-1945 风险与限制修复

#### 风险1: store 持久化 resumeablePlan 数据验证
- 文件：`src/stores/outline-chat-store.ts`
- 改动：loadFromDisk 加载时验证 resumeablePlan 的 plan/completedResults/failedAgentIds 字段完整性，结构不完整时清除

#### 风险2: Bug 3 截断逻辑边界测试
- 文件：`src/lib/novel/outline-intent-clarity.spec.ts` — 新增 7 个边界测试用例
- 文件：`src/lib/novel/outline-context-reuse.spec.ts` — 新增 3 个 systemGenerated 测试用例
- 覆盖：流式中间态截断、完整标记对优先级、裸闭标签清理、非标记名 HTML 注释不受影响、systemGenerated 跳过/不跳过关键词检测

#### 风险3: handleSend 调用覆盖补全
- 文件：`src/components/sources/outline-chat-panel.tsx`
- 改动：向导多 Agent 调用（handleSubmitOutlineWizard）补充 systemGenerated: true，确保所有系统生成 prompt 路径都标记

#### 验证
- TypeScript 类型检查：通过
- 单元测试：55/55 通过（新增 9 个边界测试）
- 是否提交 git：未提交
