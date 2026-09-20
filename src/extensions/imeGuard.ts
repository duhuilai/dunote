/* ─── macOS WKWebView IME 段落插入守卫 ───
 *
 * 背景：v0.2.21 之前 6 层防御全部作用在 keydown 上，但 macOS WKWebView 在 IME
 * 提交候选时，段落换行常常以 `beforeinput`（inputType=insertParagraph /
 * insertLineBreak / insertFromComposition）派发，再由 ProseMirror 的
 * `handleTextInput` 转成单元格内 splitBlock，表现为「光标跳到段首 + 多出空行」。
 *
 * 根治思路：在 IME 宽限期内（含扩展窗口）通过 ProseMirror `filterTransaction`
 * 拦截「在表格单元格内多出新段落」的事务，从事务层覆盖无论 keydown 还是
 * beforeinput 触发。同时保留 `beforeinput` 钩子做前置拦截。
 *
 * 状态：armComposing() 由 NoteEditor 调用，把 composing/lastTs 写入模块变量；
 * filterTransaction 读取同模块变量做判定。注意 React 端只写、不读，因此模块级
 * 共享无并发风险（单编辑实例）。
 */

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type Transaction, type EditorState } from '@tiptap/pm/state'

/** 宽限期：合成刚结束到扩展窗口内，认为可能是 IME 提交残留 */
export const IME_GRACE_MS = 1200
export const IME_EXTENDED_GRACE_MS = 2000

/** 模块级 IME 守卫状态（React 端只写，ProseMirror 端只读） */
export const imeGrace = {
  /** 是否正在合成中（compositionstart ~ compositionend + GRACE_MS） */
  composing: false,
  /** 最近一次合成活动时间戳（Date.now()） */
  lastTs: 0,
  /** 是否处于宽限窗口（含扩展） */
  isInGrace(): boolean {
    if (this.lastTs <= 0) return false
    const dt = Date.now() - this.lastTs
    // 无论 composing 是否为真，一律以 lastTs 为基准限时收敛。
    // 原因：composing 置 false 依赖外部调用 end()，若调用方漏调（或组件卸载/时序异常），
    // 仅凭 composing 判定会让守卫永久生效，导致插入行/列等正常操作被长期吞掉。
    if (this.composing) return dt < IME_GRACE_MS
    return dt < IME_EXTENDED_GRACE_MS
  },
  /** 标记合成中 / 续期时间戳 */
  arm(): void {
    this.composing = true
    this.lastTs = Date.now()
  },
  /** 合成结束：保持 lastTs 供扩展窗口使用，composing 由 arm() / 内部超时置 false */
  end(): void {
    this.composing = false
    this.lastTs = Date.now()
  },
}

/** 统计表格单元格数量与单元格内段落数量（仅 table > row > cell > paragraph 这一路径） */
function countCellsAndParagraphs(
  doc: import('@tiptap/pm/model').Node,
): { cells: number; paras: number } {
  let cells = 0
  let paras = 0
  doc.descendants((node) => {
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      cells++
      node.descendants((inner) => {
        if (inner.isTextblock) paras++
        return true
      })
      return false // 不再深入 cell
    }
    return true
  })
  return { cells, paras }
}

/**
 * 检测 transaction 是否为「IME 提交导致的单元格内 splitBlock」。
 *
 * 关键约束：必须与**结构性编辑**（插入/删除行或列）区分开。插入行、插入列同样会
 * 让单元格内段落总数增加，但那是用户主动触发的结构变更，绝不能被守卫吞掉；
 * 而 IME 的 splitBlock 是在既有单元格内拆出段落，单元格数量不变。
 * 因此判据为：单元格数量发生变化 ⇒ 结构性编辑，一律放行。
 */
function isCellParagraphSplit(
  oldDoc: import('@tiptap/pm/model').Node,
  newDoc: import('@tiptap/pm/model').Node,
): boolean {
  const a = countCellsAndParagraphs(oldDoc)
  const b = countCellsAndParagraphs(newDoc)
  if (b.cells !== a.cells) return false
  return b.paras > a.paras
}

/**
 * 廉价预筛：直接检查事务的 steps，判断是否存在「落在表格单元格内且插入了段落」的步骤。
 *
 * 代价为 O(steps × 节点深度)，与文档大小无关；而 `isCellParagraphSplit` 需要遍历
 * 整个文档树。在 IME 宽限期内每次按键都会触发 filterTransaction，若每键都全量遍历文档，
 * 大文档（尤其含大量 base64 图片）会产生明显卡顿。因此先用本函数排除绝大多数无关事务。
 *
 * 语义上只做「可能命中」的判定——返回 true 时再由 `isCellParagraphSplit` 精确确认，
 * 因此不会改变拦截结果，只是避免无谓的全文档扫描。
 */
function maybeCellSplitBySteps(tr: Transaction, state: EditorState): boolean {
  for (const step of tr.steps) {
    const from = (step as unknown as { from?: number }).from
    if (typeof from !== 'number') continue
    const slice = (step as unknown as { slice?: { content?: any } }).slice
    if (!slice?.content || slice.content.size === 0) continue
    // 只有插入了文本块（段落）才可能是 splitBlock 造成的单元格内换行
    let hasTextblock = false
    slice.content.forEach((n: any) => {
      if (n.isTextblock) hasTextblock = true
    })
    if (!hasTextblock) continue
    // 插入位置是否在表格单元格内？resolve 后向上查找祖先，代价 O(depth)
    try {
      const $from = state.doc.resolve(Math.min(Math.max(from, 0), state.doc.content.size))
      for (let d = $from.depth; d > 0; d--) {
        const name = $from.node(d).type.name
        if (name === 'tableCell' || name === 'tableHeader') return true
      }
    } catch {
      /* 位置非法则忽略该 step */
    }
  }
  return false
}

export const ImeGuard = Extension.create({
  name: 'imeGuard',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('imeGuard'),
        // 在事务应用前过滤：IME 宽限期内若事务在表格单元格内新增段落，丢弃
        filterTransaction(tr, state) {
          if (!tr.docChanged) return true
          if (!imeGrace.isInGrace()) return true
          // 先用与文档大小无关的 step 级预筛，避免宽限期内每次按键都全文档遍历
          if (!maybeCellSplitBySteps(tr, state)) return true
          if (isCellParagraphSplit(state.doc, tr.doc)) {
            // 仅打印一次/秒，避免在 IME 期间刷屏
            const now = Date.now()
            if (now - (ImeGuard as any)._lastDiagTs > 1000) {
              ;(ImeGuard as any)._lastDiagTs = now
              // eslint-disable-next-line no-console
              console.warn('[IME-DIAG] filterTransaction dropped cell paragraph split', {
                dtMs: now - imeGrace.lastTs,
                composing: imeGrace.composing,
                steps: tr.steps.length,
              })
            }
            return false
          }
          return true
        },
      }),
    ]
  },
})
