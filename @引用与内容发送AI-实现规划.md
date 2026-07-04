# @ 引用与内容发送到 AI — 实现规划

> 本规划基于 `@引用与内容发送AI-PRD.md`，芯片方案采用 **B（富文本内联芯片，新组件基座）**。
> 覆盖功能一/二/三/F4 × AI 会话与 AI 大纲两处面板。
> 状态：规划阶段，待执行。遵循 AGENTS.md（独立分支、拼音命名、不破坏旧功能、外科手术式改动）。

---

## 一、调研结论（现状，已确认）

### 1.1 AI 会话（chat-panel + chat-store）
- 数据模型：`Conversation{id,title,deAiMode,inputDraft}` 与 `DisplayMessage{id,role,content,conversationId,references?}` 分离存储，靠 `conversationId` 关联，已有会话历史列表。
- prompt 组装入口：`handleSend(text)`（`chat-panel.tsx:387`），`onSend={handleSend}`（`:1535`）。三分支：
  - 章节编辑：直接读章节原文拼进 prompt（`:503-560`）
  - 章节生成：调 `buildContextPack`（context-engine，`:864`）
  - 普通对话：**自动检索流水线**——`searchWiki`→图扩展→选页面拼进 system prompt（`:734-880`）
- 持久化：`lib/persist.ts` 的 `saveChatHistory`/`loadChatHistory` 整会话落盘到 `.qmai/chat-history.json` + 每会话 `.qmai/chats/<id>.json`，`App.tsx:339-340` 启动恢复。
- 关键结论：普通对话上下文是**自动检索**得到，**无**「用户主动 @ 引用」机制；`ChatInput` 是 `<textarea>` 受控组件，`onSend` 只回传纯文本，**无 @ 解析、无 insert 接口**（`chat-input.tsx:35,304-308`）。

### 1.2 AI 大纲（outline-chat-panel + outline-chat-store）
- 与 AI 会话**完全独立**：独立 store/UI/`handleSend`，不复用 chat 组件。
- 数据模型：`OutlineChatConversation{id,title,messages[],modelId}` 内嵌消息，持久化 `<projectPath>/.qmai/outline-chats.json`，有 `loadFromDisk/saveToDisk`。
- prompt 组装：`handleSend`（`outline-chat-panel.tsx:365`）→ `loadOutlineContext(project.path)` 读大纲文件拼 system prompt（`:390,440`）。
- 关键结论：同样**无 @ 机制、无用户主动引用入口**。会话历史已有切换/删除。

### 1.3 章节与右键菜单（knowledge-tree + wiki-reader）
- 章节内容是磁盘 `.md`，靠 `readFile(path)`（`fs.ts:10`）读全文。
- 右键菜单 `pageMenu`（`knowledge-tree.tsx:1279-1388`）项只有：新建/重命名/移动/打开文件位置——**无「发送到 AI」项**。
- `wiki-reader.tsx` 纯只读渲染，**全项目无 `getSelection`/选区逻辑**。
- **全项目无「章节→对话/大纲」跨面板内容传递机制**。

### 1.4 可复用的现有逻辑（确认新基座不复用 `ChatInput` DOM，只复用纯逻辑）
- `chat-input-resize.ts`：纯计算模块——`clampResizableInputHeight`/`getResizeBoundsForElement`/`createResizeContext`/`resolveMaxHeightFromContext`。与 DOM 解耦，新基座直接 import 复用。
- `@/lib/keyboard-utils` 的 `isImeComposing`：IME 合成判断，新基座复用。
- `ui/dialog.tsx`：弹窗基座，`ReferencePickerDialog` 复用。

