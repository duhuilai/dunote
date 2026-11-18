const WIKI_LINK_PATTERN = /\[\[([^[\]\r\n]{1,120})\]\]/g

const SKIPPED_TEXT_TAGS = new Set(['CODE', 'PRE', 'SCRIPT', 'STYLE'])

export function normalizeWikiTitle(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFKC')
    .toLocaleLowerCase()
}

export function extractWikiLinkTitles(text: string): string[] {
  if (!text) return []

  const titles: string[] = []
  const seen = new Set<string>()
  for (const match of text.matchAll(WIKI_LINK_PATTERN)) {
    const title = match[1]?.trim()
    if (!title) continue
    const key = normalizeWikiTitle(title)
    if (seen.has(key)) continue
    seen.add(key)
    titles.push(title)
  }
  return titles
}

export function extractWikiLinkTitlesFromHtml(html: string): string[] {
  if (!html.trim()) return []

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let parent = node.parentElement
      while (parent) {
        if (SKIPPED_TEXT_TAGS.has(parent.tagName)) {
          return NodeFilter.FILTER_REJECT
        }
        parent = parent.parentElement
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const chunks: string[] = []
  let current = walker.nextNode()
  while (current) {
    chunks.push(current.textContent || '')
    current = walker.nextNode()
  }
  return extractWikiLinkTitles(chunks.join('\n'))
}

