# v0.2.11

> 修复恢复历史报 React error #310（Hooks 调用顺序违反）。

## 修复
- 现象：点击「恢复历史」报 `Minified React error #310`（Rendered more hooks than during the previous render）。
- 根因：`HistoryModal.tsx` 中 `useCallback(handlePreview)` 写在 `if (!showHistory) return null` 之后。当 `showHistory` 从 false 变 true 时，React 检测到 hooks 数量不一致（3→4）直接崩溃。
- 修复：把 `useCallback` 移到 early return 之前，确保每次渲染 hooks 调用顺序一致。
