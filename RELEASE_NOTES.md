# v0.2.7

> 修复「生成历史」Gitee 同步成功但网页看不到文件（默认分支不匹配）。

## 修复 Gitee 同步成功但网页看不到文件
- 现象：点击「生成历史」后提示 Gitee 同步成功，但 Gitee 网页看不到提交的文件，显示「仓库为空」。
- 根因：本地仓库与推送分支均为 `main`，而 Gitee 新建仓库默认分支是 `master`。push 实际成功（`main` 分支有内容），但 Gitee 网页默认展示 `master`（不存在/为空），导致看似没有文件。
- 修复：`src/utils/gitBackup.ts` 的 `pushToRemote` 在 `git.push` 成功后，追加调用 Gitee API `PATCH /repos/{owner}/{repo}`，把仓库默认分支设为推送的分支（`main`），网页即可直接显示备份内容。该调用用 `@tauri-apps/plugin-http` 的 `fetch`（走 Rust 网络栈，无 CORS 预检），失败不阻断同步（仅返回提示让用户手动切分支）。
- 涉及文件：`src/utils/gitBackup.ts`。