### 1.5 内容类别数据源（已确认）
- 记忆库：`<pp>/wiki/memory/*.md`（`memory-center.ts:286`、`story-extractor.ts:231`）
- 推演室：story-simulation，框架/推演结果存 `<pp>/.qmai/simulations/`（`framework-store.ts`）
- 章节：`<pp>/wiki/chapters/*.md`；大纲：`<pp>/wiki/outlines/*.md`
- AI 对话历史：`useChatStore.conversations`；AI 大纲历史：`useOutlineChatStore.conversations`
- 技能库：需在执行分支1前以 `skill-library-view.tsx` 确认确切数据源（待确认项）

---

## 二、目标与成功标准

**目标**：在 AI 会话与 AI 大纲两处面板建立统一的「@ 引用内容」机制，覆盖三个入口（章节右键发送、独立 @ 按钮弹窗、输入框 @ 快捷触发）。被引用内容在对话中**只显示标题**（内联芯片），AI 实际读取全文，并随会话持久化记忆，供后续提示词结合使用。

**芯片实现采用方案 B**：富文本内联芯片——重做一个支持 reference 的新输入组件基座，引用令牌是不可分割原子节点；老 `ChatInput` 能复用的逻辑（resize 计算、IME 判断）抽出来复用，**不在老组件上打补丁**。

**成功标准**：
1. 章节树右键可将整章以「显示标题、AI 读全文」方式送入 AI 会话/AI 大纲。
2. 独立 @ 按钮与输入框 @ 触发复用同一选内容弹窗，可选章节/记忆库/大纲/推演室/技能库/AI对话历史/AI大纲历史，支持多选。
3. 选定内容以内联芯片插入输入框（不可分割原子节点），提交时解析为全文注入 AI 请求。
4. 引用记忆随会话持久化；切换/重开项目后仍可读取历史对话内容（跨会话引用）。
5. AI 会话与 AI 大纲两处都具备上述能力，旧功能（自动检索、章节生成、续写等）不回退；老 `ChatInput` 现有 resize/IME/autosize 行为在新基座中保持一致。
6. 完成打包，更新日志记录，未提交 git（待用户确认后再提交）。

---

## 三、总体架构

新增一层「用户显式引用上下文」机制，与现有「自动检索上下文」并存：

```
[内容源providers] → [ReferencePickerDialog选内容] → [ReferenceToken令牌]
   → 富文本输入框内联为原子芯片节点 → 并存入会话.attachedReferences(持久化)
   → 提交时序列化芯片→resolve全文 → 注入 system prompt
```

三个入口（右键/按钮/@触发）共用同一弹窗与令牌体系；AI 会话与 AI 大纲各有独立注入点，共用 `reference` lib 与富文本输入组件。

---

## 四、数据结构设计（新增 `src/lib/reference/types.ts`）

```ts
export type ReferenceCategory =
  | "chapter" | "memory" | "outline" | "deduction"
  | "skill" | "ai-chat-history" | "ai-outline-history"

export interface ReferenceToken {
  id: string              // 唯一 id
  category: ReferenceCategory
  title: string           // 显示标题，如「第1章-无我绝响」
  path?: string           // 磁盘路径(章节/大纲/记忆/技能)
  refId?: string          // 历史会话 id(历史记录类)
  preview?: string        // 简短预览(可选，列表展示用)
}
```

**持久化挂载点**：
- `src/stores/chat-store.ts` → `Conversation` 增 `attachedReferences?: ReferenceToken[]`（会话级记忆）；`DisplayMessage` 增 `attachedReferences?: ReferenceToken[]`（消息级）。随 `.qmai/chats/<id>.json` 自动落盘，复用 `lib/persist.ts`。
- `src/stores/outline-chat-store.ts` → `OutlineChatConversation` 与 `OutlineChatMessage` 增 `attachedReferences?: ReferenceToken[]`。随 `.qmai/outline-chats.json` 落盘。
- 持久化结构存的是 `ReferenceToken`（含标题/路径/refId），**不存全文**——全文提交时现取，避免落盘膨胀与内容漂移。

---

## 五、内容类别与数据源（providers，新增 `src/lib/reference/providers.ts`）

