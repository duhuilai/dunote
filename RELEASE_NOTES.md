# v0.2.10

> 修复点击「恢复历史」拉取数据后软件白板 + 增加顶层 Error Boundary。

## 修复恢复历史导致白板
- 现象：点击「恢复历史」打开历史面板拉取 git 数据后，整个应用变白板。
- 根因：原 `handleOpenHistory` 用 `Promise.all` 并发读取所有历史版本的 git readBlob，大量并发在 Tauri/WebView 下可能卡死或触发未捕获异常；`HistoryModal` 的恢复/预览、`NoteEditor.setContent` 均无 try/catch；整棵组件树没有 Error Boundary，任何一处异常导致全局白板。
- 修复：
  - 新建 `ErrorBoundary.tsx`，在 `App.tsx` 包裹主内容区，捕获渲染异常后显示错误页面而非白板；
  - `NoteEditor.handleOpenHistory` 整体加 try/finally，把 `Promise.all` 并发读取改为串行 `for...of`（单个失败跳过），确保无论成功与否都 `setShowHistory(true)`；
  - `HistoryModal.handleRestore` / `handlePreview` 加 try/catch，restore 后关闭历史面板；
  - `NoteEditor` reload effect 里 `editor.commands.setContent(content)` 加 try/catch，解析异常时回退到空段落。
