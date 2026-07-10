## duNote v0.1.20

### 修复
- 修复“打开安装程序失败”：在 `tauri.conf.json` 中补充 `plugins.shell.open` 正则配置，允许 `open()` 打开本地已下载的安装包路径及 http/https 链接
- 安装包下载完成后，点击「安装」即可正常唤起系统默认程序（Windows 启动 exe/msi，macOS 挂载 dmg）

### 平台支持
- Windows (MSI / NSIS)
- macOS (DMG)