| 类别 | 数据源 | 读取方式 |
|---|---|---|
| chapter | `<pp>/wiki/chapters/*.md` | 复用 `knowledge-tree` 的 `parsePageInfo` 列出 + `readFile` 取全文 |
| memory | `<pp>/wiki/memory/*.md` | 列目录 + `readFile`（参照 `memory-center.ts:286`、`story-extractor.ts:231`） |
| outline | `<pp>/wiki/outlines/*.md` | 列目录 + `readFile` |
| deduction | `<pp>/.qmai/simulations/` | 复用 `framework-store` 的框架与推演结果读取 |
| skill | 技能库 | 以 `skill-library-view.tsx` 实际数据源为准（待确认） |
| ai-chat-history | `useChatStore.conversations` | 直接读 store，展开该会话 messages |
| ai-outline-history | `useOutlineChatStore.conversations` | 直接读 store |

**API**：`listReferenceItems(category): Promise<{title, path?, refId?, preview}[]>`（实时读取）。`resolveTokenToText(token): Promise<string>`（按 category 分派取全文；历史记录类拼接该会话所有 messages）。

---

## 六、核心模块设计

1. `src/lib/reference/types.ts` — 类型定义（见上）。
2. `src/lib/reference/providers.ts` — `listReferenceItems(category)` 实时列出各类别内容。
3. `src/lib/reference/resolve.ts` — `resolveTokenToText(token)` 还原全文；`resolveTokensBatch(tokens)` 批量取文并拼装「用户引用的素材」块（含截断/预算控制）。
4. `src/components/reference/ReferencePickerDialog.tsx` — 统一选内容弹窗：左侧类别 Tab，右侧实时列表 + 多选 + 搜索 + 确认/取消。复用 `ui/dialog.tsx`。三个入口共用。
5. `src/components/reference/ReferenceChip.tsx` — 单个内联芯片（标题 + × 删除），作为富文本输入框的原子节点单元，也用于消息区只读展示。

### 6.1 富文本输入组件基座（方案 B 核心，新增 `src/components/reference/ReferenceInput.tsx`）

**设计要点**：
- 基于 `contenteditable` 的富文本输入容器，引用令牌渲染为**不可分割的原子芯片节点**（`contentEditable="false"` 的 span 包裹 `ReferenceChip`），光标无法进入芯片内部，删就整体删。
- 芯片节点与普通文本节点共存于一个编辑流；芯片之间/之后的普通文本即用户提示词。
- **复用现有纯逻辑**：`chat-input-resize.ts` 的 resize 计算（`clampResizableInputHeight`/`createResizeContext`/`resolveMaxHeightFromContext`）、`@/lib/keyboard-utils` 的 `isImeComposing`。新基座自带 autosize（按 contenteditable scrollHeight）与拖拽 resize（复用 resize 计算 + 新写 DOM 适配）。
- **关键能力**：
  - `onChange(plainText: string, tokens: ReferenceToken[])`：序列化编辑区为纯文本（芯片处产出占位标记 `@【标题】`）+ 当前所有芯片 tokens，供上层组装。
  - `insertTokens(tokens: ReferenceToken[])`：在光标处插入芯片节点（右键发送/按钮选择/快捷触发调用）。
  - `onAtTrigger`：检测用户键入「@」时回调（打开弹窗）。
  - IME 合成期不触发 @、不插入芯片；回车提交（非 Shift）。
- **与老 `ChatInput` 的关系**：老 `ChatInput` 保留不删（AGENTS.md：不删已有函数），AI 会话/大纲切换到新 `ReferenceInput`；老组件可保留供其他用途或后续清理，本规划不动它。

### 6.2 序列化与解析（新增 `src/lib/reference/tokenizer.ts`）
- `serializeContent(tokens: ReferenceToken[], plainText: string): string`：把芯片位置在纯文本里标为 `@【标题】`，用于持久化 user 消息内容（回看可读）。
- `extractTokensFromText(text: string, availableRefs: ReferenceToken[]): ReferenceToken[]`：从 `@【...】` 反查 availableRefs 还原 tokens（处理回退/重生成场景）。
- 注：常态下 tokens 由 `ReferenceInput.onChange` 直接给出（无需文本解析）；文本解析仅用于持久化消息回看/重生成。

