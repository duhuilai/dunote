# duNote 构建说明

## 前置要求

### 1. 安装 Rust

Tauri 需要 Rust 编译环境。请访问 [https://www.rust-lang.org/tools/install](https://www.rust-lang.org/tools/install) 下载并安装 Rust。

**Windows:**
- 下载并运行 [rustup-init.exe](https://win.rustup.rs/x86_64)
- 安装完成后重启终端

**macOS:**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**Linux:**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 2. 验证安装

```bash
rustc --version
cargo --version
```

应该看到类似输出：
```
rustc 1.70.0 (...)
cargo 1.70.0 (...)
```

### 3. Windows 额外要求

如果使用 Windows，还需要安装 Visual Studio Build Tools 2019 或更高版本：

1. 下载 [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)
2. 安装时选择 "C++ build tools" 工作负载
3. 确保勾选以下组件：
   - MSVC v142 - VS 2019 C++ x64/x86 build tools
   - Windows 10/11 SDK

## 构建步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 开发模式测试

在构建之前，建议先在开发模式测试应用：

```bash
# 终端 1: 启动前端开发服务器
npm run dev

# 终端 2: 启动 Tauri 桌面应用
npm run tauri dev
```

如果开发模式正常运行，可以继续构建安装包。

### 3. 构建安装包

```bash
npm run tauri build
```

这个过程可能需要几分钟到十几分钟，取决于您的网络速度和机器性能。

### 4. 查找构建产物

构建完成后，安装包位于：

```
src-tauri/target/release/bundle/
├── msi/          # Windows MSI 安装包
├── nsis/         # Windows NSIS 安装包 (.exe)
└── dmg/          # macOS DMG 安装包
```

具体文件名类似：
- `duNote_0.1.0_x64.msi` (Windows)
- `duNote_0.1.0_x64-setup.exe` (Windows)
- `duNote_0.1.0_x64.dmg` (macOS)

## 常见问题

### 问题 1: "rustc not found"

**解决**: 按照上面的说明安装 Rust。

### 问题 2: Windows 构建失败，提示找不到链接器

**解决**: 安装 Visual Studio Build Tools，确保选择了 C++ 构建工具。

### 问题 3: 构建过程中下载依赖很慢

**解决**: 
- 使用国内镜像源配置 Cargo
- 编辑 `~/.cargo/config.toml` 添加：
```toml
[source.crates-io]
replace-with = 'ustc'

[source.ustc]
registry = "git://mirrors.ustc.edu.cn/crates.io-index"
```

### 问题 4: npm run tauri 命令不存在

**解决**: 确保已经运行 `npm install`，并且 package.json 中包含 `"tauri": "tauri"` 脚本。

## 推送到 GitHub

构建前建议先推送代码到 GitHub：

```bash
# 创建 GitHub 仓库后，执行：
git remote add origin https://github.com/YOUR_USERNAME/duNote.git
git branch -M main
git push -u origin main
```

注意：不要提交 `src-tauri/target/` 目录（已在 .gitignore 中排除）。

## CI/CD 自动构建（可选）

可以配置 GitHub Actions 自动构建安装包。创建 `.github/workflows/build.yml`：

```yaml
name: Build duNote

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        platform: [macos-latest, windows-latest]

    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: 'npm'
      
      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
      
      - name: Install dependencies
        run: npm install
      
      - name: Build Tauri app
        run: npm run tauri build
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: duNote-${{ matrix.platform }}
          path: src-tauri/target/release/bundle/
```

这样每次推送 tag（如 `v0.1.0`）时，GitHub Actions 会自动构建 macOS 和 Windows 安装包。
