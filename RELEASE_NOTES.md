## duNote v0.1.21

### 新增
- 设置持久化：Gitee 令牌、仓库、分支等配置现在会保存到 `appConfigDir/settings.json`，软件更新或重启后不再丢失

### 修复/优化
- Gitee 同步增加路径调试日志，便于排查层级显示问题
- 保持本地文件夹层级作为 Gitee 远程目录结构

### 平台支持
- Windows (MSI / NSIS)
- macOS (DMG)
