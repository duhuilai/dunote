# v0.2.23

## 修复
- **macOS 更新安装后 App 静默消失**：`openInstaller` 之前对所有平台都 `exit(0)`，但 macOS 的 `.dmg` 只是挂载镜像，仍需用户手动把 duNote 拖进「应用程序」；直接退出会让用户只看到一个 dmg 窗口却没有任何提示。现在 macOS 不再自动退出，改为返回 `manualInstall` 标记，`UpdateDownloader` 据此在按钮下方显示拖拽安装引导文案（并弹 Toast）。Windows 保持原逻辑：启动安装向导后退出进程。
- **Gitee 备份在 macOS 上失败**：`gitBackup.ts` 里判断仓库是否存在时用字符串拼接拼出 `${repoDir}/.git`，并把 `/` 全量替换成 `\`，在 macOS（路径分隔符为 `/`）上拼出的路径根本不存在，导致每次都当作「未初始化仓库」重新 init。改用 `@tauri-apps/api/path` 的 `join()` 跨平台拼接。
- **Gitee 推送强行覆盖远端**：`pushToRemote` 之前无条件 `force: true`，多端编辑时后推的一端会静默覆盖另一端的历史。改为默认非强制推送，遇到非快进（non-fast-forward）时返回友好提示，引导用户先拉取；仅首次 `addRemote` 关联仓库时保留 `force: true`。
- **历史记录 id 可能重复**：`addHistoryEntry` 用 `h-${Date.now()}`，同一毫秒内连续保存会产生相同 id，导致历史列表渲染错位、还原时命中错误的条目。改为优先 `crypto.randomUUID()`，非安全上下文回退「时间戳 + 随机串」。
- **智能表格数值列筛选按字符串比较**：数量列填 `10`、筛选「等于」输入 `10.0` 会匹配不到；且没有大于/小于这类比较。现在 number/progress/rating 列按数值比较，并新增「大于 / 大于等于 / 小于 / 小于等于」四个运算符；切换筛选列时若旧模式对新列类型不适用会自动纠正为该列默认模式。
- **智能表格勾选列「为空」语义混乱**：勾选列的值是 `true/false`，之前 `false` 被当作「为空」，用户想筛「未勾选」却看到「为空」这个含糊选项。勾选列现在只提供「已勾选 / 未勾选」两个明确选项，且不再参与空值判定。
- **平台识别可能挑错安装包**：`detectPlatform()` 之前只解析 UA 字符串，自打包 WebView 某些配置下 UA 不含平台特征，会让 macOS 用户下载到 `.exe`。改为按可靠性依次尝试 `navigator.userAgentData.platform` → `navigator.platform` → UA 正则兜底。
- **历史版本还原失败无提示**：`HistoryModal` 还原时若条目不存在、内容为空或处理过程抛异常，之前都是静默失败（界面无变化）。现在全部走 Toast 明确报错，并拒绝还原空内容（避免把整篇笔记清空）。
- **统计页 CSV 导出在部分环境写不出文件**：改为通过 Tauri 原生保存对话框 + `writeFile` 落盘（与笔记导出一致），并补齐 CSV 单元格转义（含逗号/引号/换行）与 UTF-8 BOM（Excel 打开中文不乱码），成功/失败均有 Toast。

## 修复（数据安全）
- **切换笔记偶发被上一个笔记数据覆盖**：本地文件笔记切换时读取磁盘是异步的（Tauri IPC，macOS 上尤易卡顿），在 `setContent(新内容)` 真正生效前编辑器仍显示旧内容、但新笔记 meta 尚未指向新笔记。若此时 `onUpdate` 防抖落盘计时器触发，会把旧笔记的编辑器内容以新笔记的 meta 写盘，造成跨笔记覆盖。修复：`NoteEditor` 在切换/加载期间置 `loadingRef` 标志，`onUpdate` 在该标志为真时不再排程落盘（旧笔记已由切换前的 `flushPending` 捕获）；同时加载期间 `setEditable(false)` 锁住编辑，彻底吞掉卡顿间隙的误输入，待 `setContent` 完成后立即解锁。

## 优化
- **PDF 导出图片等待更精准**：原来对每张图统一 `setTimeout(3000)` 兜底等待，图片多时导出明显变慢。改为优先 `img.decode()` 精确等待解码完成，超时兜底降到 2s，解码失败再回退 `load/error` 事件。
- **PDF 导出离屏容器双保险**：外层补 `visibility:hidden` + `pointer-events:none` + `aria-hidden`，内层显式 `visibility:visible`——避免渲染期间内容闪现或吃掉点击，同时防止 html2canvas 克隆时继承到 `hidden` 导出整页空白。
- **清理死代码**：`src/utils/sync.ts` 删除已废弃的 Gitee 历史同步函数（`pushHistoryToGitee` / `pullHistoryFromGitee` / `fetchGiteeFileContent` / `syncHistoryToRemote` / `restoreHistoryFromRemote` 及 `PushOptions`）。备份改走 git 后这些函数已无人调用，保留只会误导后续维护。仅保留仍在使用的连接测试与 URL 解析工具。
