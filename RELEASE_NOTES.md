# v0.2.9

> 修复 v0.2.8 的 TS 编译错误（NotesPage 中 `showToast` 未定义）。

## 修复
- v0.2.8 的 `handleDeleteNote` 和 `handleDeleteFolder` 使用了 `showToast`，但该变量只在 `ContextMenu` 子组件中定义，未在 `NotesPage` 的 store hook 中声明，导致 TypeScript 编译失败。
- 修复：在 `NotesPage` 中新增 `const showToast = useAppStore((s) => s.showToast)`。
