# v0.2.1

> 承接 v0.2.0 未发布的改动：笔记内检索增强、智能表格体验优化、Gitee/本地备份重构为真实 git 提交。

## 一、笔记内检索定位（增强）
- 检索栏支持 `Ctrl+F` / `Cmd+F` 唤起、`Esc` 关闭，阻止浏览器默认查找。
- 上一个/下一个循环跳转，显示「当前/总数」计数；无匹配提示「无匹配信息」。

## 二、智能表格（体验优化）
- **日期列跳年/跳月**：日期单元格标题点击下钻「日 → 月 → 年」三级视图，可快速跨年/跨月选择（与全局中文日期选择器一致）。
- **检索可达**：笔记内检索现在能命中智能表格单元格内容（桥接 ProseMirror 插件与 React 节点视图，高亮当前命中项）。
- **文本换行**：单元格文本超出列宽时自动换行（`white-space:pre-wrap` + 长词断行），外层横向滚动，固定表头布局。

## 三、Gitee / 本地备份重构（git 真实提交）
- 弃用原先「每次生成 JSON 快照」的方案（智能表格因 900KB 限制静默丢失）；改用 **isomorphic-git** 直接提交当前真实文件。
- 本地文件笔记：提交真实 `.html`；内存型普通笔记：物化到仓库 `.dunote/notes/<id>.html` 后提交。
- 版本即 git 提交记录（历史 = `git log`），恢复从对应 commit 读取真实内容 —— 智能表格数据完整保留（经 Node 烟雾测试验证 `data-columns`/`data-rows` 跨版本无损）。
- 本地仓库根 = 打开的文件夹（`git init` 建 `.git`）；Gitee 备份 = 加远程后 `push`，历史从远程 `fetch` 还原。

## 四、其它
- `vite.config.ts` 增加 `define: { global: 'globalThis' }`，`main.tsx` 注入 `Buffer`/`process` polyfill 以支持 isomorphic-git。
- 放开 `capabilities/default.json` 的 `https://gitee.com` 网络访问（备份推送所需）。
