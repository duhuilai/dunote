import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import html2pdf from 'html2pdf.js'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile, writeFile } from '@tauri-apps/plugin-fs'

/**
 * Format-specific file filters for the Tauri save dialog
 */
const FORMAT_FILTERS: Record<ExportFormat, { name: string; extensions: string[] }> = {
  markdown: { name: 'Markdown', extensions: ['md'] },
  html:     { name: 'HTML',     extensions: ['html', 'htm'] },
  word:     { name: 'Word',     extensions: ['doc'] },
  pdf:      { name: 'PDF',      extensions: ['pdf'] },
}

/**
 * Convert HTML content to Markdown string
 */
function htmlToMarkdown(title: string, htmlContent: string): string {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
  })
  turndownService.use(gfm)

  // Custom rule for task list items
  turndownService.addRule('taskListItem', {
    filter: (node: any) => {
      return node.nodeName === 'LI' && node.querySelector('input[type="checkbox"]')
    },
    replacement: (content: string, node: any) => {
      const checkbox = node.querySelector('input[type="checkbox"]')
      const checked = checkbox && checkbox.checked ? 'x' : ' '
      // Strip newlines from block-level wrappers (label, div) and trim
      content = content.replace(/\n+/g, ' ').replace(/^\s+|\s+$/g, '').replace(/^\[[\sx]?\]\s*/, '')
      return `- [${checked}] ${content}\n`
    },
  })

  const markdown = turndownService.turndown(htmlContent)
  return `# ${title}\n\n${markdown}`
}

/**
 * Build a full styled HTML document
 */
