# zhangjielandu 分支说明（章节计划分析提示词）

## 分支用途

本分支用于实现"AI 会话计划执行"的章节计划分析提示词升级，并把用户确认的计划打通到正文生成的写作任务书链路。

核心目标：把会话层章节计划从"字段清单"升级为"七维度分析决策计划"，去除三档模式裁剪，让用户确认的计划真正作为写作任务书的权威依据驱动章节生成。

## 使用要求

1. 本分支独立开发，基于 main 的 HEAD 创建，使用 git worktree 物理隔离。
2. 所有改动只在本 worktree（.worktrees/zhangjielandu）内进行，不得直接修改 main 工作区的未提交改动。
3. 改动遵循最小侵入原则，不重构无关代码，不删除已有函数。
4. 所有面向用户的提示语使用中文。
5. 不破坏旧功能：未传 planBlueprint 时，章节生成链路与原行为完全一致。

## 改动文件清单

- src/lib/agent/plugins/build-system-prompt-plugin.ts
  - buildChapterPlanProtocol 重写为统一七维度蓝图模板（输入校验/章节定位/戏剧问题与信息流/场景序列编排/冲突与人物引擎/边界与禁忌/节奏字数与结尾钩子），去除 fast/standard/strict 三档分支，mode 仅用于标注工作流强度。
- src/lib/agent/plugins/build-system-prompt-plugin.spec.ts
  - 更新断言：去掉"当前为标准模式"，改为断言七维度蓝图标记与 planBlueprint。
- src/lib/novel/deep-chapter-prompts.ts
  - buildDeepChapterBriefPrompt 增加 planBlueprint 可选参数；传入时注入"用户已确认的章节蓝图"段并切换为以蓝图为权威依据的硬性要求。
- src/lib/novel/deep-chapter-generation.ts
  - DeepChapterGenerationInput 增加 planBlueprint 字段；brief 阶段调用 buildDeepChapterBriefPrompt 时透传。
- src/lib/agent/tools/run-chapter-workflow.ts
  - RunChapterWorkflowParams 增加 planBlueprint；工具 parameters 声明 planBlueprint；execute 透传到 runDeepChapterGeneration 的 input。
- src/lib/agent/tools/run-chapter-workflow.spec.ts
  - 新增测试：验证 planBlueprint 被透传到 deep chapter generation。
- src/lib/novel/deep-chapter-generation.spec.ts
  - 新增测试：验证蓝图注入 brief 提示词；无蓝图时不注入。
- src/components/chat/chapter-plan-confirm-dialog.tsx
  - buildPlanConfirmMessage 增强：确认后要求 AI 把蓝图原文作为 planBlueprint 传入 run_chapter_workflow，不再只说"按计划写正文"。
  - 增加“自检蓝图”按需按钮与结果展示区；用户点击后才触发轻量蓝图自检，避免每次计划都增加模型调用。
- src/lib/novel/chapter-plan-self-check.ts
  - 新增章节蓝图自检提示词与模型调用封装，chat-panel 不直接调用 streamChat，保持现有会话架构边界。
- src/lib/novel/chapter-plan-self-check.spec.ts
  - 新增自检提示词与流式返回聚合测试。

## 验证方式

- npm run typecheck
- npm run test:mocks（含 build-system-prompt-plugin / run-chapter-workflow / deep-chapter-generation 相关测试）
- 旧功能回归：未开启 Plan Execute 或未传 planBlueprint 时，章节生成行为与改动前一致。

## 提交记录

- 未提交。当前改动停留在 worktree 工作区，等待用户确认后再决定是否提交与合并。

## 合并说明

本分支基于 main HEAD（3525817）创建，与 main 工作区现有未提交改动（chat-message.tsx、Cargo.lock 等）和其他分支（zed-ui-redesign、huihualishianniu 等）物理隔离，互不影响。

合并回 main 时：在 main 工作区执行 `git merge zhangjielandu`。该分支只触及章节蓝图与正文生成链路，与 UI 重构分支无文件重叠，预期无冲突或仅极小冲突。

## 更新内容

### 20260705
- 初版实现：七维度蓝图分析提示词 + planBlueprint 透传链路。
- 去除三档模式裁剪，统一完整七维度。
- 打通会话层确认蓝图 → 写作任务书 → 正文生成的闭环。

