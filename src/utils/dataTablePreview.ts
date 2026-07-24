/* ─── 智能表格历史预览渲染 ───
 * 将 HTML 中的 dataTable 占位标签（<div data-type="data-table" data-columns="..." data-rows="...">）
 * 转换为静态 HTML 表格，用于历史预览等无 TipTap 编辑器实例的场景。
 */
import type { Column, Row, CellValue } from '@/components/table/fieldTypes'

const COLOR = {
  border: '#E2E8F0',
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#1E293B',
  textMuted: '#94A3B8',
  primary: '#2563EB',
  success: '#10B981',
  warning: '#F59E0B',
}

export function renderDataTablesInHTML(html: string): string {
  if (!html) return html
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const tableDivs = doc.querySelectorAll('div[data-type="data-table"]')
  if (tableDivs.length === 0) return html

  tableDivs.forEach((div) => {
    let columns: Column[] = []
    let rows: Row[] = []
    try {
      columns = JSON.parse(div.getAttribute('data-columns') || '[]')
      rows = JSON.parse(div.getAttribute('data-rows') || '[]')
    } catch {
      return
    }
    if (!Array.isArray(columns) || !Array.isArray(rows) || columns.length === 0) return

    const wrapper = doc.createElement('div')
    wrapper.innerHTML = generateStaticTableHTML(columns, rows)
    const tableNode = wrapper.firstElementChild
    if (tableNode) div.replaceWith(tableNode)
  })

  return doc.body.innerHTML
}

function generateStaticTableHTML(columns: Column[], rows: Row[]): string {
  const { border, bg, surface, text, textMuted, primary } = COLOR

  const headerCells = columns
    .map(
      (c) =>
        `<th style="background:${bg};border-bottom:2px solid ${border};border-right:1px solid ${border};padding:8px 10px;text-align:left;font-size:13px;font-weight:600;color:${text};white-space:nowrap;">${escapeHTML(c.name)}</th>`,
    )
    .join('')

  const bodyRows = rows
    .map((r) => {
      const cells = columns
        .map((c) => {
          const val = r.cells?.[c.id]
          const cellHTML = cellToStaticHTML(c, val)
          return `<td style="border-bottom:1px solid ${border};border-right:1px solid ${border};padding:6px 10px;font-size:13px;color:${text};vertical-align:top;overflow-wrap:anywhere;word-break:break-word;">${cellHTML}</td>`
        })
        .join('')
      return `<tr>${cells}</tr>`
    })
    .join('')

  return `<div style="margin:12px 0;border:1px solid ${border};border-radius:10px;overflow:hidden;background:${surface};font-family:inherit;">
<table style="border-collapse:separate;border-spacing:0;table-layout:fixed;width:100%;font-size:13px;">
<thead><tr>${headerCells}</tr></thead>
<tbody>${
    bodyRows ||
    `<tr><td colspan="${columns.length}" style="padding:14px;text-align:center;color:${textMuted};font-size:12px;border-bottom:1px solid ${border};">暂无数据</td></tr>`
  }</tbody>
</table>
</div>`
}

function cellToStaticHTML(column: Column, value: CellValue): string {
  const { textMuted, border, primary, success, warning } = COLOR
  const t = column.type

  if (value === null || value === undefined || value === '') {
    if (t === 'checkbox') return '<span style="color:#CBD5E1;">&#9744;</span>'
    return `<span style="color:${textMuted};">&mdash;</span>`
  }

  switch (t) {
    case 'checkbox':
      return value
        ? `<span style="color:${success};font-weight:600;">&#10003;</span>`
        : '<span style="color:#CBD5E1;">&#9744;</span>'

    case 'rating': {
      const n = typeof value === 'number' ? value : 0
      return [1, 2, 3, 4, 5]
        .map(
          (i) =>
            `<span style="color:${i <= n ? warning : border};font-size:16px;line-height:1;">&#9733;</span>`,
        )
        .join('')
    }

    case 'progress': {
      const n = typeof value === 'number' ? value : Number(value) || 0
      return `<div style="display:flex;align-items:center;gap:8px;">
<div style="flex:1;height:8px;background:${border};border-radius:9999px;overflow:hidden;">
<div style="height:100%;border-radius:9999px;background:${primary};width:${Math.max(0, Math.min(100, n))}%;"></div>
</div>
<span style="font-size:11px;color:${textMuted};white-space:nowrap;">${n}%</span>
</div>`
    }

    case 'select': {
      const opt = column.options.find((o) => o.label === value)
      const color = opt?.color || textMuted
      return `<span style="display:inline-flex;align-items:center;font-size:11px;padding:1px 8px;border-radius:999px;background:${color}20;color:${color};font-weight:500;">${escapeHTML(String(value))}</span>`
    }

    case 'multiSelect':
    case 'person': {
      const arr = Array.isArray(value) ? value : []
      if (arr.length === 0) return `<span style="color:${textMuted};">&mdash;</span>`
      return arr
        .map((label) => {
          const opt = column.options.find((o) => o.label === label)
          const color = opt?.color || textMuted
          return `<span style="display:inline-flex;align-items:center;font-size:11px;padding:1px 8px;border-radius:999px;background:${color}20;color:${color};font-weight:500;margin-right:4px;margin-bottom:2px;">${escapeHTML(label)}</span>`
        })
        .join('')
    }

    case 'date': {
      const s = String(value)
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (m) return `${parseInt(m[1])}年${parseInt(m[2])}月${parseInt(m[3])}日`
      return escapeHTML(s)
    }

    case 'url': {
      const s = String(value)
      return `<a href="${escapeHTML(s)}" target="_blank" rel="noreferrer" style="color:${primary};text-decoration:none;">${escapeHTML(s)} &#8599;</a>`
    }

    case 'number':
      return escapeHTML(String(value))

    default:
      // text
      return escapeHTML(String(value)).replace(/\n/g, '<br>')
  }
}

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
