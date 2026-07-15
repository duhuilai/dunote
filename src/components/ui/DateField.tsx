import { useEffect, useRef, useState } from 'react'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const defaultColors = {
  text: '#1E293B',
  textMuted: '#94A3B8',
  textSecondary: '#64748B',
  border: '#E2E8F0',
  surface: '#FFFFFF',
  primary: '#2563EB',
  primaryLight: 'rgba(37,99,235,0.1)',
  bg: '#F8FAFC',
}

type Colors = typeof defaultColors

function parseISO(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}

function toISO(y: number, m: number, d: number): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${y}-${p(m + 1)}-${p(d)}`
}

interface DateFieldProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  colors?: Partial<Colors>
  inputStyle?: React.CSSProperties
}

export default function DateField({
  value,
  onChange,
  placeholder = '选择或输入 YYYY-MM-DD',
  colors = {},
  inputStyle,
}: DateFieldProps) {
  const C = { ...defaultColors, ...colors }
  const today = new Date()
  const init = parseISO(value) || today
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'day' | 'month' | 'year'>('day')
  const [view, setView] = useState({ y: init.getFullYear(), m: init.getMonth() })
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const [text, setText] = useState(value)
  const triggerRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  // 外部 value 变化时同步输入框文本（弹窗未打开时）
  useEffect(() => {
    if (!open) setText(value)
  }, [value, open])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        popRef.current && !popRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const openPop = () => {
    const d = parseISO(value)
    setView(d ? { y: d.getFullYear(), m: d.getMonth() } : { y: today.getFullYear(), m: today.getMonth() })
    setMode('day')
    setText(value)
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) setPos({ left: r.left, top: r.bottom + 4 })
    setOpen(true)
  }

  const commitText = () => {
    const d = parseISO(text.trim())
    if (d) onChange(toISO(d.getFullYear(), d.getMonth(), d.getDate()))
    else setText(value) // 非法则还原为上次合法值
  }

  const firstDay = new Date(view.y, view.m, 1).getDay()
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const sel = parseISO(value)
  const sameYM = !!sel && sel.getFullYear() === view.y && sel.getMonth() === view.m

  const baseInputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '8px',
    border: `1px solid ${C.border}`,
    fontSize: '13px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    color: C.text,
    cursor: 'text',
    background: C.surface,
  }

  const cellBtnStyle = (active: boolean, isToday = false): React.CSSProperties => ({
    border: 'none',
    borderRadius: '6px',
    padding: '6px 0',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    background: active ? C.primary : 'transparent',
    color: active ? '#fff' : isToday ? C.primary : C.text,
    fontWeight: active || isToday ? 600 : 400,
  })

  return (
    <div style={{ position: 'relative' }} ref={triggerRef}>
      <input
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onFocus={openPop}
        onClick={openPop}
        onBlur={commitText}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }}
        style={{ ...baseInputStyle, ...inputStyle }}
      />

      {open && (
        <div
          ref={popRef}
          style={{
            position: 'fixed',
            left: pos.left,
            top: pos.top,
            zIndex: 200,
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
            padding: '10px',
            width: '248px',
            fontFamily: 'inherit',
          }}
        >
          {/* 标题栏：可点选切换 日/月/年 视图 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <button
              onClick={() => setView({ y: view.m === 0 ? view.y - 1 : view.y, m: view.m === 0 ? 11 : view.m - 1 })}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '14px', color: C.textSecondary, padding: '2px 6px', display: mode === 'day' ? 'block' : 'none' }}
            >‹</button>
            <button
              onClick={() => setMode(mode === 'year' ? 'month' : 'year')}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: C.text }}
            >
              {mode === 'day' ? `${view.y}年 ${view.m + 1}月` : mode === 'month' ? `${view.y}年` : `${Math.floor(view.y / 12) * 12}年代`}
            </button>
            <button
              onClick={() => setView({ y: view.m === 11 ? view.y + 1 : view.y, m: view.m === 11 ? 0 : view.m + 1 })}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '14px', color: C.textSecondary, padding: '2px 6px', display: mode === 'day' ? 'block' : 'none' }}
            >›</button>
          </div>

          {/* 日视图 */}
          {mode === 'day' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '6px' }}>
                {WEEKDAYS.map((w) => (
                  <div key={w} style={{ textAlign: 'center', fontSize: '11px', color: C.textMuted, padding: '4px 0' }}>{w}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                {cells.map((d, i) => {
                  if (d === null) return <div key={'b' + i} />
                  const isSel = sameYM && sel && sel.getDate() === d
                  const isToday = today.getFullYear() === view.y && today.getMonth() === view.m && today.getDate() === d
                  return (
                    <button key={d} onClick={() => { onChange(toISO(view.y, view.m, d)); setOpen(false) }} style={cellBtnStyle(isSel, isToday)}>{d}</button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                <button onClick={() => { const t = new Date(); setView({ y: t.getFullYear(), m: t.getMonth() }); onChange(toISO(t.getFullYear(), t.getMonth(), t.getDate())); setOpen(false) }} style={{ flex: 1, padding: '4px 8px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>今天</button>
                <button onClick={() => { onChange(''); setOpen(false) }} style={{ flex: 1, padding: '4px 8px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>清除</button>
              </div>
            </>
          )}

          {/* 月视图 */}
          {mode === 'month' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
              {Array.from({ length: 12 }, (_, m) => (
                <button
                  key={m}
                  onClick={() => { setView((v) => ({ ...v, m })); setMode('day') }}
                  style={{
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 0',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    background: view.m === m ? C.primaryLight : 'transparent',
                    color: view.m === m ? C.primary : C.text,
                    fontWeight: view.m === m ? 600 : 400,
                  }}
                >{m + 1}月</button>
              ))}
            </div>
          )}

          {/* 年视图 */}
          {mode === 'year' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
              {Array.from({ length: 12 }, (_, i) => {
                const y = view.y - 6 + i
                return (
                  <button
                    key={y}
                    onClick={() => { setView((v) => ({ ...v, y })); setMode('month') }}
                    style={{
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 0',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      background: view.y === y ? C.primaryLight : 'transparent',
                      color: view.y === y ? C.primary : C.text,
                      fontWeight: view.y === y ? 600 : 400,
                    }}
                  >{y}</button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
