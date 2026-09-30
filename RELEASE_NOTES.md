# v0.2.31

## 新增：Windows 更新「无感安装」

下载完成后点击「安装」，Windows 端不再弹出 NSIS 安装向导，改为**后台静默安装，装完自动打开新版本**，全程无窗口、无需手动点击下一步。

### 实现原理

1. **静默参数**：Tauri 的 NSIS `-setup.exe` 官方支持 `/S`（大写 S）静默安装；且 NSIS 默认 `installMode` 为 `currentUser`（安装到 `%LOCALAPPDATA%\duNote`），**不触发 UAC 提权**——这是能做到「无窗口」的前提。
2. **先退出、后安装**：旧版本必须退出，否则安装目录里的 `duNote.exe` 被占用无法覆盖。但进程一旦退出就没有代码能继续执行，因此把「等待 → 安装 → 拉起」整条指令交给一个**先于本进程退出就已启动、且脱离本进程**的 `cmd /c` 子进程托管：

   ```
   ping -n 4 127.0.0.1 >nul & start "" /WAIT "<安装包>" /S & start "" "<新版 exe>"
   ```

   - `ping -n 4` 用于延迟约 3 秒（不能用 `timeout`：从 spawn 启动的进程 stdin 被重定向，`timeout` 会直接报错退出）。
   - `start "" /WAIT` 等待安装程序结束再执行下一步，保证拉起的是新版本。
   - `start "" "<exe>"` 重新打开应用。
3. **exe 路径精确获取**：新增 Rust 命令 `app_exe_path`（`std::env::current_exe()`）。不硬编码 `%LOCALAPPDATA%\duNote`，避免用户自定义过 NSIS 安装目录时自动拉起失效。
4. `Command.spawn()` 启动的 `cmd` 是独立 OS 进程，本进程随后 `exit(0)` 不会连带终止它。

### 权限与改动

- `capabilities/default.json` 新增 `shell:allow-spawn`（shell 插件本版本的 execute/spawn 不支持 scope 配置，只能授予命令级权限）。
- 安装按钮在静默安装触发后进入禁用态并提示「正在安装…」，避免重复点击启动多个安装程序。

## 未变更

- **macOS 仍为手动拖拽引导**：`.dmg` 只能挂载磁盘镜像，必须用户把 duNote 拖进「应用程序」；且 `/Applications` 属 root 写权限，静默拷贝会要求管理员密码，无法真正无感。
- **`.msi` 保持原安装向导**：WiX 默认是 per-machine 安装（Program Files），静默也会弹 UAC，无法做到无感。当前 Release 同时产出 exe 与 msi，更新检查优先取 `.exe`，因此实际走静默路径。

## 说明

- 需要用户安装一次包含本次 Rust 改动的包（`app_exe_path` 命令）；从更早版本首次升级到本版时仍会走原来的向导，属预期行为。
- 不涉及数据格式变化，笔记数据无需迁移。
