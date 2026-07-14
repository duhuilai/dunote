/**
 * 真正的 Word(.docx / Office Open XML) 导出。
 *
 * 之前用「HTML 改后缀 .doc」的方式，Word 打开时对嵌套列表、图片、字号支持极差，
 * 表现为标题重复、列表无层级、图片丢失、排版错乱。这里改用 docx 库生成标准 .docx：
 *  - 图片以 base64 二进制内嵌为真正的图片部件（包括自动内嵌的网络图）
 *  - 有序/无序/任务列表使用 Word 原生 numbering（含 9 级缩进层级）
 *  - 标题/正文字号、字体、颜色、高亮均精确映射
 *  - 智能表格(data-table) 与标准表格均转为 Word 表格
 */
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, LevelFormat, BorderStyle, WidthType, ShadingType,
} from 'docx'

/* ─── 类型 ─── */
type ImgType = 'png' | 'jpg' | 'gif'
interface ImageInfo { type: ImgType; data: Uint8Array; width: number; height: number }
type RunStyle = {
  bold?: boolean; italics?: boolean; underline?: boolean; strike?: boolean
  color?: string; font?: string; size?: number; highlight?: string
}
type RunEl = TextRun | ImageRun
type DocxEl = Paragraph | Table
type Ctx = { listLevel: number; inQuote: boolean }

// 当前正在导出的图片表（模块级，单次导出内使用）
let IMAGES: Map<string, ImageInfo> = new Map()

/* ─── 工具：base64 → 字节 ─── */
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const len = bin.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/* ─── 工具：颜色归一化 ─── */
function normColor(c: string): string {
  return c.replace('#', '').toUpperCase()
}

/* ─── 工具：字号解析（返回半磅 half-points） ─── */
function parseSize(css: string): number | undefined {
  const m = css.match(/([\d.]+)\s*(pt|px|em)?/i)
  if (!m) return undefined
  let val = parseFloat(m[1])
  const unit = (m[2] || 'pt').toLowerCase()
  if (unit === 'px') val = val * 0.75
  else if (unit === 'em') val = val * 11
  if (!isFinite(val) || val <= 0) return undefined
  return Math.round(val * 2)
}

/* ─── 工具：背景色 → docx highlight 名称 ─── */
function bgToHighlight(el: HTMLElement): string | undefined {
  const c = (el.style.backgroundColor || '').toLowerCase().replace(/\s/g, '')
  const map: Record<string, string> = {
    '#ffff00': 'yellow', yellow: 'yellow',
    '#00ff00': 'green', '#0f0': 'green', green: 'green',
    '#00ffff': 'cyan', cyan: 'cyan',
    '#ff00ff': 'magenta', magenta: 'magenta',
    '#0000ff': 'blue', blue: 'blue',
    '#ff0000': 'red', red: 'red',
    '#ffa500': 'darkYellow', orange: 'darkYellow', '#ffc000': 'darkYellow',
    '#00b050': 'darkGreen',
    '#7030a0': 'darkPurple', purple: 'darkPurple',
    '#ff9999': 'magenta',
    '#808080': 'gray', gray: 'gray', grey: 'gray',
    '#c0c0c0': 'lightGray',
  }
  return map[c]
}

/* ─── 工具：RunStyle → TextRun 选项 ─── */
function styleToOpts(style: RunStyle): any {
  const o: any = {}
  if (style.bold) o.bold = true
  if (style.italics) o.italics = true
  if (style.underline) o.underline = true
  if (style.strike) o.strike = true
  if (style.color) o.color = style.color
  if (style.font) o.font = style.font
  if (style.size) o.size = style.size
  if (style.highlight) o.highlight = style.highlight
  return o
}

