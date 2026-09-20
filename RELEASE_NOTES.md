# v0.2.29

## 性能优化：启动体积与运行时开销

本轮针对「软件运行效率与系统资源占用」做了两轮排查与优化，重点是**减少启动时要加载的代码量**、**减少每次自动保存的磁盘 I/O**，以及**减少每次按键在主线程上的计算量**。

### 一、启动加载体积：3.02 MB → 约 1.03 MB（降幅约 66%）

此前所有依赖被打进一个 3 MB 的整包，启动时无论用不用都要全部下载解析。现在改为按需加载：

| 优化项 | 做法 | 效果 |
| --- | --- | --- |
| 导出相关重量库 | `turndown`、`turndown-plugin-gfm`、`html2pdf.js`、`docx`、`marked` 全部改为函数内 `await import()` | 导出 Word/PDF/Markdown、导入 Markdown 时才加载，共约 1.35 MB 移出启动路径 |
| Git 备份库 | `isomorphic-git` 改为惰性 `loadGit()`（带缓存的 Promise） | 只有真正做 Gitee/本地备份时才加载，约 230 KB 移出启动路径 |
| 统计页图表 | `AnalyticsPage` 改用 `React.lazy` + `Suspense`，`recharts` 随之拆出 | 打开统计页才加载，约 377 KB 移出启动路径 |
| 分包策略 | `vite.config.ts` 的 `manualChunks` 只固定 `vendor-editor`（TipTap/ProseMirror）与 `vendor-react`，**其余依赖不再合并进 `vendor` 桶** | 关键修复：此前把 html2pdf、isomorphic-git 等动态库合并进 `vendor` 会让它们被主包静态引用，动态导入失效、体积反而更大 |

最终启动加载：`index` 330 KB + `vendor-editor` 526 KB + `vendor-react` 178 KB。

### 二、自动保存的磁盘 I/O 大幅降低

每次自动保存都要生成一份本地实时保存版本（v0.2.26 起），原先每次写版本都会**全目录扫描**（读取该笔记所有历史文件）来算总数和去重，笔记版本越多越慢。现在：

- 用内存缓存（`latestCache` / `sizeCache`）记录「最新版本的时间戳与内容哈希」「该笔记目录总字节数」，**绝大多数保存不再产生任何额外读盘**；
- 缓存未命中时只读「最新一个 `.meta.json`」，不再遍历整个目录；
- 增加**容量预算**（单笔记 150 MB）：只在「数量超上限」或「总体积超预算」时才真正触发清理，清理时一次遍历同时完成按时间淘汰与体积回收。

### 三、运行时按键开销

- `imeGuard` 增加 `maybeCellSplitBySteps` 轻量预筛：先看事务的 step 是否「在表格单元格内插入文本块」，不是就直接放行，**避免中文输入宽限期内每敲一个字都遍历整篇文档**；
- `NoteEditor` 初始 `content` 改为 `''`，内容加载移到 `useLayoutEffect`：避免启动时对同一篇文档做两次 ProseMirror 解析（第二次解析在长文档上非常昂贵）；
- `NotesPage` 的 `selectedNote` 用 `useMemo` 缓存，避免无关状态变化触发整棵编辑器/列表子树重算。

## 说明

- 以上改动均为纯前端优化，不涉及数据格式变化，旧笔记无需迁移。
- 清理策略仍然保证**每个笔记至少保留最近 5 版**（`MIN_KEEP = 5`），容量回收不会把版本清到 5 版以下。
