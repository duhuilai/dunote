# v0.2.5

> 修复「生成本地版本」仍报 forbidden path（.git 权限开关位置错误），以及智能表格内容无法选中复制。

## 一、修复生成历史仍报 forbidden path（requireLiteralLeadingDot 位置修正）
- 现象：升级到 v0.2.4 后，点击「生成本地版本」仍报 `forbidden path: <仓库根>/.git/objects/...`。
- 根因：上一版把 `requireLiteralLeadingDot: false` 放在了 `capabilities/default.json` 的 `fs:scope` 对象里，但该全局开关真正生效的位置是 **`tauri.conf.json` 的 `plugins.fs`**，所以 capability 改动没有实际解决问题。
- 修复：在 `src-tauri/tauri.conf.json` 的 `plugins` 中加入 `"fs": { "requireLiteralLeadingDot": false }`，允许 fs 作用域匹配 `.git` 等隐藏目录。
- 涉及文件：`src-tauri/tauri.conf.json`。

## 二、修复智能表格内容无法选中复制
- 现象：智能表格里的文本单元格无法用鼠标选中、无法复制。
- 根因：`DataTableView` 根节点 `NodeViewWrapper` 上设置了 `userSelect: 'none'`，导致整个表格继承该样式、文本不可选中。
- 修复：移除根节点的 `userSelect: 'none'`；列宽拖拽时仍通过 `document.body.style.userSelect = 'none'` 临时禁用选择，不影响拖拽体验。
- 涉及文件：`src/components/table/DataTableView.tsx`。
