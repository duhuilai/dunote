# v0.2.6

> 修复「生成历史」Gitee 同步失败（push 请求体被错误序列化导致空响应）。

## 修复 Gitee 同步报错 "Expected unpack ok but received \"\""
- 现象：点击「生成历史」后本地 commit 成功，但 Gitee 同步失败，报错 `Expected "unpack ok" or "unpack [error message]" but received ""`。
- 根因：isomorphic-git 的 push 把 packstream 以 `Uint8Array[]` 数组形式传给 http 后端；`@tauri-apps/plugin-http` 的 `fetch` 内部用 `new Request(...).arrayBuffer()` 读取 body，直接传 `Uint8Array[]` 会被错误序列化（浏览器 Request 不接受数组），Gitee 收到空/错误请求体后返回空响应，isomorphic-git 解析首行 `unpack` 时得到空字符串。
- 修复：`src/utils/gitHttp.ts` 新增 `normalizeBody()`，把 `Uint8Array[]` / `ArrayBuffer` / 异步可迭代统一合并成单个 `Uint8Array` 再交给 Tauri fetch；并增加请求/响应日志便于后续排查。
- 涉及文件：`src/utils/gitHttp.ts`。
