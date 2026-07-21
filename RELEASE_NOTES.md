# v0.2.4

> 修复「生成本地版本」因 Tauri 能力限制 `.git` 目录而报错，以及重新打开笔记时智能表格行高未自适应。

## 一、修复生成历史报 forbidden path（.git 目录被 Tauri 能力拒绝）
- 现象：点击「生成本地版本」报错 `forbidden path: <仓库根>/.git/objects/...`，但普通笔记保存正常。
- 根因：Tauri v2 的 fs scope glob 在 Unix/macOS 上默认 `requireLiteralLeadingDot: true`，即 `**/*` **不匹配以 `.` 开头的路径段**（`.git` 被排除）。git 适配器必须读写 `.git` 内部文件，所以被能力层拒绝；普通笔记保存不访问 `.git`，因此正常。
- 修复：`src-tauri/capabilities/default.json` 中将 `fs:scope` 由数组形式改为对象形式，增加 `"requireLiteralLeadingDot": false`，允许访问隐藏目录。
- 涉及文件：`src-tauri/capabilities/default.json`。

## 二、修复智能表格重新打开笔记时行高未自适应
- 现象：重新打开含有智能表格的笔记，文本单元格行高未撑开，多行文本被截断。
- 根因：`table-layout: fixed` 下，列宽要在父 table 完成 layout 后才最终确定；原 `useLayoutEffect([value, column.width])` 在 mount 时按未 settle 的宽度算出单行高度，此后列宽定窄但高度未重算。
- 修复：`src/components/table/DataTableView.tsx` 的文本单元格在原有 `useLayoutEffect` + `onInput` 基础上，新增 `ResizeObserver` 监听 `textarea` 自身宽度变化（只响应宽度、忽略高度，避免循环），列宽 settle 后自动重算 `scrollHeight` 撑高。
- 涉及文件：`src/components/table/DataTableView.tsx`。
