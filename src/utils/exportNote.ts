import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'

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
 * 用系统打印对话框导出 PDF（跨平台最可靠，不依赖 html2canvas）。
 * 通过隐藏 iframe 渲染完整样式文档，等待图片加载后调用 print()，
 * 用户在打印对话框中选择“存储为 PDF”即可。
 */
async function printNoteAsPdf(title: string, htmlContent: string): Promise<void> {
  const html = buildHtmlDocument(title, htmlContent)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('style', 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;')
  document.body.appendChild(iframe)
  const idoc = iframe.contentWindow!.document
  idoc.open()
  idoc.write(html)
  idoc.close()

  // 等待图片加载完成再打印，避免图片区域空白
  const imgs = Array.from(idoc.querySelectorAll('img')) as HTMLImageElement[]
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve()
          img.onload = () => resolve()
          img.onerror = () => resolve()
        }),
    ),
  )

  iframe.contentWindow!.focus()
  iframe.contentWindow!.print()
  // 打印对话框关闭后移除 iframe
  setTimeout(() => {
    try {
      document.body.removeChild(iframe)
    } catch {
      /* ignore */
    }
  }, 3000)
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
  // PDF 走系统打印对话框（存储为 PDF），不经过 Tauri 保存对话框
  if (format === 'pdf') {
    await printNoteAsPdf(title, htmlContent)
    return
  }

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
  }

  console.log(`[Export] Successfully exported ${format} to: ${filePath}`)
}
