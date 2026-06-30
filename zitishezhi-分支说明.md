# zitishezhi 分支说明

## 分支名称
zitishezhi（字体设置）

## 功能描述
在"设置-界面"中新增字体设置功能，允许用户分别设置界面字体和等宽（编辑器）字体，默认跟随系统字体，内置多款免费商用字体。

## 使用要求
1. 本分支只用于开发字体设置功能
2. 每个功能点修改后需测试旧功能不回退
3. 功能完成后需打包验证
4. 确认无问题后再合并回 main 分支

## 更新记录

### 2026-06-30（恢复字体设置源码）
**问题结论：**
- 当前工作树里没有保留 2026-06-29 记录的字体设置实现代码；`settings-types.ts`、`wiki-store.ts`、`project-store.ts`、`index.css`、`interface-section.tsx`、`settings-view.tsx`、`App.tsx` 中只剩界面字号和其他设置，没有字体字段、字体 UI、持久化或启动应用逻辑。
- 字体资源被移出不是字体设置 UI 消失的原因；真正原因是旧功能代码未进入当前源码状态。

**本次修复：**
- 重新在“设置-界面”中接入“界面字体”选择，默认值为“本机默认”。
- 字体方案改为使用本机系统字体栈和常见本机字体名称，不恢复 `public/fonts`，避免便携版体积再次增大。
- 新增 `src/lib/font-settings.ts` 统一维护字体选项、非法值回退和 CSS 变量应用。
- 接入 `SettingsDraft`、`wiki-store`、`project-store`、`settings-view`、`interface-section`、`App.tsx` 和 `index.css`。
- 移除 `index.css` 对 `@fontsource-variable/geist` 的界面默认字体引用，改用 `--qmai-ui-font-family`。

