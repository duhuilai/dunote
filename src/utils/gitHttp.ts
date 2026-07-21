/**
 * isomorphic-git 的 http 后端，基于 Tauri 的 http 插件（@tauri-apps/plugin-http）。
 *
 * 为什么不用 WebView 自带 fetch：浏览器 fetch 受 CORS 限制，无法直接向 gitee.com
 * 发带 Basic Auth 的 push/fetch。Tauri 的 http 插件走 Rust 网络栈，无 CORS 限制，
 * 因此 Gitee 备份完全可用，且「软件自带 git」（isomorphic-git 纯 JS 实现）。
 */
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

async function normalizeBody(body: any): Promise<Uint8Array | undefined> {
  if (body === undefined || body === null) return undefined
  if (body instanceof Uint8Array) return body
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  // isomorphic-git push 会把 packstream 以 Uint8Array[] 形式传入，必须合并成一个
  // 完整二进制块后再交给 Tauri fetch；否则 Request 会序列化数组为 [object Object]，
  // 导致服务器收到空/错误 body 并返回空响应，解析时抛出
  // "Expected \"unpack ok\" or \"unpack [error message]\" but received \"\"".
  if (Array.isArray(body)) {
    const chunks = body as any[]
    let total = 0
    const normalized: Uint8Array[] = []
    for (const chunk of chunks) {
      const u8 = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)
      normalized.push(u8)
      total += u8.byteLength
    }
    const out = new Uint8Array(total)
    let offset = 0
    for (const u8 of normalized) {
      out.set(u8, offset)
      offset += u8.byteLength
    }
    return out
  }
  // 异步可迭代（某些 isomorphic-git 版本/场景）
  if (typeof body[Symbol.asyncIterator] === 'function') {
    const chunks: Uint8Array[] = []
    let total = 0
    for await (const chunk of body as AsyncIterable<any>) {
      const u8 = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)
      chunks.push(u8)
      total += u8.byteLength
    }
    const out = new Uint8Array(total)
    let offset = 0
    for (const u8 of chunks) {
      out.set(u8, offset)
      offset += u8.byteLength
    }
    return out
  }
  return undefined
}

/** isomorphic-git 要求的 http 后端形状 */
export const tauriHttp = {
  async request({ url, method = 'GET', headers = {}, body }: any) {
    const normalizedBody = await normalizeBody(body)
    const init: any = { method, headers }
    if (normalizedBody !== undefined) {
      init.body = normalizedBody
    }

    console.log('[gitHttp]', method, url, 'body bytes', normalizedBody?.length ?? 0)
    const res = await tauriFetch(url, init)

    // 把 Headers 转成普通对象，isomorphic-git 需要可枚举的 header 集合
    const outHeaders: Record<string, string> = {}
    const h = res.headers as any
    if (h && typeof h.forEach === 'function') {
      h.forEach((v: string, k: string) => {
        outHeaders[String(k).toLowerCase()] = String(v)
      })
    } else if (h) {
      for (const [k, v] of Object.entries(h)) outHeaders[String(k).toLowerCase()] = String(v)
    }

    const arrayBuf = await res.arrayBuffer()
    const bodyData = new Uint8Array(arrayBuf)
    console.log('[gitHttp]', method, url, 'status', res.status, 'response bytes', bodyData.length)
    if (bodyData.length > 0 && bodyData.length < 512) {
      // 调试用：小的非二进制响应打印文本预览
      const preview = new TextDecoder('utf-8', { fatal: false }).decode(bodyData)
      console.log('[gitHttp] response preview:', preview.slice(0, 300))
    }

    // isomorphic-git 新版要求 body 为异步可迭代的字节流
    async function* bodyIter() {
      yield bodyData
    }
    return {
      url: res.url,
      method,
      statusCode: res.status,
      statusMessage: res.statusText,
      headers: outHeaders,
      body: bodyIter(),
    }
  },
}
