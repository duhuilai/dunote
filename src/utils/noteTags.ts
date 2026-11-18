export const MAX_TAG_LENGTH = 32
export const MAX_TAGS_PER_NOTE = 24

export function normalizeTag(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/^[\s#]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TAG_LENGTH)
}

export function normalizeTagList(value: unknown, limit = MAX_TAGS_PER_NOTE): string[] {
  if (!Array.isArray(value)) return []

  const result: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    const tag = normalizeTag(item)
    if (!tag) continue
    const key = tag.toLocaleLowerCase('zh-CN')
    if (seen.has(key)) continue
    seen.add(key)
    result.push(tag)
    if (result.length >= limit) break
  }
  return result
}

export function sameTags(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  return left.every((tag, index) => tag === right[index])
}
