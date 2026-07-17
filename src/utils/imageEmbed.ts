import { showPrompt } from '@/utils/prompt'

/**
 * 把图片 URL 下载并内嵌为 base64 data URI，使图片随笔记内容一起保存，
 * 不再依赖外部地址（如 localhost 临时服务、图床链接）。
 * 软件更新或离线后图片不再丢失。
 * 若下载失败（跨域限制、地址已失效等），回退为原始 URL，由调用方决定如何处理。
 */
export async function toEmbeddedImageSrc(url: string): Promise<string> {
  if (!url || url.startsWith('data:')) return url
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return url
    const blob = await res.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('readAsDataURL failed'))
      reader.readAsDataURL(blob)
    })
    return dataUrl
  } catch {
    return url
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * 弹出本地文件选择器，读取图片并返回 base64 data URL。
 * 在浏览器开发环境（无 Tauri 运行时）回退到 URL 输入框。
 */
export async function pickImageFile(): Promise<string | null> {
  if (typeof window === 'undefined' || !(window as any).__TAURI__) {
    const url = await showPrompt('输入图片地址:', 'https://')
    if (!url) return null
    return toEmbeddedImageSrc(url)
  }

  const { open } = await import('@tauri-apps/plugin-dialog')
  const { readFile } = await import('@tauri-apps/plugin-fs')

  const selected = await open({
    multiple: false,
    title: '选择图片',
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] }],
  })
  if (!selected) return null

  const path = Array.isArray(selected) ? selected[0] : selected
  const bytes = await readFile(path)
  const ext = path.split('.').pop()?.toLowerCase() || 'png'
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
  }
  const mime = mimeMap[ext] || 'image/png'
  const base64 = uint8ToBase64(bytes)
  return `data:${mime};base64,${base64}`
}
