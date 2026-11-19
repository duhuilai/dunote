# duNote - 跨平台笔记管理软件

<div align="center">
  <img src="public/logo.png" alt="duNote Logo" width="128" height="128" />
  <h3>基于 Tauri 2 + React + Tiptap 的现代化笔记应用</h3>
</div>

## 功能特性

- 📝 **富文本编辑**: 基于 Tiptap v3 的强大编辑器，支持表格、任务列表、图片、链接等
- 🤖 **文档内 AI 助手**: 围绕当前文档实时对话，支持总结、提取待办、润色选区，并把结果插入、替换或追加到正文
- 🎙️ **会议纪要**: 在文档内录音、确认后转写、校对文字并生成结构化会议纪要
- 📁 **文件夹管理**: 树形文件夹结构，支持本地文件直接编辑
- 🔎 **快速检索**: 全局搜索标题、正文和标签，支持命令面板与快速记录
- 🧠 **知识组织**: 标签筛选、Wiki 双链、反向链接和文档大纲
- 📖 **专注阅读**: 阅读模式、专注模式和打字机模式
- 👥 **人员管理**: 联系人和团队成员管理
- ✅ **任务管理**: 待办事项和项目管理
- 📊 **数据统计**: 可视化分析笔记使用情况
- 💾 **历史版本**: 自动保存历史记录，支持版本回溯
- 🌐 **多端同步**: 支持 Git/Gitee 同步（开发中）
- 🎨 **品牌设计**: 主色 #2563EB + 辅色 #06B6D4

AI 助手支持 OpenAI、千问AI平台、DeepSeek、Ollama 及其他兼容服务。供应商名称、Base URL、API Key、接口协议、文本模型和录音转写模型均可在设置中配置，也可以完全关闭 AI 功能。

## 技术栈

- **框架**: Tauri 2 (桌面应用)
- **前端**: React 19 + TypeScript
- **构建工具**: Vite 8
- **编辑器**: Tiptap v3 (ProseMirror)
- **状态管理**: Zustand
- **样式**: Tailwind CSS v4 + 内联样式
- **图表**: Recharts
- **图标**: Lucide React

## 快速开始

### 前置要求

- Node.js >= 18
- Rust >= 1.90 (用于 Tauri 构建)
- Windows: Visual Studio Build Tools 2019+
- macOS: Xcode Command Line Tools

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
# 启动前端开发服务器
npm run dev

# 启动 Tauri 桌面应用（需要在新终端运行）
npm run tauri dev
```

### 构建安装包

```bash
# 构建 macOS (.dmg) 和 Windows (.msi/.exe) 安装包
npm run tauri build
```

构建产物将位于 `src-tauri/target/release/bundle/`

## 项目结构

```
duNote-qoder/
├── src/                    # React 前端代码
│   ├── components/        # UI 组件
│   │   ├── notes/        # 笔记相关组件
│   │   ├── layout/       # 布局组件
│   │   └── ...
│   ├── store/            # Zustand 状态管理
│   ├── types/            # TypeScript 类型定义
│   └── utils/            # 工具函数
├── src-tauri/            # Tauri Rust 后端
│   ├── capabilities/     # 权限配置
│   ├── icons/           # 应用图标
│   └── src/             # Rust 源代码
└── public/              # 静态资源
```

## 部署到 GitHub

### 创建新仓库

1. 访问 [GitHub](https://github.com/new) 创建新仓库 `duNote`
2. 不要初始化 README、.gitignore 或 license

### 推送代码

```bash
# 添加远程仓库（替换为你的用户名）
git remote add origin https://github.com/YOUR_USERNAME/duNote.git

# 推送到 main 分支
git branch -M main
git push -u origin main
```

### 启用 GitHub Actions (可选)

创建 `.github/workflows/build.yml` 以自动构建安装包。

## 注意事项

- 所有依赖已本地化，不使用 CDN
- 构建产物使用相对路径 (`base: './'`)
- Tauri 插件权限已在 `src-tauri/capabilities/default.json` 配置
- 本地文件操作需要用户授权文件夹访问权限

## 许可证

MIT