---

## 七、三大功能落地拆解

### 功能一：章节右键发送到 AI 会话/AI 大纲
- `knowledge-tree.tsx` 的 `pageMenu`（:1279-1388）新增两项：「发送到AI会话」「发送到AI大纲」。
- 点击 → `readFile(章节path)` 取标题 → 构造 `ReferenceToken(category:"chapter")` → 写入目标 store 当前会话 `attachedReferences` → 调目标面板 `ReferenceInput.insertTokens([token])` 插入芯片 → 自动切换激活目标面板。
- 会话只显示章节名（芯片标题），AI 读全文。
- 消息区（`chat-message.tsx`/`outline-chat-panel.tsx` 消息渲染）增加引用芯片只读展示：`DisplayMessage.attachedReferences` 渲染为一排 `ReferenceChip`（无 ×）。
- 本阶段不做 wiki-reader 选区（需求粒度已定为整章标题+全文）。选区列为后续可选。

### 功能二：独立 @ 按钮
- chat 输入区（`chat-panel.tsx:1535` 附近）与 outline 输入区各加一个 @ 图标按钮。
- 点击 → 打开 `ReferencePickerDialog` → 多选确认 → `ReferenceInput.insertTokens(tokens)` 插入内联芯片 + 写入会话 `attachedReferences`。

### 功能三：@ 快捷输入触发
- `ReferenceInput` 的 `onAtTrigger` 回调打开同一 `ReferencePickerDialog`（默认类别）。
- 选择后 `insertTokens(tokens)` 插入芯片并吞掉触发的「@」。复用功能二弹窗。

### F4. 引用解析与 AI 注入（核心机制）
- **提交时**：`ReferenceInput.onChange` 给出 `(plainText, tokens)`；合并会话级 `attachedReferences`（跨消息持续）+ 本次 tokens → `resolveTokensBatch` 取全文 → 拼成「用户引用的素材」块注入 system prompt。
- **注入点**：
  - AI 会话 `handleSend`（`chat-panel.tsx:387`）三分支（编辑/章节生成/普通对话）各自 system prompt 拼装处接入引用素材块。
  - AI 大纲 `handleSend`（`outline-chat-panel.tsx:365/440`）在 `loadOutlineContext` 之外附加引用素材块。
- user 消息落库时携带 `attachedReferences`（消息级）。
- **跨会话引用**：category `ai-chat-history`/`ai-outline-history` 的 token，`resolveTokenToText` 读取该历史会话全部 messages 拼为对话文本注入。大批量需截断/摘要防撑爆上下文。

---

## 八、分支策略（遵循 AGENTS.md）

| 分支 | 拼音名 | 功能 | 依赖 |
|---|---|---|---|
| 1 | `yinyongjizhi` | @ 引用地基：types/providers/resolve/tokenizer + 弹窗 + 芯片 + 富文本输入基座 `ReferenceInput`（复用 resize/IME） + store 字段 + chat/outline 切换到新输入组件 + 注入骨架 | 无 |
| 2 | `zhangjieyoujianfasong` | 章节右键「发送到AI会话/大纲」+ 会话内引用消息渲染 | 分支1 |
| 3 | `atrukou` | 独立 @ 按钮 + 输入框 @ 快捷触发（复用分支1弹窗 + insertTokens） | 分支1 |

每分支根目录建 `<拼音名>-分支说明.md`，记录使用要求与每次更新内容、是否提交。main 保持稳定可打包；每分支完成后跑源码+旧功能回归测试→打包→记录更新日志→再考虑合并。

---

## 九、文件改动清单

