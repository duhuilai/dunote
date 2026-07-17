# v0.1.43

## 修复：笔记类型重启后丢失
- 本地文件笔记扫描时 `noteType` 被硬编码为「普通笔记」，且创建时类型未持久化，导致软件重启后全部变成普通笔记。
- 新增 `.dunote-meta.json` 元数据（本地根目录下，记录「相对路径 → 笔记类型」），`scanDirectory` 启动时读取并还原类型。
- 「新建笔记」（本地分支）创建 `.html` 后写入该元数据；右键菜单新增「修改笔记类型」可后续更改并持久化。

## 修复：智能表格修改字段类型 / 删除列无反应
- 列设置菜单用 `createPortal` 挂到 `document.body`，父组件 `DataTableView` 的 `document.mousedown` 外部点击监听器在 `mousedown` 时就把菜单关掉，导致按钮的 `click` 来不及触发。
- 修复：`Popover` 根 div 增加 `onMouseDown={(e) => e.stopPropagation()}`，阻止冒泡到文档监听器。

## 优化：插入图片改为本地文件选择
- 之前斜杠命令与工具栏的图片按钮都弹「输入图片地址」的输入框。
- 现改为调用系统文件选择对话框从本地选图片，自动读字节并内嵌为 base64 data URL（Tauri 环境）。
- 浏览器 dev 无 Tauri 运行时时回退为地址输入框，行为不变。

## 加固：Gitee 历史同步防止超限静默失败
- `pushHistoryToGitee` 在编码后若 base64 长度 > 900KB，直接返回明确中文报错（Gitee 单文件约 1MB 限制，智能表格 + 内嵌图片易超限导致静默失败、恢复时找不到历史）。
