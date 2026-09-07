# v0.2.22

## 修复
- **普通（TipTap 原生）表格标题输入不可编辑后丢失**：`<input>` 之前是 `defaultValue` 无 `onChange`，自动保存只写 `content`，标题永不落盘。改为受控输入 + 500ms 防抖：内存笔记走 `updateNote` 写 store；本地文件笔记走新增的 `saveNoteTitle` 写入 `.dunote-meta.json` 的 `titles` 字段（v2 schema，向后兼容 v1），并同步 `localNotes` 让侧栏立即显示新标题。切笔记/卸载前会 flush 待提交标题。扫描本地笔记时优先取 meta 自定义标题，回退到文件名。
- **macOS 普通表格中文 IME 录入仍跳开头+换行**（v0.2.21 仍未根治）：v0.2.21 的 6 层防御全部作用在 `keydown` 上，但 macOS WKWebView 在 IME 提交候选时，段落换行常以 `beforeinput`（inputType=`insertParagraph`/`insertLineBreak`/`insertFromComposition`）派发，再被 ProseMirror `handleTextInput` 转成单元格内 `splitBlock`。本次下沉到 ProseMirror 事务层——新增 `ImeGuard` 扩展（`src/extensions/imeGuard.ts`），其 `filterTransaction` 在 IME 宽限期（含扩展窗口 2000ms）内，若事务在表格单元格内新增段落则直接 drop 事务，从根上覆盖 keydown/beforeinput/handleTextInput 任一通道。同时 `beforeinput` 钩子新增前置拦截 `insertParagraph`/`insertLineBreak`/`insertFromComposition`，双保险。`[IME-DIAG]` 诊断日志更新。
