/**
 * isomorphic-git 的 http 后端，基于 Tauri 的 http 插件（@tauri-apps/plugin-http）。
 *
 * 为什么不用 WebView 自带 fetch：浏览器 fetch 受 CORS 限制，无法直接向 gitee.com
 * 发带 Basic Auth 的 push/fetch。Tauri 的 http 插件走 Rust 网络栈，无 CORS 限制，
 * 因此 Gitee 备份完全可用，且「软件自带 git」（isomorphic-git 纯 JS 实现）。
 */
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

/** isomorphic-git 要求的 http 后端形状 */
export const tauriHttp = {
  async request({ url, method = 'GET', headers = {}, body }: any) {
    const init: any = { method, headers }
    // body 来自 isomorphic-git，通常是 Uint8Array（pack 文件）。TypedArray 是合法的 fetch BodyInit。
    if (body !== undefined && body !== null) {
      init.body = body instanceof Uint8Array ? body : body
    }

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