**新增**：
- `src/lib/reference/types.ts`、`providers.ts`、`resolve.ts`、`tokenizer.ts`
- `src/components/reference/ReferencePickerDialog.tsx`、`ReferenceChip.tsx`、`ReferenceInput.tsx`
- `yinyongjizhi-分支说明.md`、`zhangjieyoujianfasong-分支说明.md`、`atrukou-分支说明.md`
- 对应 spec 测试（`*.spec.tsx`，遵循项目既有测试风格；重点测 `ReferenceInput` 的序列化/插入/IME/删除原子性、tokenizer 解析、resolve 全文还原）

**修改**：
- `src/stores/chat-store.ts` — `Conversation`/`DisplayMessage` 增 `attachedReferences`
- `src/stores/outline-chat-store.ts` — `OutlineChatConversation`/`OutlineChatMessage` 增 `attachedReferences` + action
- `src/components/chat/chat-panel.tsx` — handleSend 注入引用素材块；输入区改用 `ReferenceInput`；消息渲染引用芯片；@ 按钮
- `src/components/chat/chat-message.tsx` — 引用芯片只读展示
- `src/components/sources/outline-chat-panel.tsx` — handleSend 注入；输入区改用 `ReferenceInput`；@ 按钮；@ 触发；消息渲染
- `src/components/layout/knowledge-tree.tsx` — pageMenu 增「发送到AI会话」「发送到AI大纲」两项
- i18n（`src/i18n/zh.json` 等）— 新增中文文案

**不改**：`src/components/chat/chat-input.tsx`（老组件保留，不删不改）。

---

## 十、验证方案
1. 启动源码（`pnpm tauri dev` 或项目命令）。
2. 旧功能回归：AI 会话普通问答、章节生成/续写、章节编辑模式、AI 大纲生成、章节树右键原菜单项、老输入组件的 resize/IME 行为在新基座一致。
3. 新功能：
   - 右键发送→会话内联芯片显示标题而非全文→AI 回复体现读到全文。
   - @ 按钮弹窗列出各类别实时内容；多选→内联芯片插入。
   - @ 快捷触发；中文输入法合成期不误触发。
   - 芯片原子性：光标进不去、删就整体删、复制粘贴不损坏。
   - 切换/重开项目引用仍在；跨会话引用历史对话内容能被 AI 读到。
   - token 预算：引用过多/全文过大时截断不报错。
4. `pnpm typecheck` + `pnpm test`（含新增 spec）+ `pnpm lint`。
5. 打包（沿用项目命令，版本号不变），更新 `GenxinLOG/更新日志.md`。

---

## 十一、风险与限制
- **富文本输入回归面大**：`ReferenceInput` 是新基座，IME/光标/选区/粘贴/autosize 需充分测试，是本规划最大风险点。缓解：分1内独立建组件并写足 spec，先单测再接入面板；接入后面对面回归输入交互。
- **contenteditable 跨 WebView 差异**：Tauri WebView 的 contenteditable 行为需实测（光标定位、粘贴去格式）。缓解：限定关键路径行为，异常有兜底。
- **技能库数据源**：需在执行分支1前从 `skill-library-view.tsx` 确认确切技能列表来源。
- **token 预算**：引用全文注入增加 prompt 长度，需限制单次引用数量/全文截断，避免超 `maxContextSize`（复用 `computeContextBudget` 思路）。
- **历史会话全文**很大时：跨会话引用需截断或摘要，防止撑爆上下文。
- 三分支顺序执行，分支2/3依赖分支1地基稳定。
- 老 `ChatInput` 保留不删，可能产生短暂双组件并存；分支1接入完成后老组件无引用，后续可按 AGENTS.md 经用户同意后清理。

---

## 十二、本次不涉及
- 未提交 git（待用户明确要求）。
- 不上传 GitHub、不改版本号（沿用当前 2.2.x）。
- wiki-reader 选区能力列为后续可选，本规划不含。
- 不删除、不改动老 `chat-input.tsx`。
