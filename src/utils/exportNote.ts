import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'

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
      content = content.replace(/^\s*\[[\sx]?\]\s*/, '')
      return `- [${checked}] ${content}\n`
    },
  })

  const markdown = turndownService.turndown(htmlContent)
  return `# ${title}\n\n${markdown}`
}

/**
 * Main export function: opens a native save dialog and writes the file as Markdown
 */
export async function exportNote(
  title: string,
  htmlContent: string,
): Promise<void> {
  // Open native save dialog (Markdown only)
  const filePath = await save({
    title: '导出笔记为 Markdown',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
    defaultPath: `${title}.md`,
  })

  if (!filePath) return // User cancelled

  const mdContent = htmlToMarkdown(title, htmlContent)
  await writeTextFile(filePath, mdContent)

  console.log(`[Export] Successfully exported to: ${filePath}`)
}