/* ─── 合并元素自带的内联样式 ─── */
function mergeStyle(style: RunStyle, el: HTMLElement): RunStyle {
  const ns: RunStyle = { ...style }
  const tag = el.tagName.toUpperCase()
  if (tag === 'STRONG' || tag === 'B') ns.bold = true
  else if (tag === 'EM' || tag === 'I') ns.italics = true
  else if (tag === 'U') ns.underline = true
  else if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') ns.strike = true
  else if (tag === 'CODE') ns.font = 'Courier New'
  else if (tag === 'A') { ns.color = '0563C1'; ns.underline = true }
  else if (tag === 'MARK') { const h = bgToHighlight(el); if (h) ns.highlight = h }
  else if (tag === 'SPAN') {
    const st = el.style
    if (st.fontSize) { const s = parseSize(st.fontSize); if (s) ns.size = s }
    if (st.color) ns.color = normColor(st.color)
    if (st.fontFamily) ns.font = st.fontFamily.replace(/['"]/g, '')
    if (st.backgroundColor) { const h = bgToHighlight(el); if (h) ns.highlight = h }
  }
  return ns
}

/* ─── 收集内联内容（文本 + 图片）为 Run 列表 ─── */
function collectRuns(node: Node, style: RunStyle): RunEl[] {
  const runs: RunEl[] = []
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent || ''
      if (text) runs.push(new TextRun({ text, ...styleToOpts(style) }))
      return
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return
    const el = child as HTMLElement
    const tag = el.tagName.toUpperCase()
    if (tag === 'BR') {
      runs.push(new TextRun({ text: '', break: 1, ...styleToOpts(style) }))
      return
    }
    if (tag === 'IMG') {
      const info = IMAGES.get(el.getAttribute('src') || '')
      if (info) {
        runs.push(new ImageRun({ type: info.type, data: info.data, transformation: { width: info.width, height: info.height } }))
      } else {
        runs.push(new TextRun({ text: '[图片]', ...styleToOpts(style) }))
      }
      return
    }
    // 块级元素以内联形式出现时，前面加换行
    if ((tag === 'P' || tag === 'DIV') && runs.length > 0) {
      runs.push(new TextRun({ text: '', break: 1, ...styleToOpts(style) }))
    }
    runs.push(...collectRuns(el, mergeStyle(style, el)))
  })
  return runs
}

/* ─── 列表项的内联内容（跳过嵌套列表） ─── */
function listItemInlineRuns(li: HTMLElement): RunEl[] {
  const runs: RunEl[] = []
  li.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = child.textContent || ''
      if (t.trim()) runs.push(new TextRun({ text: t }))
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement
      const tag = el.tagName.toUpperCase()
      if (tag === 'UL' || tag === 'OL') return
      runs.push(...collectRuns(el, {}))
    }
  })
  return runs
}

/* ─── 引用块样式 ─── */
function quoteProps(): any {
  return {
    indent: { left: 240 },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: '2563EB', space: 10 } },
  }
}

/* ─── 表格边框 ─── */
const TABLE_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
  left: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
  right: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
}

/* ─── 块级元素转换 ─── */
function childrenToEls(parent: Node, ctx: Ctx): DocxEl[] {
  const out: DocxEl[] = []
  parent.childNodes.forEach((c) => { out.push(...nodeToEls(c, ctx)) })
  return out
}

function nodeToEls(node: Node, ctx: Ctx): DocxEl[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = (node.textContent || '').trim()
    if (!t) return []
    return [new Paragraph({ children: [new TextRun({ text: node.textContent || '' })] })]
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return []
  const el = node as HTMLElement
  const tag = el.tagName.toUpperCase()
  switch (tag) {
    case 'H1': return [heading(HeadingLevel.HEADING_1, el, ctx)]
    case 'H2': return [heading(HeadingLevel.HEADING_2, el, ctx)]
    case 'H3': return [heading(HeadingLevel.HEADING_3, el, ctx)]
    case 'P': return [paragraphFromEl(el, ctx)]
    case 'BLOCKQUOTE': return childrenToEls(el, { ...ctx, inQuote: true })
    case 'PRE': return [codeBlock(el)]
    case 'UL':
    case 'OL': return convertList(el, ctx)
    case 'TABLE': return [convertTable(el)]
    case 'HR': return [hrParagraph()]
    case 'IMG': return [imageParagraph(el)]
    case 'BR': return []
    default: {
      if (el.getAttribute('data-type') === 'data-table') return [convertDataTable(el)]
      const hasEl = Array.from(el.childNodes).some((c) => c.nodeType === Node.ELEMENT_NODE)
      if (hasEl) return childrenToEls(el, ctx)
      const t = (el.textContent || '').trim()
      if (!t) return []
      return [new Paragraph({ children: [new TextRun({ text: el.textContent || '' })] })]
    }
  }
}

function heading(level: any, el: HTMLElement, ctx: Ctx): Paragraph {
  const runs = collectRuns(el, {})
  const props: any = { heading: level, children: runs.length ? runs : [new TextRun({ text: '' })] }
  if (ctx.inQuote) Object.assign(props, quoteProps())
  return new Paragraph(props)
}

function paragraphFromEl(el: HTMLElement, ctx: Ctx): Paragraph {
  const runs = collectRuns(el, {})
  const props: any = { children: runs.length ? runs : [new TextRun({ text: '' })], spacing: { after: 120 } }
  const align = el.style.textAlign
  if (align === 'center') props.alignment = AlignmentType.CENTER
  else if (align === 'right') props.alignment = AlignmentType.RIGHT
  else if (align === 'justify') props.alignment = AlignmentType.JUSTIFIED
  if (ctx.inQuote) Object.assign(props, quoteProps())
  return new Paragraph(props)
}

