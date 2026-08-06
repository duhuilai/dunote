# v0.2.20

## 新增
- **普通表格支持多行/多列插入**：「插入」下拉菜单增加数量选择器（1–100），「上方插行/下方插行/左侧插列/右侧插列」每项按钮执行对应数量次插入，菜单项右侧显示 `×N` 提示，所见即所得。
- **智能表格「新增一行」快捷按钮**：表格滚动区下方新增虚线边框「+ 新增一行」按钮，点击在末尾追加一行，hover 高亮。
- **智能表格「插入」菜单重构**：改为「方向选择（2×2 网格）→ 数量选择 → 确认插入」三步流程；方向按钮带选中高亮，底部大 `确认插入` 按钮，避免误点。

## 修复
- **智能表格「插入」菜单被裁剪**：菜单由 `position:absolute` 改为 `fixed` + `createPortal`（挂 body），配合按钮 `getBoundingClientRect` 定位，不再受外层 `overflow:hidden` 容器遮挡。
- **普通（TipTap 原生）表格 macOS 中文 IME 跳格/换行**（v0.2.18）：v3 加固，600ms 宽限期 + `beforeinput`/`input` 续期 + 读 ProseMirror 内部 `view.composing`，解决 WKWebView 时序差异。
- **普通表格 macOS 空格确认**：v3 宽限期补拦截 ` `（空格），覆盖 macOS 中文输入法空格确认场景。
- **笔记导出 PDF 表格右侧被截**：`normalizeTablesForExport` 剥掉 TipTap 生成的 `<col>` 显式宽度；导出样式升级为 `table-layout:fixed; word-break:break-word`，全部列完整可见。

## 默认排版
- **正文**：宋体（SimSun）小四（12pt），行距 1.5。
- **一级标题**：黑体（SimHei）三号（16pt）加粗。
- **二/三级标题**：宋体（SimSun）三号（16pt）半粗。
- 字体栈跨平台回退：宋体→Songti SC(mac)/Source Han Serif；黑体→Heiti SC(mac)/PingFang SC。Windows 用 SimSun/SimHei，macOS 用对应中文字体。
- 编辑器 + 导出 PDF/HTML + 历史预览 三处排版一致。

## 字号选择器
- 工具栏「字号」下拉由原 12 个数字字号（小八/小九/十号…四十八）升级为 **16 个中文字号标准**（GB/T 9851）：初号(42pt)、小初(36pt)、一号(26pt)、小一(24pt)、二号(22pt)、小二(18pt)、三号(16pt)、小三(15pt)、四号(14pt)、小四(12pt)、五号(10.5pt)、小五(9pt)、六号(7.5pt)、小六(6.5pt)、七号(5.5pt)、八号(5pt)。主/备工具栏共用同一数组。
