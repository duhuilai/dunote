# v0.2.8

> 修复恢复历史预览不显示内容 + 文件/文件夹删除增加确认弹窗。

## 修复恢复历史预览空白
- 现象：点击历史记录的「预览」按钮，右侧预览面板不显示内容（空白）。
- 根因：git 备份模式下历史条目的 `content` 字段为空（内容存储在 git commit 里，只在恢复时才通过 `readVersion` 从 git 读取），而预览按钮直接用 `previewHistory.content` 渲染，导致空白。
- 修复：`HistoryModal.tsx` 新增 `handlePreview()`——点「预览」时先检查 `content` 是否为空，若空且有 `oid/repoDir/relPath`，则调 `readVersion` 从 git 读取真实内容；加了加载旋转状态，内容为空时显示占位文字。

## 文件/文件夹删除增加确认弹窗
- 现象：删除笔记或文件夹时没有确认提示，容易误删。
- 根因：删除操作使用原生 `confirm()`，在 Tauri WebView 中可能不弹出。
- 修复：新建 `src/components/ui/ConfirmDialog.tsx`——可复用的确认弹窗组件（`ConfirmProvider` + `useConfirm()` hook），支持 `danger` 红色样式、自定义标题和按钮文字；`App.tsx` 根部包裹 `ConfirmProvider`；`NotesPage` 的 `handleDeleteNote` 和 `handleDeleteFolder` 改用自定义确认弹窗，错误提示也从 `alert()` 改为 `showToast()`。
