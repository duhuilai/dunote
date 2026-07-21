# v0.2.3

> 修复「生成历史」备份失败与「智能表格」多行文本被截断两个问题。

## 一、修复生成历史（git 真实提交备份）报错
- 现象：点击「生成本地版本」报错 `Could not find <相对路径>.html`，但普通笔记保存正常。
- 根因：`src-tauri/capabilities/default.json` 漏配 `fs:allow-stat` / `fs:allow-lstat` / `fs:allow-read-file`，导致 git 适配器执行 `fs.lstat/readFile` 时被 Tauri 能力层拒绝（返回 `command stat not found`），而错误翻译逻辑把含 "not found" 的权限错误误判成 `ENOENT` → isomorphic-git 抛出 `NotFoundError(<相对路径>)`，伪装成「文件找不到」。
- 修复：
  - `default.json` 补 `fs:allow-stat` / `fs:allow-lstat` / `fs:allow-read-file`，备份流程恢复正常。
  - `src/utils/gitFs.ts` 的 `translateError` 增加权限类错误识别（`command`/`not allowed`/`denied`/`permission` → `EPERM`），避免今后把权限错误误判为文件缺失。
- 涉及文件：`src-tauri/capabilities/default.json`、`src/utils/gitFs.ts`。

## 二、修复智能表格行高未随文本自适应、文本被截断
- 现象：文本单元格内容较多时，行高未撑开，多行文本被裁切显示不全。
- 根因：文本单元格用 `<textarea>` 自动撑高，但原 `useEffect` 仅依赖 `[value]`，列宽被拖窄或初始定宽后文字需要更多行时，高度停留在旧值且 `overflow:hidden` 把文本裁掉。
- 修复：`src/components/table/DataTableView.tsx` 中将自动撑高改为 `useLayoutEffect`（绘制前重算，避免闪烁），依赖加入 `column.width`；并抽出 `autoSize` 挂到 `onInput`，输入与拖拽列宽时即时重算高度。
