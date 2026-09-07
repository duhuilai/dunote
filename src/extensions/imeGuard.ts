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
import { Plugin, PluginKey } from '@tiptap/pm/state'

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
    if (this.composing) return true
    if (this.lastTs <= 0) return false
    return Date.now() - this.lastTs < IME_EXTENDED_GRACE_MS
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

/** 统计表格单元格内的段落数量（仅 table > row > cell > paragraph 这一路径） */
function countCellParagraphs(doc: import('@tiptap/pm/model').Node): number {
  let n = 0
  doc.descendants((node) => {
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      node.descendants((inner) => {
        if (inner.isTextblock) n++
        return true
      })
      return false // 不再深入 cell
    }
    return true
  })
  return n
}

/** 检测 transaction 是否在单元格内新增了段落（IME 提交常见 split 模式） */
function isCellParagraphSplit(
  oldDoc: import('@tiptap/pm/model').Node,
  newDoc: import('@tiptap/pm/model').Node,
): boolean {
  return countCellParagraphs(newDoc) > countCellParagraphs(oldDoc)
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
