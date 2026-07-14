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