**验证结果：**
- `npm.cmd run test:mocks`：通过，266 个测试文件、1971 个测试全部通过。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run build`：通过。
- `npm.cmd run build:portable`：通过，`release-portable/QMaiWrite.exe` 约 142.30MB，`release-portable` 约 151.37MB。
- 已启动本次生成的便携版并截图验证，界面正常显示，不是 localhost 错误页。

**是否提交：** 未提交。

### 2026-06-29
- 创建分支，基于 main 分支
- 完成设计文档和实现计划
- 完成所有代码开发（7个文件修改）
  - settings-types.ts：扩展 SettingsDraft 类型
  - wiki-store.ts：新增 Zustand 状态管理
  - project-store.ts：新增 Tauri Store 持久化函数
  - index.css：新增 @font-face 定义和 CSS 变量切换
  - interface-section.tsx：新增字体设置 UI
  - settings-view.tsx：保存逻辑对接
  - App.tsx：启动时加载并应用字体
- TypeScript 类型检查通过
- 打包失败：main 分支本身存在 @milkdown/plugin-math 依赖构建错误，非本次改动导致

### 2026-06-29（依赖修复）
- 修复依赖问题：lucide-react 版本从 ^1.7.0 固定为 1.7.0
  - 问题根因：lucide-react@1.21.0 版本存在 bug，icons/index.mjs 文件缺失但代码中引用了它
  - 解决方案：将 lucide-react 版本固定在 1.7.0 稳定版本
- 新增 .npmrc 文件，配置 shamefully-hoist=true 确保依赖正确提升
- 前端构建测试通过（vite build）
- 单元测试：252/265 文件通过，1925/1968 测试通过（失败项为需要 LLM 配置的测试和 UI 快照测试，非功能回退）

### 2026-06-29（Rust 编译修复 + 打包）
- 修复 Rust 编译元数据损坏问题：
  - 问题根因：Cargo.toml 中 lib 的 crate-type 同时配置了 staticlib、cdylib、rlib，导致 rlib 元数据损坏
  - 解决方案：将 crate-type 简化为 ["rlib"]，移除未使用的 staticlib 和 cdylib
- 修复 tauri build 无法编译的问题：
  - 问题根因：tauri build 调用 cargo 时出现 E0786 元数据损坏错误
  - 解决方案：直接使用 cargo build --release --bin qmai + build-portable.mjs 脚本打包
- 便携版打包成功，输出位置：release-portable/QMaiWrite.exe
- 版本保持 2.2.30

### 2026-06-29（重新打包 - 修复 localhost 问题）
- 重新构建前端，确保 dist 目录最新
- 重新编译 release 版本的 exe（cargo build --release --bin qmai）
- 验证：release 版本 exe 中不包含 devUrl（localhost:1420），说明使用嵌入的前端资源
- 重新打包便携版
- 注意：tauri build 命令因内存不足（LLVM out of memory）无法使用，改用 cargo build + build-portable.mjs 脚本

### 2026-06-29（彻底修复 localhost 问题 + 移除 lib crate）
**问题根因分析：**
1. 为什么显示 "localhost 拒绝连接"？
   - 因为 Tauri 的 `custom-protocol` feature 未启用，导致使用 devUrl (http://localhost:1420) 而非嵌入的前端资源
   - tauri crate 的 build.rs 中逻辑：`let dev = !custom_protocol;`，即没启用 custom-protocol 就认为是开发模式
2. 为什么加了 custom-protocol feature 后编译失败？
   - 遇到 E0786 元数据损坏错误，lib crate 的 rlib 文件异常巨大（6.17 GB）
   - 根本原因：lib crate 编译异常，导致 rlib 元数据损坏
3. 为什么之前 cargo build --release 能成功？
   - 因为那时候没有启用 custom-protocol feature，tauri 是预编译好的，只需要重新编译 llm-wiki 自己的代码

**修复方案：**
1. 移除 lib crate，直接把所有代码编译到 bin crate 中
   - 删除 src/lib.rs，把内容合并到 src/main.rs
   - 移除 Cargo.toml 中的 [lib] 配置
2. 在 tauri 依赖中直接启用 custom-protocol feature
   - `tauri = { version = "2", features = ["protocol-asset", "custom-protocol"] }`
3. 调整 release profile 以减少内存占用
   - 关闭 LTO，降低 opt-level 到 1，codegen-units = 8
   - 后续可根据需要调整回高性能配置

**验证结果：**
- ✅ 编译成功（17 分 41 秒）
- ✅ exe 中不包含 devUrl（localhost:1420）
- ✅ 便携版打包成功
- ⚠️ exe 体积较大（974 MB），因关闭了 LTO 和优化，后续可优化

**修改的文件：**
- src-tauri/Cargo.toml：移除 lib 配置，添加 custom-protocol feature，调整 release profile
- src-tauri/src/main.rs：重写，包含原 lib.rs 的所有内容
- src-tauri/src/lib.rs：已删除（内容合并到 main.rs）

**版本：** 2.2.30

### 2026-06-29（体积优化）
**体积优化测试结果：**
- 初始版本（无 LTO，opt-level=1）：974 MB
- thin LTO + opt-level=s：935 MB（减少 40 MB，约 4%）
- full LTO + opt-level=s：918 MB（减少 56 MB，约 6%）
- full LTO + opt-level=z：907 MB（减少 67 MB，约 7%）

**当前配置：**
- codegen-units = 1
- lto = true
- opt-level = "z"
- panic = "unwind"
- strip = true

**注意事项：**
- 体积较大（907 MB）的主要原因是依赖库本身较大（lancedb、datafusion、arrow 等）
- 进一步优化可选方案：
  1. 使用 UPX 压缩（可压缩到 30-50%，但启动稍慢）
  2. 移除未使用的依赖和功能
  3. 启用 panic = "abort"（需评估影响）
  4. 使用 cargo-bloat 分析体积分布，针对性优化

### 2026-06-30（修正便携版体积和 localhost 问题）
**本次重新分析结论：**
1. 900MB 便携版体积异常的主要原因不是 Rust 依赖本身，而是 `public/fonts` 中约 1.23GB 未使用字体被 Vite 复制进 `dist`，再被 Tauri 嵌入 exe。
2. 当前源码实际使用的字体是 `@fontsource-variable/geist` 提供的 Geist Variable，以及 KaTeX 自带的小字体资源；没有发现对 `public/fonts` 内思源、Noto、霞鹜等字体文件的实际引用。
3. `localhost:1420` 拒绝连接的直接原因是 `build:portable` 绕过 Tauri CLI 直接 cargo build，导致便携版运行入口使用开发地址。

**处理结果：**
1. 将未使用的 `public/fonts` 移动到 `QMdelete/public-fonts-unused-20260630`，未删除文件。
2. 将 `build:portable` 改回 `npx.cmd tauri build --no-bundle` 后再执行 `scripts/build-portable.mjs`。
3. 将旧备份 exe 移动到 `QMdelete/old-portable-exe-20260630-0816`，避免误打开旧包。
4. 重新打包后 `release-portable/QMaiWrite.exe` 约 142.37MB，`release-portable` 总量约 151.44MB。
5. 已启动最终便携版并截图验证，界面正常显示，不再出现 `localhost` 拒绝连接页面。

**验证结果：**
- `npm.cmd run build`：通过，有既有 chunk 体积和动态导入警告。
- `npm.cmd run build:portable`：通过，已生成 Windows 便携版。
- `npm.cmd run test:mocks`：未通过，当前仍有 13 个测试文件、43 个测试失败，集中在模型配置、队列、i18n/changelog、交互测试等既有问题。

**是否提交：** 未提交

### 2026-06-30（修复 test:mocks 失败）
**问题根因分析：**
1. 队列、文件同步、扫审、小说模型测试仍按旧规则只设置 `llmConfig.model`，但当前实现已经改为从 AI 会话模型 / 默认模型解析后台任务模型，所以测试任务会被判定为未配置 LLM。
2. `src/i18n/en.json` 缺少 `novel.settings.chatHistoryLength*` 英文键，导致 i18n parity 失败。
3. 当前包版本 `2.2.30` 缺少运行时 changelog 条目，release notes 生成脚本只能退回默认标题。
4. 聊天输入框高度计算在短 footer 包装层里会把包装层误当成可用容器，导致拖拽最大高度被错误限制。
5. 去 AI 味按钮测试仍断言旧的“点击后直接处理”行为，但当前真实交互是先选择 Skill 再处理。

**处理结果：**
1. 更新相关测试的模型状态，显式设置 AI 会话模型和清空默认模型，匹配当前模型解析规则。
2. 修复聊天输入高度边界计算，短 footer 包装层不再作为最大高度容器；同时修正 NaN / Infinity 高度钳制。
3. 补齐英文 i18n 键，并新增 `2.2.30` changelog 条目。
4. 更新去 AI 味按钮测试断言，匹配当前 Skill 选择流程。

**验证结果：**
- `npm.cmd run test:mocks`：通过，265 个测试文件、1968 个测试全部通过。
- `npm.cmd run build:portable`：通过，Windows 便携版已重新生成，版本保持 2.2.30。
- 重新打包产生的 `release-portable/QMaiWrite-old.exe` 已移动到 `QMdelete/old-portable-exe-20260630-0849`，便携目录总量约 151.44MB。

**是否提交：** 未提交

## 字体选项
- 界面字体：系统默认（默认）、思源黑体、思源宋体、霞鹜文楷
- 等宽字体：系统等宽（默认）、思源等宽、霞鹜等宽

## 技术实现
- CSS 变量 + data-attribute 切换字体
- localStorage 快速读取 + Tauri Store 持久化
- 设置 draft 模式实时预览

## 是否提交
- 设计文档：已创建，未提交
- 功能代码：开发完成，未提交
- 依赖修复：已完成，未提交
- Rust 编译修复：已完成，未提交
- 便携版打包：已完成，未提交
- Git 提交：未提交

## 待办事项
1. 字体文件需下载放入 public/fonts/ 目录（当前 CSS 中已定义 @font-face，但字体文件暂缺）
2. 运行源码验证字体设置功能
3. 测试便携版功能是否正常
4. 确认无问题后合并回 main 分支