function codeBlock(el: HTMLElement): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: el.textContent || '', font: 'Courier New', size: 20 })],
    shading: { type: ShadingType.CLEAR, fill: 'F1F5F9', color: 'auto' },
    spacing: { before: 80, after: 80 },
  })
}

function hrParagraph(): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E2E8F0', space: 1 } },
    spacing: { before: 120, after: 120 },
  })
}

function imageParagraph(el: HTMLElement): Paragraph {
  const info = IMAGES.get(el.getAttribute('src') || '')
  if (info) {
    return new Paragraph({
      children: [new ImageRun({ type: info.type, data: info.data, transformation: { width: info.width, height: info.height } })],
      alignment: AlignmentType.CENTER,
    })
  }
  return new Paragraph({ children: [new TextRun({ text: '[图片]' })] })
}

/* ─── 列表（有序/无序/任务）转换 ─── */
function convertList(el: HTMLElement, ctx: Ctx): DocxEl[] {
  const out: DocxEl[] = []
  const isTask = el.getAttribute('data-type') === 'taskList'
  const ordered = el.tagName.toUpperCase() === 'OL'
  const level = ctx.listLevel + 1
  Array.from(el.children).forEach((li) => {
    if ((li as HTMLElement).tagName.toUpperCase() !== 'LI') return
    const liEl = li as HTMLElement
    if (isTask) {
      const checked = liEl.getAttribute('data-checked') === 'true'
      const contentDiv = Array.from(liEl.children).find(
        (c) => (c as HTMLElement).tagName.toUpperCase() === 'DIV',
      ) as HTMLElement | undefined
      const src = contentDiv || liEl
      const runs = collectRuns(src, {})
      const props: any = {
        children: [new TextRun({ text: checked ? '☑ ' : '☐ ' }), ...(runs.length ? runs : [new TextRun({ text: '' })])],
        indent: { left: 360 * level, hanging: 360 },
      }
      if (ctx.inQuote) Object.assign(props, quoteProps())
      out.push(new Paragraph(props))
    } else {
      const runs = listItemInlineRuns(liEl)
      const props: any = {
        children: runs.length ? runs : [new TextRun({ text: '' })],
        numbering: { reference: ordered ? 'decimal' : 'bullet', level: level - 1 },
      }
      if (ctx.inQuote) Object.assign(props, quoteProps())
      out.push(new Paragraph(props))
    }
    // 嵌套列表
    Array.from(liEl.children).forEach((child) => {
      const t = (child as HTMLElement).tagName.toUpperCase()
      if (t === 'UL' || t === 'OL') out.push(...convertList(child as HTMLElement, { ...ctx, listLevel: level }))
    })
  })
  return out
}

/* ─── 标准表格转换 ─── */
function convertTable(el: HTMLElement): Table {
  const trs = Array.from(el.querySelectorAll('tr'))
  const rows = trs.map((tr) => {
    const cells = Array.from(tr.children).filter((c) => {
      const t = (c as HTMLElement).tagName.toUpperCase()
      return t === 'TD' || t === 'TH'
    }) as HTMLElement[]
    const tableCells = cells.map((cell) => {
      const isHeader = cell.tagName.toUpperCase() === 'TH'
      const cellRuns = collectRuns(cell, {})
      const props: any = {
        children: [new Paragraph({ children: cellRuns.length ? cellRuns : [new TextRun({ text: '' })] })],
      }
      if (isHeader) props.shading = { type: ShadingType.CLEAR, fill: 'F1F5F9', color: 'auto' }
      return new TableCell(props)
    })
    return new TableRow({ children: tableCells })
  })
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS })
}

/* ─── 智能表格(data-table) 转换 ─── */
function cellToString(col: any, val: any): string {
  if (val === undefined || val === null || val === '') return ''
  switch (col.type) {
    case 'checkbox': return val ? '✓' : ''
    case 'multiSelect':
    case 'person': return Array.isArray(val) ? val.join(', ') : String(val)
    case 'rating': return typeof val === 'number' ? '★'.repeat(val) + '☆'.repeat(Math.max(0, 5 - val)) : String(val)
    default: return String(val)
  }
}

function convertDataTable(el: HTMLElement): Table {
  const colsRaw = el.getAttribute('data-columns')
  const rowsRaw = el.getAttribute('data-rows')
  let columns: any[] = []
  let rows: any[] = []
  try { columns = colsRaw ? JSON.parse(colsRaw) : [] } catch { columns = [] }
  try { rows = rowsRaw ? JSON.parse(rowsRaw) : [] } catch { rows = [] }
  if (!columns.length) {
    return new Table({ rows: [], width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS })
  }
  const headerCells = columns.map((c) =>
    new TableCell({
      shading: { type: ShadingType.CLEAR, fill: 'F1F5F9', color: 'auto' },
      children: [new Paragraph({ children: [new TextRun({ text: c.name || '', bold: true })] })],
    }),
  )
  const headerRow = new TableRow({ children: headerCells, tableHeader: true })
  const dataRows = rows.map((r: any) => {
    const cells = columns.map((c) => {
      const val = r.cells ? r.cells[c.id] : undefined
      return new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cellToString(c, val) })] })] })
    })
    return new TableRow({ children: cells })
  })
  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
  })
}

