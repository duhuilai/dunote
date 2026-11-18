import { escapeHtml } from '@/utils/noteSearch'

function renderInline(rawValue: string): string {
  const codeParts: string[] = []
  let value = escapeHtml(rawValue).replace(/`([^`\n]+)`/g, (_match, code: string) => {
    const token = `\uE000CODE${codeParts.length}\uE001`
    codeParts.push(`<code>${code}</code>`)
    return token
  })

  value = value
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/(^|[\s（(])\*([^*\n]+)\*(?=$|[\s）),.!?：:；;])/g, '$1<em>$2</em>')

  return value.replace(/\uE000CODE(\d+)\uE001/g, (_match, index: string) => (
    codeParts[Number(index)] || ''
  ))
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isTableDivider(line: string): boolean {
  const cells = splitTableRow(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function renderTable(lines: string[]): string {
  if (lines.length < 2) return ''
  const headers = splitTableRow(lines[0])
  const rows = lines.slice(2).map(splitTableRow)
  const headerHtml = headers
    .map((cell) => `<th>${renderInline(cell)}</th>`)
    .join('')
  const bodyHtml = rows
    .map((row) => {
      const cells = headers.map((_header, index) => (
        `<td>${renderInline(row[index] || '')}</td>`
      )).join('')
      return `<tr>${cells}</tr>`
    })
    .join('')
  return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`
}

export function markdownToSafeHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const output: string[] = []
  let paragraph: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let listItems: string[] = []
  let quoteLines: string[] = []
  let codeLines: string[] | null = null

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    output.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`)
    paragraph = []
  }
  const flushList = () => {
    if (!listType || listItems.length === 0) {
      listType = null
      listItems = []
      return
    }
    output.push(`<${listType}>${listItems.map((item) => `<li>${renderInline(item)}</li>`).join('')}</${listType}>`)
    listType = null
    listItems = []
  }
  const flushQuote = () => {
    if (quoteLines.length === 0) return
    output.push(`<blockquote>${quoteLines.map((line) => `<p>${renderInline(line)}</p>`).join('')}</blockquote>`)
    quoteLines = []
  }
  const flushBlocks = () => {
    flushParagraph()
    flushList()
    flushQuote()
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()

    if (codeLines !== null) {
      if (trimmed.startsWith('```')) {
        output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
        codeLines = null
      } else {
        codeLines.push(line)
      }
      continue
    }

    if (trimmed.startsWith('```')) {
      flushBlocks()
      codeLines = []
      continue
    }

    if (!trimmed) {
      flushBlocks()
      continue
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      flushBlocks()
      const level = heading[1].length
      output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`)
      continue
    }

    if (/^([-*_])\1{2,}$/.test(trimmed.replace(/\s/g, ''))) {
      flushBlocks()
      output.push('<hr>')
      continue
    }

    if (
      trimmed.includes('|')
      && index + 1 < lines.length
      && isTableDivider(lines[index + 1])
    ) {
      flushBlocks()
      const tableLines = [line, lines[index + 1]]
      index += 2
      while (index < lines.length && lines[index].trim().includes('|')) {
        tableLines.push(lines[index])
        index += 1
      }
      index -= 1
      output.push(renderTable(tableLines))
      continue
    }

    const quote = trimmed.match(/^>\s?(.*)$/)
    if (quote) {
      flushParagraph()
      flushList()
      quoteLines.push(quote[1])
      continue
    }
    flushQuote()

    const bullet = trimmed.match(/^[-*+]\s+(.+)$/)
    if (bullet) {
      flushParagraph()
      if (listType !== 'ul') flushList()
      listType = 'ul'
      listItems.push(bullet[1])
      continue
    }

    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/)
    if (ordered) {
      flushParagraph()
      if (listType !== 'ol') flushList()
      listType = 'ol'
      listItems.push(ordered[1])
      continue
    }

    flushList()
    paragraph.push(trimmed)
  }

  if (codeLines !== null) {
    output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
  }
  flushBlocks()
  return output.join('')
}

export function textToSafeHtml(text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n').trim()
  if (!normalized) return ''
  return normalized
    .split(/\n{2,}/)
    .map((block) => `<p>${block.split('\n').map(escapeHtml).join('<br>')}</p>`)
    .join('')
}
