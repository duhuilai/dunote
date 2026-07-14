import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile, BaseDirectory } from '@tauri-apps/plugin-fs'
import { buildDocx } from './exportWord'
import html2pdf from 'html2pdf.js'

/**
 * Format-specific file filters for the Tauri save dialog
 */
const FORMAT_FILTERS: Record<ExportFormat, { name: string; extensions: string[] }> = {
  markdown: { name: 'Markdown', extensions: ['md'] },
  html:     { name: 'HTML',     extensions: ['html', 'htm'] },
  word:     { name: 'Word',     extensions: ['docx'] },
  pdf:      { name: 'PDF',      extensions: ['pdf'] },
}

export function getFormatExt(format: ExportFormat): string {
  return FORMAT_FILTERS[format].extensions[0]
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
  // 内容若已以 H1 标题开头（模板自带），不再重复拼标题，避免标题出现两遍
  if (/^\s*<h1[\s>]/i.test(htmlContent.trim())) {
    return markdown
  }
  return `# ${title}\n\n${markdown}`
}

/**
 * Build a full styled HTML document
 */
function buildHtmlDocument(title: string, htmlContent: string): string {
  // 内容若已以 H1 标题开头（模板自带），不再重复拼标题，避免标题出现两遍
  const titleBlock = /^\s*<h1[\s>]/i.test(htmlContent.trim()) ? '' : `  <h1>${title}</h1>\n`
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Microsoft YaHei', sans-serif;
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
  ${titleBlock}  ${htmlContent}
</body>
</html>`
}

/**
 * 用 html2pdf.js 生成真正的 PDF 字节数组。
 * 之前用 window.print() 在 macOS WebView 上静默无响应；这里改为前端直接生成 PDF 文件，
 * 再通过 Tauri 保存对话框落盘，跨平台稳定可用。
 */
async function buildPdfBytes(title: string, htmlContent: string): Promise<Uint8Array> {
  const fullHtml = buildHtmlDocument(title, htmlContent)
  // 离屏容器：必须真实布局（不能 display:none），html2canvas 才能读取尺寸与图片
  const container = document.createElement('div')
  container.setAttribute('style', 'position:fixed; left:-10000px; top:0; width:794px; background:#fff;')
  container.innerHTML = fullHtml
  document.body.appendChild(container)

  // 等待图片（多为 base64 内嵌）加载完成，避免空白
  const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[]
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve()
          img.onload = () => resolve()
          img.onerror = () => resolve()
          // 超时兜底，避免跨域图片卡住
          setTimeout(resolve, 3000)
        }),
    ),
  )

  try {
    const opt = {
      margin: [10, 10, 10, 10] as [number, number, number, number],
      filename: `${title}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, width: 794 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      pagebreak: { mode: ['css', 'legacy'] },
    }
    const worker = html2pdf().set(opt).from(container)
    const blob: Blob = await worker.outputPdf('blob')
    const ab = await blob.arrayBuffer()
    return new Uint8Array(ab)
  } finally {
    document.body.removeChild(container)
  }
}

/**
 * Export type enum
 */
export type ExportFormat = 'markdown' | 'html' | 'word' | 'pdf'

/**
 * 统一生成各格式的字节数组（markdown/html 为 UTF-8 文本，word/pdf 为二进制）。
 * 供「原生保存对话框」与「自定义中文保存弹窗」两条路径共用。
 */
export async function buildExportBytes(
  title: string,
  htmlContent: string,
  format: ExportFormat,
): Promise<Uint8Array> {
  switch (format) {
    case 'markdown':
      return new TextEncoder().encode(htmlToMarkdown(title, htmlContent))
    case 'html':
      return new TextEncoder().encode(buildHtmlDocument(title, htmlContent))
    case 'word':
      return await buildDocx(title, htmlContent)
    case 'pdf':
      return await buildPdfBytes(title, htmlContent)
  }
}

/**
 * Main export function: opens a native save dialog and writes the file via Tauri.
 * 作为「选择其他位置…」的回退路径（原生对话框的确认按钮由操作系统绘制，无法汉化）。
 */
export async function exportNote(
  title: string,
  htmlContent: string,
  format: ExportFormat,
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

  const bytes = await buildExportBytes(title, htmlContent, format)
  await writeFile(filePath, bytes)
  console.log(`[Export] Successfully exported ${format} to: ${filePath}`)
}

/**
 * 直接写入「下载文件夹」（BaseDirectory.Download），用于自定义中文保存弹窗，
 * 避免操作系统原生 Save 按钮无法汉化的问题。返回最终文件名。
 */
export async function exportToDownloads(
  title: string,
  htmlContent: string,
  format: ExportFormat,
  filename: string,
): Promise<string> {
  const bytes = await buildExportBytes(title, htmlContent, format)
  await writeFile(filename, bytes, { baseDir: BaseDirectory.Download })
  return filename
}