### 20260705（第二轮：方向1 + 方向2 闭环增强）
- 方向1·审稿闭环：reviewChapter 增加 planBlueprint 参数与蓝图偏离审查维度；审稿提示词注入"用户已确认的章节蓝图（偏离即 error）"段。返修/去AI味阶段通过 taskBrief 间接继承蓝图约束（brief 阶段已把蓝图固化为 taskBrief 权威依据）。
- 方向2·强制注入：run-chapter-workflow 工具增加 getPlanBlueprint 兜底 getter；useAgentConfig 透传 getPlanBlueprint 到工具工厂；chat-panel 用 confirmedBlueprintRef 存已确认蓝图，工具执行时若 AI 未带 planBlueprint 参数则从 ref 兜底注入。确认后 followup 发送完毕清除 ref，避免误注入。
- 新增测试：审稿蓝图注入/不注入、getPlanBlueprint 兜底注入、AI传入优先于兜底。

### 20260705（第三轮：方向3 按需蓝图自检）
- 按用户选择 B 实现“按需自检”：章节计划弹窗内增加“自检蓝图”按钮，点击后才调用当前 AI 会话模型进行蓝图自检。
- 自检提示词检查：七维度完整性、场景序列、信息流、伏笔动作、边界禁忌、结尾钩子。
- 自检调用下沉到 src/lib/novel/chapter-plan-self-check.ts，避免 chat-panel 直接 await streamChat，保持 ReAct 会话入口架构不被破坏。
- 新增测试：自检按钮展示、点击后结果显示、自检提示词、自检流式返回聚合。

### 20260705（第四轮：稳定性与结构化自检）
- confirmedBlueprintRef 清理改为 try/finally，followup 发送成功、失败或被中断都会清理已确认蓝图，避免后续无关工具调用误注入旧蓝图。
- 章节计划弹窗增加自检请求编号防护：自检期间关闭弹窗或重新打开时，旧请求返回后不会污染新弹窗状态。
- 自检模型输出改为结构化 JSON：status、summary、issues；库层解析后格式化展示。若模型返回纯文本，则原样兜底显示。
- 新增测试：try/finally 清理源码约束、关闭弹窗后旧自检结果不回流、结构化自检解析、纯文本兜底。

### 20260705（第五轮：上下文自检 + 蓝图修订 + 履约度）
- 方向1·上下文感知自检：章节蓝图自检支持传入压缩后的 ContextPack 字段（chapterGoal、characterStates、cognitionStates、foreshadowingStates、timeline、canonRules、mustAvoid），自检不再只检查蓝图形式，也会对照真实项目资料。
- 方向2·按自检建议修订蓝图：章节计划弹窗在自检结果出现后显示“按自检建议修正”按钮；点击后调用 AI 基于原蓝图和自检结果生成修订版，并进入编辑状态，仍由用户最终确认。
- 方向3·蓝图履约度检查：章节工作流在最终正文生成后，若存在用户确认的 planBlueprint，会执行一次蓝图履约度检查，结果写入 DeepChapterGenerationResult.planCompliance，并透出到 run_chapter_workflow 工具结果。
- 新增文件：src/lib/novel/chapter-plan-compliance.ts / .spec.ts。
- 新增测试：上下文自检 prompt、蓝图修订 prompt/调用、履约度检查 prompt/调用、deep chapter workflow 履约度返回、工具结果包含履约度。

### 20260705（第六轮：章节正文质量维度增强）
- 围绕“生成更好的小说章节内容”边界，增强蓝图协议、任务书、正文草稿、自检和履约度检查提示词。
- 新增质量维度：爽点/期待点设计、场景戏剧功能、对话目标、开头与结尾单独约束、水文风险检查。
- 正文草稿提示词新增“不要写成说明文”约束：信息必须通过动作、对话、场景细节和人物反应呈现，避免旁白解释剧情设计或总结角色动机。
- 自检和履约度检查同步检查：是否只有信息推进、场景是否推动剧情/人物关系/信息差/伏笔/危机、对话是否改变关系或信息状态。
- 新增测试断言覆盖上述提示词关键词，防止后续改动误删章节质量要求。

