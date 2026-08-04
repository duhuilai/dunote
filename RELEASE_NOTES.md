# v0.2.13

> 修复智能表格文本录入时光标跳到开头、自动保存多出换行的问题。

## 修复
- 现象：在智能表格文本/链接单元格录入文字后，① 光标跳到文字最前面；② 自动保存导致单元格多出一行空白。
- 根因：`CellEditor` 是受控组件，每次按键 `onChange` → `setCell` → `updateAttributes`（ProseMirror 事务）→ NodeView 重渲染 → React 重设 textarea/input 的 `value` → 光标重置到开头；同时重渲染过程中 `autoSize` 的 `height='auto'` + `scrollHeight` 读取时机错误，产生多余的空白行。
- 修复：`CellEditor` 为 text/url 类型引入本地状态，输入时只更新本地值（不触发 ProseMirror 事务），失焦（onBlur）时才提交到文档并触发自动保存；非聚焦时从属性同步以支持撤销/重做、历史恢复等外部更新。
