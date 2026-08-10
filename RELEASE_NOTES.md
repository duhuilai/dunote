# v0.2.21

## 新增
- **标题层级扩展到 H1–H6**：工具栏在 H3 后追加 H4/H5/H6 三个标题按钮（lucide-react 自带图标），StarterKit 配置 `heading.levels` 扩展到 `[1..6]`；编辑器、预览、导出 PDF/HTML 的 h4/h5/h6 样式同步补齐（h4 14pt、h5 13pt、h6 12pt，宋体栈，半粗）。

## 优化
- **工具栏字体/字号实时反映当前光标位置**：字体、字号下拉触发按钮现在显示光标所在文本的实际字体/字号标签（无格式时回退「字体/字号」）；下拉菜单中对应当前值项高亮（主色底+主色字+加粗）。响应式订阅基于 `@tiptap/react` 的 `useEditorState`（deepEqual 比较，未变化不重渲），替代手写的 `selectionUpdate` + `setState`。

## 修复
- **普通表格 macOS 中文 IME 录入跳开头 + 换行**（v0.2.20 后仍偶发）：macOS WKWebView 的 IME 合成结束与确认键（Enter/Space/Tab）到达间隔在部分输入法下会超过 600ms 宽限窗口，导致 keymap 的 `splitBlock` 在确认键上执行。本次加宽主宽限期 600→1200ms，并新增 2000ms 扩展宽限期——仅拦截导航键（Tab/Enter/Space），不误吞普通字符；合成时间戳在超时后保留供扩展窗口判断。仍带 `[IME-DIAG]` 诊断日志，若复现请回报 dtMs 与按键。