/* ─── numbering 定义（9 级） ─── */
function makeNumbering(): any {
  const bulletChars = ['•', '◦', '▪', '–', '•', '◦', '▪', '–', '•']
  const bulletLevels = bulletChars.map((ch, lv) => ({
    level: lv,
    format: LevelFormat.BULLET,
    text: ch,
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720 * (lv + 1), hanging: 360 } } },
  }))
  const decFormats = [
    LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN,
    LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN,
    LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN,
  ]
  const decTexts = ['%1.', '%2.', '%3.', '%4.', '%5.', '%6.', '%7.', '%8.', '%9.']
  const decimalLevels = decFormats.map((fmt, lv) => ({
    level: lv,
    format: fmt,
    text: decTexts[lv],
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720 * (lv + 1), hanging: 360 } } },
  }))
  return {
    config: [
      { reference: 'bullet', levels: bulletLevels },
      { reference: 'decimal', levels: decimalLevels },
    ],
  }
}

/* ─── 图片预加载 ─── */
async function loadOne(src: string): Promise<ImageInfo | null> {
  try {
    if (src.startsWith('data:')) {
      const m = src.match(/^data:image\/(png|jpe?g|gif);base64,(.*)$/i)
      if (!m) return null
      const raw = m[1].toLowerCase()
      const type: ImgType = raw === 'jpg' || raw === 'jpeg' ? 'jpg' : (raw as ImgType)
      const data = b64ToBytes(m[2])
      const dims = await getSize(src)
      return { type, data, ...dims }
    }
    if (/^https?:\/\//i.test(src)) {
      const resp = await fetch(src)
      if (!resp.ok) return null
      const blob = await resp.blob()
      const buf = await blob.arrayBuffer()
      const type: ImgType = blob.type.includes('png') ? 'png' : blob.type.includes('gif') ? 'gif' : 'jpg'
      const url = URL.createObjectURL(blob)
      const dims = await getSize(url)
      URL.revokeObjectURL(url)
      return { type, data: new Uint8Array(buf), ...dims }
    }
  } catch {
    return null
  }
  return null
}

function getSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let w = img.naturalWidth || 620
      let h = img.naturalHeight || 400
      const maxW = 620
      if (w > maxW) { h = Math.round((h * maxW) / w); w = maxW }
      resolve({ width: w, height: h })
    }
    img.onerror = () => resolve({ width: 620, height: 400 })
    img.src = src
  })
}

async function loadImages(doc: globalThis.Document): Promise<Map<string, ImageInfo>> {
  const map = new Map<string, ImageInfo>()
  const imgs = Array.from(doc.querySelectorAll('img'))
  await Promise.all(imgs.map(async (img) => {
    const src = img.getAttribute('src') || ''
    if (!src || map.has(src)) return
    const info = await loadOne(src)
    if (info) map.set(src, info)
  }))
  return map
}

/* ─── 主入口 ─── */
export async function buildDocx(title: string, html: string): Promise<Uint8Array> {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  IMAGES = await loadImages(doc)

  let bodyEls = childrenToEls(doc.body, { listLevel: 0, inQuote: false })

  // 仅在内容首元素不是 H1 时补一个标题，避免与模板自带标题重复
  const first = doc.body.firstElementChild as HTMLElement | null
  if (!(first && first.tagName.toUpperCase() === 'H1')) {
    bodyEls = [
      new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title })] }),
      ...bodyEls,
    ]
  }

  const document = new Document({
    numbering: makeNumbering(),
    styles: {
      default: {
        document: { run: { font: 'Microsoft YaHei', size: 22 } },
      },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 44, bold: true, color: '0F172A' }, paragraph: { spacing: { after: 200 } } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 36, bold: true, color: '1E293B' }, paragraph: { spacing: { before: 240, after: 120 } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 28, bold: true, color: '1E293B' }, paragraph: { spacing: { before: 200, after: 100 } } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 24, bold: true, color: '1E293B' }, paragraph: { spacing: { before: 160, after: 80 } } },
      ],
    },
    sections: [{ children: bodyEls }],
  })

  const blob = await Packer.toBlob(document)
  const ab = await blob.arrayBuffer()
  return new Uint8Array(ab)
}
