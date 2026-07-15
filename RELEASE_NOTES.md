# v0.1.38

## 修复：切换/重开笔记后整篇内容丢失（严重数据丢失，关键修复）
- **根因**：本地文件笔记在 `NotesPage.scanDirectory` 中 `content` 被初始化为 `''`，而 `NoteEditor` 首次挂载时 `useEditor({ content: note.content })` 用 `''` 初始化。TipTap 把空内容序列化成 `<p></p>`（非空字符串），但 `baselineContentRef` 初值是 `''`，于是「首次加载前」执行的 `flushPending()` 判定 `content('<p></p>') !== baseline('')`，**把磁盘上的整篇真实内容覆盖成了空段落**。结果：退出软件重新打开、再切换笔记时，整篇内容丢失。
- **修复**：
  - `sync effect` 在「首次加载」（`loadedNoteIdRef` 仍为 `null`，即之前没有任何笔记被加载过）时**跳过 `flushPending()`**——此时还没发生过任何编辑，无需保存，避免误把磁盘内容清空。
  - 新增 `persistContent()` 统一落盘逻辑：本地文件笔记**内容为空时不写盘**（`content.trim()` 为假则跳过 `writeTextFile`），作为第二道防线，杜绝把有内容的文件清空成空白。
  - 切换笔记时的 flush 行为保持不变（非空内容照常落盘，确保编辑不丢）。

## 修复：复制图片后切换/重开，图片丢失、文本正常
- **根因**：从网页复制图片时，剪贴板里是 `<img src="blob:...">` 的 HTML（`clipboardData.files` 为空）。`blob:` 地址属于**源网页的源**，在 Tauri 的 WebView 中无法跨源访问，`fetch(blob:)` 会失败；原 `embedHtmlImages` 在转换失败时**保留原 `blob:` HTML 写入磁盘**，重启/切换后该地址已失效，于是图片不显示、文本正常。
- **修复**：
  - 粘贴/拖入优先从 `clipboardData.files` 与 `clipboardData.items`（`kind === 'file'`）**直接拿到图片真实字节**并转 base64——这种方式跨源可用，不会拿到失效的 `blob:` 地址。
  - 仅当取不到文件字节、退路处理 HTML 中的 `blob:` 时，才尝试 `fetch` 转 base64；**转换失败的图片直接移除**，绝不在笔记里残留死 `blob:` 链接。