### 20260705（第七轮：提示词瘦身与优先级重排）
- 压缩蓝图协议、自检、履约度检查和正文阶段提示词的重复表达，降低提示词堆叠导致正文生成空间被挤占的风险。
- 明确优先级：蓝图阶段负责设计，任务书阶段负责逐场景落地，正文阶段只保留硬执行规则。
- 保留直接影响章节质量的边界：爽点/期待点、场景戏剧功能、对话目标、开头与结尾、水文风险、不要写成说明文。
- 新增提示词体量回归约束：章节蓝图协议和自检/履约检查提示词必须保持在较紧凑范围内，避免后续继续膨胀。
- 已验证：build-system-prompt-plugin、deep-chapter-generation、chapter-plan-self-check、chapter-plan-compliance 相关测试通过。

### 20260705（第八轮：typecheck 阻断清理与打包）
- 清理 App、chat-message、chat-panel、outline-chat-panel、deep-chapter-generation 中未使用的 import/变量，解除 TypeScript noUnusedLocals 阻断。
- 验证通过：npm run typecheck、npm run build、章节蓝图相关 vitest 回归测试。
- 已生成 Windows 便携版：release-portable/QMaiWrite.exe；version-info.json 显示版本 2.2.33，包含 pdfium 和 skills。
- 补充验证：npm run test:mocks 仍有 8 个失败，集中在 outline-chat-panel 源码字符串断言、chat-message 源码字符串断言、unified-skill-library-view、story-simulation debug 文案断言、release-notes 当前版本日志断言；与本次章节蓝图链路和 typecheck 清理无直接文件重叠，暂不在本分支扩大修复范围。
- 未提交 git，未合并 main。

### 20260705（第九轮：履约检查非阻塞正文回调）
- 调整 deep chapter 生成顺序：最终正文生成后立即触发 onFinalContent，再执行蓝图履约度检查，避免履约检查慢或失败时拖慢正文展示。
- runChapterPlanComplianceCheck 增加 AbortSignal 透传，用户停止生成时后置履约检查也能被中止。
- 新增回归测试：最终正文回调早于履约检查完成；履约检查接收 stop signal；底层 streamChat 收到 signal。
- 验证通过：deep-chapter-generation/chapter-plan-compliance 目标测试、章节蓝图相关回归测试、npm run typecheck、npm run build、npm run build:portable。
- 未提交 git，未合并 main。

### 20260705（第十轮：章节计划命名与执行摘要）
- 按用户要求将用户可见文案、模型提示词、工具结果和内置技能描述中的“蓝图”改为“计划”；内部 `planBlueprint` 参数名暂保留，避免扩大 API 兼容风险。
- 新增计划执行摘要：完整确认计划仍由会话层和工具层保留，正文生成 brief、AI 审稿和计划履约度检查使用压缩后的“章节计划执行摘要”，降低长计划挤占上下文导致正文丢失的风险。
- 审稿阶段补充传入计划执行摘要，正文生成过程能在审稿阶段检查是否偏离用户确认计划。
- 新增文件：src/lib/novel/chapter-plan-execution-summary.ts / .spec.ts。
- 验证通过：章节计划相关回归测试、npm run typecheck、npm run build、npm run build:portable。
- 已生成 Windows 便携版：release-portable/QMaiWrite.exe。
- 未提交 git，未合并 main。

### 20260705（第十一轮：结构化计划执行摘要）
- 计划执行摘要改为固定结构：本章目标、场景序列、必须执行、禁止违背、可自由发挥、对话目标、伏笔动作、结尾钩子。
- 场景序列会统一生成 S1/S2/S3 编号，后续任务书、审稿和履约检查可按同一编号对照，降低漏写场景的概率。
- 章节计划协议要求模型在计划阶段就写出 S1/S2/S3，并在计划末尾列出“必须执行 / 禁止违背 / 可自由发挥”，让正文阶段知道哪些内容不能漏、哪些内容不能写、哪些只允许补细节。
- 新增回归测试覆盖结构化摘要、场景编号和执行分层，防止后续提示词退回松散文本。
- 验证通过：章节计划相关回归测试、npm run typecheck、npm run build、npm run build:portable。
- 已生成 Windows 便携版：release-portable/QMaiWrite.exe。
- 未提交 git，未合并 main。

