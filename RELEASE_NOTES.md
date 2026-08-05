# v0.2.19

## 修复
- 普通（TipTap 原生）表格中文输入法 macOS 跳格：v0.2.18 的 IME 宽限期只拦截 `Tab`/`Enter`，漏掉 macOS 用「空格」确认候选的确认键（`isComposing=false` 且 `keyCode=32`），导致空格进入 ProseMirror 干扰 IME 提交、光标跳格。`NoteEditor` 的宽限期拦截名单补上 ` `（空格），返回 true 仅阻止 ProseMirror keymap，IME 仍正常收键。
- 笔记导出 PDF 表格右侧被截：TipTap 可调列宽表格在 `<col>` 上写 `style="width: NNNpx"`，浏览器按 `<col>` 宽度之和分配列宽，列宽之和超出 794px 容器宽 → html2canvas 画布比 A4 页宽 → 右侧被切。`exportNote.ts` 新增 `normalizeTablesForExport` 剥掉 `table/colgroup/col` 的显式宽度；导出样式升级为 `table { table-layout:fixed; width:100% !important }` + 单元格 `word-break:break-word; overflow-wrap:anywhere`，表格等宽分配、长内容自动换行，全部列完整可见。HTML 导出共用同一逻辑，一并受益。