function buildHtmlDocument(title: string, htmlContent: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      line-height: 1.6;
      color: #1E293B;
      background: #FFFFFF;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      font-weight: 600;
    }
    h1 { font-size: 2em; border-bottom: 1px solid #E2E8F0; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #E2E8F0; padding-bottom: 0.3em; }
    h3 { font-size: 1.25em; }
    p { margin: 0.8em 0; }
    code {
      background: #F1F5F9;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9em;
    }
    pre {
      background: #F1F5F9;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
    }
    pre code {
      background: transparent;
      padding: 0;
    }
    blockquote {
      border-left: 4px solid #2563EB;
      margin: 1em 0;
      padding: 0.5em 1em;
      background: #F8FAFC;
      color: #64748B;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
    }
    th, td {
      border: 1px solid #E2E8F0;
      padding: 8px 12px;
      text-align: left;
    }
    th {
      background: #F1F5F9;
      font-weight: 600;
    }
    ul, ol {
      padding-left: 2em;
      margin: 0.5em 0;
    }
    li { margin: 0.3em 0; }
    img { max-width: 100%; height: auto; border-radius: 8px; }
    a { color: #2563EB; text-decoration: none; }
    a:hover { text-decoration: underline; }
    hr {
      border: none;
      border-top: 1px solid #E2E8F0;
      margin: 2em 0;
    }
    .task-list-item {
      list-style: none;
      margin-left: -1.5em;
    }
    .task-list-item input[type="checkbox"] {
      margin-right: 0.5em;
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${htmlContent}
</body>
</html>`
}

/**
 * Build a Word-compatible HTML document (.doc)
 */
function buildWordDocument(title: string, htmlContent: string): string {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <title>${title}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page {
      size: A4;
      margin: 2.54cm;
    }
    body {
      font-family: 'Calibri', 'Microsoft YaHei', sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #000000;
    }
    h1 { font-size: 22pt; font-weight: bold; margin-top: 18pt; margin-bottom: 6pt; }
    h2 { font-size: 16pt; font-weight: bold; margin-top: 14pt; margin-bottom: 4pt; }
    h3 { font-size: 13pt; font-weight: bold; margin-top: 12pt; margin-bottom: 4pt; }
    p { margin: 6pt 0; }
    table {
      border-collapse: collapse;
      width: 100%;
    }
    th, td {
      border: 1px solid #000000;
      padding: 6px 10px;
    }
    th {
      background-color: #F1F5F9;
      font-weight: bold;
    }
    ul, ol {
      margin: 6pt 0;
      padding-left: 24pt;
    }
    li { margin: 3pt 0; }
    code {
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 10pt;
      background-color: #F1F5F9;
      padding: 2px 4px;
    }
    pre {
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 10pt;
      background-color: #F1F5F9;
      padding: 12px;
      white-space: pre-wrap;
    }
    blockquote {
      border-left: 3pt solid #2563EB;
      padding-left: 12pt;
      margin: 12pt 0;
      color: #64748B;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    a {
      color: #2563EB;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${htmlContent}
</body>
</html>`
}

/**
 * Generate PDF as Uint8Array from HTML content
 */
async function generatePdfBytes(title: string, htmlContent: string): Promise<Uint8Array> {
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-9999px'
  container.style.top = '0'
  container.style.width = '800px'
  container.style.background = '#FFFFFF'
  container.style.padding = '40px'
  container.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
  container.style.lineHeight = '1.6'
  container.style.color = '#1E293B'
  container.innerHTML = `
    <h1 style="font-size: 24px; font-weight: 700; margin-bottom: 20px; border-bottom: 2px solid #E2E8F0; padding-bottom: 10px;">${title}</h1>
    <div style="font-size: 14px;">${htmlContent}</div>
  `

  const style = document.createElement('style')
  style.textContent = `
    h1, h2, h3, h4, h5, h6 { margin-top: 1em; margin-bottom: 0.5em; font-weight: 600; }
    h2 { font-size: 18px; }
    h3 { font-size: 16px; }
    p { margin: 0.6em 0; }
    code { background: #F1F5F9; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    pre { background: #F1F5F9; padding: 12px; border-radius: 6px; overflow-x: auto; }
    pre code { background: transparent; padding: 0; }
    blockquote { border-left: 3px solid #2563EB; padding-left: 12px; margin: 1em 0; color: #64748B; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #E2E8F0; padding: 8px 12px; text-align: left; }
    th { background: #F1F5F9; font-weight: 600; }
    ul, ol { padding-left: 2em; margin: 0.5em 0; }
    img { max-width: 100%; height: auto; }
    a { color: #2563EB; text-decoration: none; }
    hr { border: none; border-top: 1px solid #E2E8F0; margin: 1.5em 0; }
  `
  container.insertBefore(style, container.firstChild)
  document.body.appendChild(container)

  try {
    const opt = {
      margin: [15, 15, 15, 15] as [number, number, number, number],
      filename: `${title}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    }

    // Use outputPdf('arraybuffer') to get raw PDF bytes
    const worker = html2pdf().set(opt).from(container)
    const pdfBlob: Blob = await worker.outputPdf('blob')
    const arrayBuffer = await pdfBlob.arrayBuffer()
    return new Uint8Array(arrayBuffer)
  } finally {
    document.body.removeChild(container)
  }
}

/**
 * Export type enum
 */
export type ExportFormat = 'markdown' | 'html' | 'word' | 'pdf'

/**
 * Main export function: opens a native save dialog and writes the file via Tauri
 */
export async function exportNote(
  title: string,
  htmlContent: string,
  format: ExportFormat
): Promise<void> {
  const filter = FORMAT_FILTERS[format]
  if (!filter) throw new Error(`Unsupported export format: ${format}`)

  // Open native save dialog
  const filePath = await save({
    title: '导出笔记',
    filters: [filter],
    defaultPath: `${title}.${filter.extensions[0]}`,
  })

  if (!filePath) return // User cancelled

  switch (format) {
    case 'markdown': {
      const mdContent = htmlToMarkdown(title, htmlContent)
      await writeTextFile(filePath, mdContent)
      break
    }
    case 'html': {
      const fullHTML = buildHtmlDocument(title, htmlContent)
      await writeTextFile(filePath, fullHTML)
      break
    }
    case 'word': {
      const wordDoc = buildWordDocument(title, htmlContent)
      await writeTextFile(filePath, wordDoc)
      break
    }
    case 'pdf': {
      const pdfBytes = await generatePdfBytes(title, htmlContent)
      await writeFile(filePath, pdfBytes)
      break
    }
  }

  console.log(`[Export] Successfully exported to: ${filePath}`)
}
