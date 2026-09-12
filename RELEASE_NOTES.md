# v0.2.24

紧急修复 v0.2.22 引入的回归：**普通（TipTap 原生）表格插入行/列失效**。

## 修复
- **表格无法插入列或行（v0.2.22 回归）**：`ImeGuard` 有两处叠加缺陷，导致守卫长期误拦正常操作。
  1. **守卫永不失效**：`NoteEditor` 只调用了 `imeGrace.arm()`，从未调用 `imeGrace.end()`，而 `isInGrace()` 的第一句是 `if (this.composing) return true`。结果是只要用输入法打过一次中文，`composing` 就永久为 `true`，宽限期再也不会过期，此后所有匹配拦截条件的事务都被丢弃。
  2. **插入行/列被误判为 IME 换行**：`isCellParagraphSplit` 只比较「单元格内段落数是否增加」。插入行或插入列同样会新增带段落的单元格，于是被当成 IME 提交产生的 `splitBlock` 而丢弃。

  对应修正：
  - `isInGrace()` 改为**严格按 `lastTs` 时间收敛**（合成中用 `IME_GRACE_MS` 短窗、结束后用 `IME_EXTENDED_GRACE_MS` 扩展窗），即使 `composing` 标志因漏调 `end()` 而卡住，守卫也会按时失效。
  - `armComposing()` 的合成态定时器到点时调用 `imeGrace.end()`，让 React 侧 `composingRef` 与模块级状态保持同步。
  - `isCellParagraphSplit` 改为同时统计**单元格数量**：单元格数发生变化即判定为结构性编辑（插入/删除行或列），一律放行；只有「单元格数不变、但单元格内段落数增加」才认定为 IME 的 `splitBlock` 并拦截。

## 影响范围
- 该回归同时影响 Windows 与 macOS（两者用输入法输入中文都会触发同样的状态卡死）。
- 智能表格（`DataTable`）不受影响：它是 atom 节点，内部不产生 `tableCell`，不在 `ImeGuard` 的判定路径上。
- 原 macOS IME「光标跳到段首 + 多出空行」的修复效果保留：IME 在既有单元格内拆出段落仍会被拦截。