### 20260705（第十二轮：摘要质量兜底与任务书场景展开）
- 计划执行摘要增加本地质量检查：如果结构化摘要缺少 S 场景编号、禁止违背或结尾钩子，会自动追加“原计划关键片段”，避免压缩过度导致关键执行信息丢失。
- 写作任务书提示词强化：当计划摘要包含 S1/S2/S3 时，任务书必须逐条展开 S1/S2/S3，不得合并、跳过或调换顺序。
- 本轮不新增模型调用，不做履约失败自动返修，只增强本地摘要稳健性和任务书阶段执行约束。
- 新增回归测试覆盖摘要质量兜底和任务书 S 编号展开。
- 验证通过：章节计划相关回归测试、npm run typecheck、npm run build、npm run build:portable。
- 已生成 Windows 便携版：release-portable/QMaiWrite.exe。
- 未提交 git，未合并 main。

### 20260705（第十三轮：履约结构化与偏离点轻量返修）
- 计划履约度检查改为优先要求 JSON 输出，并新增本地解析：兼容 structured JSON 和旧式纯文本结果。
- 新增履约状态分层：符合、基本符合、部分偏离、明显偏离；只有“部分偏离 / 明显偏离”且存在可执行偏离点时才追加一次轻量返修。
- 新增计划偏离点返修 prompt：只修复偏离点，不重写全章；保留原正文结构、节奏、人物口吻和已完成有效内容。
- 返修完成后会再次回传最终正文，保证界面展示与返回结果一致；返修失败时保留原正文，不阻断章节生成。
- 新增回归测试覆盖结构化解析、旧文本兼容、偏离时返修、基本符合时不返修。
- 验证通过：章节计划相关回归测试、npm run typecheck、npm run build、npm run build:portable。
- 已生成 Windows 便携版：release-portable/QMaiWrite.exe。
- 未提交 git，未合并 main。

### 20260705（第十四轮：计划履约活动流可读性）
- 优化计划履约检查活动流展示：从原始 JSON/纯文本改为稳定中文摘要，直接显示履约状态、偏离点数量、处理决定和偏离点明细。
- 优化计划偏离点返修活动流展示：返修成功后明确提示“正文已更新”，并显示返修前后字数和处理范围。
- 未改变模型调用策略：仍只有“部分偏离 / 明显偏离”且有可执行偏离点时才触发一次轻量返修。
- 新增回归测试覆盖活动流中“触发轻量返修”和“无需返修”两种展示。
- 验证通过：章节计划相关回归测试、npm run typecheck、npm run build、npm run build:portable。
- 已生成 Windows 便携版：release-portable/QMaiWrite.exe。
- 未提交 git，未合并 main。

### 20260705（第十五轮：返修安全校验与未知履约兜底）
- 新增计划偏离点返修结果安全校验：返修后正文若明显变短、明显变长或未保留原正文主要内容，会保留返修前正文。
- 返修异常时活动流明确提示“返修结果异常，已保留原正文”，并列出异常原因和前后字数。
- 计划履约结果解析为未知时，活动流明确显示“处理决定：未触发返修”，并说明“模型未按结构返回，已避免误改正文”。
- 本轮不增加模型调用，不改变正常返修路径，只增强异常结果兜底。
- 新增回归测试覆盖返修过短、过长、丢失原正文主要内容、unknown 履约结果四类情况。
- 验证通过：章节计划相关回归测试、npm run typecheck、npm run build、npm run build:portable。
- 已生成 Windows 便携版：release-portable/QMaiWrite.exe。
- 未提交 git，未合并 main。

### 20260705（第十六轮：收口审查修复）
- 修复计划偏离点返修成功后 `revised` 状态未同步的问题：正文被计划返修更新时，工具返回和完成事件会正确标记已返修。
- 优化长正文履约检查与偏离返修提示：不再只截取正文开头，改为保留开头和结尾，中段用截断标记提示，避免长章节的章末钩子/结尾偏离被遗漏。
- 新增回归测试覆盖计划返修状态一致性、长正文首尾保留和提示词长度控制。
- 验证通过：章节计划相关回归测试 9 个文件 163 条、npm run typecheck、npm run build、npm run build:portable。
- 已生成 Windows 便携版：release-portable/QMaiWrite.exe；version-info.json 显示版本 2.2.33，builtAt 为 2026-07-05T09:05:02.970Z。
- 补充验证：npm run test:mocks 仍有 8 个既有失败，集中在 outline-chat-panel、chat-message、unified-skill-library-view、story-simulation debug、release-notes；与本轮计划执行链路收口修复无直接文件重叠。
- 未提交 git，未合并 main。
