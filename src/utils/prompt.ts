/**
 * 轻量 promise 风格输入框。
 *
 * 为什么不用 window.prompt / @tauri-apps/plugin-dialog 的 prompt：
 *  - Tauri 的 WebView 默认不实现 window.prompt（mac 上直接返回 null，等于“没反应”）；
 *  - @tauri-apps/plugin-dialog v2 已移除 prompt API。
 * 这里用一个自包含的 DOM 弹层实现，浏览器与 Tauri WebView 均可正常弹出并返回字符串。
 */
export function showPrompt(title: string, placeholder = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;z-index:10000;font-family:inherit;'

    const box = document.createElement('div')
    box.style.cssText =
      'background:#fff;border-radius:12px;padding:18px;width:320px;max-width:90vw;box-shadow:0 12px 40px rgba(0,0,0,0.2);'

    const h = document.createElement('div')
    h.textContent = title
    h.style.cssText = 'font-size:14px;font-weight:600;color:#1E293B;margin-bottom:10px;'

    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = placeholder
    input.style.cssText =
      'width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #E2E8F0;border-radius:8px;font-size:14px;outline:none;font-family:inherit;'

    const row = document.createElement('div')
    row.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:14px;'

    const cancel = document.createElement('button')
    cancel.textContent = '取消'
    cancel.style.cssText =
      'padding:7px 14px;border:1px solid #E2E8F0;border-radius:8px;background:#fff;color:#64748B;font-size:13px;cursor:pointer;font-family:inherit;'

    const ok = document.createElement('button')
    ok.textContent = '确定'
    ok.style.cssText =
      'padding:7px 14px;border:none;border-radius:8px;background:#2563EB;color:#fff;font-size:13px;cursor:pointer;font-family:inherit;'

    const close = (val: string | null) => {
      document.removeEventListener('keydown', onKey, true)
      overlay.remove()
      resolve(val)
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(null)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        close(input.value)
      }
    }

    cancel.onclick = () => close(null)
    ok.onclick = () => close(input.value)
    overlay.onclick = (e) => {
      if (e.target === overlay) close(null)
    }
    document.addEventListener('keydown', onKey, true)

    row.appendChild(cancel)
    row.appendChild(ok)
    box.appendChild(h)
    box.appendChild(input)
    box.appendChild(row)
    overlay.appendChild(box)
    document.body.appendChild(overlay)
    input.focus()
  })
}
