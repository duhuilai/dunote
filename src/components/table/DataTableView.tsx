import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import {
  Plus, Trash2, X, ArrowUpDown, Filter, ArrowUp, ArrowDown,
  ArrowLeft, ArrowRight, BarChart3, MoreHorizontal, GripVertical,
} from 'lucide-react'
import {
  type Column, type Row, type FieldType, type SelectOption, type CellValue,
  FIELD_TYPES, OPTION_COLORS, emptyValueFor, uid,
} from './fieldTypes'
import { confirm } from '@tauri-apps/plugin-dialog'
import { subscribeSearchBroadcast, getSearchBroadcast } from '@/extensions/searchState'

/* ─── 颜色令牌 ─── */
const C = {
  primary: '#2563EB',
  primaryLight: 'rgba(37,99,235,0.1)',
  border: '#E2E8F0',
  text: '#1E293B',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  surface: '#FFFFFF',
  bg: '#F8FAFC',
  danger: '#EF4444',
}

const MIN_COL_WIDTH = 80
const ACTION_COL_WIDTH = 36
const DEFAULT_COL_WIDTH = 160

// 检索命中单元格高亮色（与编辑器 .search-match / .search-current 相近）
const HL_MATCH = 'rgba(250, 204, 21, 0.38)'
const HL_CURRENT = 'rgba(250, 204, 21, 0.72)'

type SortState = { colId: string; dir: 'asc' | 'desc' } | null
/**
 * 筛选模式。
 * - text 类：contains / equals / empty
 * - number / progress / rating：额外支持 gt / gte / lt / lte（按数值比较，避免 "10" 与 "10.0" 字符串不等）
 * - checkbox：checked / unchecked（勾选列没有「包含/等于」语义）
 */
type FilterMode =
  | 'contains'
  | 'equals'
  | 'empty'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'checked'
  | 'unchecked'
type FilterState = { colId: string; mode: FilterMode; value: string }

/** 数值型列：筛选时按 Number 比较而非字符串比较 */
function isNumericType(t: FieldType | undefined): boolean {
  return t === 'number' || t === 'progress' || t === 'rating'
}

/** 该列类型可用的筛选模式（供下拉按列类型动态渲染） */
function modesForType(t: FieldType | undefined): FilterMode[] {
  if (t === 'checkbox') return ['checked', 'unchecked']
  if (isNumericType(t)) return ['equals', 'gt', 'gte', 'lt', 'lte', 'contains', 'empty']
  return ['contains', 'equals', 'empty']
}

const MODE_LABELS: Record<FilterMode, string> = {
  contains: '包含',
  equals: '等于',
  empty: '为空',
  gt: '大于',
  gte: '大于等于',
  lt: '小于',
  lte: '小于等于',
  checked: '已勾选',
  unchecked: '未勾选',
}

/** 切换筛选列时，把不适用的模式纠正为该列的默认模式 */
function normalizeMode(mode: FilterMode, t: FieldType | undefined): FilterMode {
  const allowed = modesForType(t)
  if (allowed.includes(mode)) return mode
  return allowed[0]
}

export function DataTableView({ node, updateAttributes }: NodeViewProps) {
  const columns: Column[] = (node.attrs.columns as Column[]) || []
  const rows: Row[] = (node.attrs.rows as Row[]) || []

  const [sort, setSort] = useState<SortState>(null)
  const [filters, setFilters] = useState<FilterState[]>([])
  const [colMenu, setColMenu] = useState<string | null>(null)
  const [colMenuPos, setColMenuPos] = useState<{ left: number; top: number } | null>(null)
  const [optEditor, setOptEditor] = useState<string | null>(null)
  const [optEditorPos, setOptEditorPos] = useState<{ left: number; top: number } | null>(null)
  const [multiOpen, setMultiOpen] = useState<string | null>(null)
  const [toolPop, setToolPop] = useState<'sort' | 'filter' | null>(null)
  const [insertPop, setInsertPop] = useState(false)
  const insertBtnRef = useRef<HTMLDivElement>(null)
  const [insertPos, setInsertPos] = useState<{ left: number; top: number } | null>(null)
  const [insertCount, setInsertCount] = useState(1)
  const [insertDir, setInsertDir] = useState<'top' | 'bottom' | 'left' | 'right'>('bottom')

  const tableWrapRef = useRef<HTMLDivElement>(null)

  // 订阅检索广播：命中智能表格单元格时高亮并参与定位
  const search = useSyncExternalStore(subscribeSearchBroadcast, getSearchBroadcast)
  const cellHighlight = (rowId: string, colId: string): 'current' | 'match' | null => {
    if (!search.query) return null
    const hit = search.matches.some((m) => m.rowId === rowId && m.colId === colId)
    if (!hit) return null
    if (search.current && search.current.rowId === rowId && search.current.colId === colId) return 'current'
    return 'match'
  }

  /* ── 点击外部关闭下拉 ── */
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!tableWrapRef.current) return
    if (!tableWrapRef.current.contains(e.target as Node)) {
      setColMenu(null)
      setOptEditor(null)
      setMultiOpen(null)
      // 不在此处关闭 toolPop（排序/筛选），其 Popover 自行处理外部点击关闭
    }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // 注意：排序/筛选弹层(toolPop)由各自的 Popover 自行处理外部点击关闭，
  // 不要在这里统一关闭，否则点工具栏按钮会被 mousedown 先关掉再被 click 重开，导致无法关闭/交互异常。
  const commit = (nextCols: Column[], nextRows: Row[]) =>
    updateAttributes({ columns: nextCols, rows: nextRows })

  /* ── 列宽 ── */
  const setColWidth = (colId: string, width: number) => {
    commit(
      columns.map((c) => (c.id === colId ? { ...c, width: Math.max(MIN_COL_WIDTH, width) } : c)),
      rows,
    )
  }

  /* ── 单元格读写 ── */
  const getCell = (row: Row, colId: string): CellValue =>
    row.cells[colId] === undefined ? emptyValueFor(colType(colId)) : row.cells[colId]

  const colType = (colId: string): FieldType =>
    columns.find((c) => c.id === colId)?.type ?? 'text'

  const setCell = (rowId: string, colId: string, value: CellValue) => {
    const next = rows.map((r) =>
      r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r,
    )
    commit(columns, next)
  }

  /* ── 行列操作 ── */
  // 插入多行：position='top' 在最上方、'bottom' 在最下方；count 默认 1
  const insertRows = (count: number, position: 'top' | 'bottom') => {
    const n = Math.max(1, Math.min(100, Math.floor(count) || 1))
    const newRows: Row[] = Array.from({ length: n }, () => {
      const cells: Record<string, CellValue> = {}
      columns.forEach((c) => (cells[c.id] = emptyValueFor(c.type)))
      return { id: uid('row'), cells }
    })
    commit(columns, position === 'top' ? [...newRows, ...rows] : [...rows, ...newRows])
  }

  const deleteRow = (rowId: string) => {
    commit(columns, rows.filter((r) => r.id !== rowId))
  }

  // 插入多列：position='left' 在最左侧、'right' 在最右侧；count 默认 1
  const insertColumns = (count: number, position: 'left' | 'right') => {
    const n = Math.max(1, Math.min(100, Math.floor(count) || 1))
    const startIdx = columns.length + 1
    const newCols: Column[] = Array.from({ length: n }, (_, i) => ({
      id: uid('col'),
      name: `列${startIdx + i}`,
      type: 'text',
      options: [],
      width: DEFAULT_COL_WIDTH,
    }))
    const nextCols = position === 'left' ? [...newCols, ...columns] : [...columns, ...newCols]
    const nextRows = rows.map((r) => {
      const cells = { ...r.cells }
      newCols.forEach((c) => { cells[c.id] = emptyValueFor('text') })
      return { ...r, cells }
    })
    commit(nextCols, nextRows)
  }

  const deleteColumn = (colId: string) => {
    const nextCols = columns.filter((c) => c.id !== colId)
    const nextRows = rows.map((r) => {
      const { [colId]: _drop, ...rest } = r.cells
      return { ...r, cells: rest }
    })
    commit(nextCols, nextRows)
    setColMenu(null)
  }

  const renameColumn = (colId: string, name: string) => {
    commit(
      columns.map((c) => (c.id === colId ? { ...c, name } : c)),
      rows,
    )
  }

  const changeColumnType = (colId: string, type: FieldType) => {
    const nextCols = columns.map((c) => {
      if (c.id !== colId) return c
      const needsOptions = (type === 'select' || type === 'multiSelect' || type === 'person')
      const options = needsOptions && c.options.length === 0
        ? [
            { id: uid('opt'), label: '选项1', color: OPTION_COLORS[0] },
            { id: uid('opt'), label: '选项2', color: OPTION_COLORS[1] },
          ]
        : c.options
      return { ...c, type, options }
    })
    const nextRows = rows.map((r) => ({
      ...r,
      cells: { ...r.cells, [colId]: emptyValueFor(type) },
    }))
    commit(nextCols, nextRows)
    setColMenu(null)
  }

  const setColumnOptions = (colId: string, options: SelectOption[]) => {
    commit(
      columns.map((c) => (c.id === colId ? { ...c, options } : c)),
      rows,
    )
  }

  function rectOf(el: HTMLElement) {
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.bottom + 4 }
  }

  /* ── 显示行（排序 + 筛选） ── */
  const displayRows = useMemo(() => {
    let list = rows.slice()
    filters.forEach((f) => {
      if (!f.colId) return
      const t = colType(f.colId)
      const numeric = isNumericType(t)
      // 数值比较：目标值只解析一次，非法输入则视为「无匹配」而非抛错
      const target = numeric ? parseFloat(String(f.value ?? '').replace(/,/g, '')) : NaN
      list = list.filter((r) => {
        const v = getCell(r, f.colId)
        // 勾选列：语义明确为是否勾选，不走「空值」判定
        if (f.mode === 'checked') return v === true
        if (f.mode === 'unchecked') return v !== true
        if (f.mode === 'empty') {
          const empty =
            v === '' || v === null || v === undefined || (Array.isArray(v) && v.length === 0)
          return empty
        }
        // 数值比较（大于/小于/等于）
        if (numeric && f.mode !== 'contains') {
          if (Number.isNaN(target)) return false
          const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''))
          if (Number.isNaN(n)) return false
          if (f.mode === 'equals') return n === target
          if (f.mode === 'gt') return n > target
          if (f.mode === 'gte') return n >= target
          if (f.mode === 'lt') return n < target
          if (f.mode === 'lte') return n <= target
        }
        const s = cellToText(v, t)
        if (f.mode === 'equals') return s === f.value
        return s.toLowerCase().includes(f.value.toLowerCase())
      })
    })
    if (sort) {
      const t = colType(sort.colId)
      list = list.slice().sort((a, b) => {
        const va = getCell(a, sort.colId)
        const vb = getCell(b, sort.colId)
        let r = compareValues(va, vb, t)
        return sort.dir === 'desc' ? -r : r
      })
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns, sort, filters])

  /* ── 统计 ── */
  const stats = useMemo(() => {
    const visible = displayRows.length
    const numberSums: Record<string, { sum: number; count: number }> = {}
    const selectCounts: Record<string, Record<string, number>> = {}
    columns.forEach((c) => {
      if (c.type === 'number' || c.type === 'progress') numberSums[c.id] = { sum: 0, count: 0 }
      if (c.type === 'select' || c.type === 'multiSelect' || c.type === 'person')
        selectCounts[c.id] = {}
    })
    displayRows.forEach((r) => {
      columns.forEach((c) => {
        const v = getCell(r, c.id)
        if (c.type === 'number' || c.type === 'progress') {
          const n = typeof v === 'number' ? v : parseFloat(String(v))
          if (!isNaN(n)) {
            numberSums[c.id].sum += n
            numberSums[c.id].count++
          }
        } else if (selectCounts[c.id]) {
          const arr = Array.isArray(v) ? (v as string[]) : v ? [String(v)] : []
          arr.forEach((label) => {
            selectCounts[c.id][label] = (selectCounts[c.id][label] || 0) + 1
          })
        }
      })
    })
    return { visible, numberSums, selectCounts }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayRows, columns])

  const hasActiveView = sort !== null || filters.length > 0

  /* ── 列宽拖拽 ── */
  const resizing = useRef<{ colId: string; startX: number; startW: number } | null>(null)
  const onResizeStart = (e: React.MouseEvent, colId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const col = columns.find((c) => c.id === colId)
    resizing.current = { colId, startX: e.clientX, startW: col?.width ?? DEFAULT_COL_WIDTH }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    function onMove(ev: MouseEvent) {
      const r = resizing.current
      if (!r) return
      const w = r.startW + (ev.clientX - r.startX)
      setColWidth(r.colId, w)
    }
    function onUp() {
      resizing.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <NodeViewWrapper
      className="du-data-table"
      contentEditable={false}
      style={{ margin: '12px 0' }}
    >
      <div
        style={{
          border: `1px solid ${C.border}`,
          borderRadius: '10px',
          overflow: 'hidden',
          background: C.surface,
          fontFamily: 'inherit',
        }}
      >
        {/* ── 工具栏 ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 10px',
            borderBottom: `1px solid ${C.border}`,
            flexWrap: 'wrap',
            background: C.bg,
          }}
        >
          {/* 插入行/列（统一下拉，支持数量） */}
          <div style={{ position: 'relative' }} ref={insertBtnRef}>
            <ToolBtn
              onClick={() => {
                const next = !insertPop
                setInsertPop(next)
                setInsertPos(next && insertBtnRef.current ? rectOf(insertBtnRef.current) : null)
                setMultiOpen(null); setToolPop(null)
              }}
              icon={<Plus size={14} />}
              label="插入"
              active={insertPop}
            />
            {insertPop && insertPos && (
              <Popover fixed pos={insertPos} onClose={() => { setInsertPop(false); setInsertPos(null) }}>
                {/* 方向选择 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '8px' }}>
                  {[
                    { dir: 'top' as const, icon: ArrowUp, label: '上方插行' },
                    { dir: 'bottom' as const, icon: ArrowDown, label: '下方插行' },
                    { dir: 'left' as const, icon: ArrowLeft, label: '左侧插列' },
                    { dir: 'right' as const, icon: ArrowRight, label: '右侧插列' },
                  ].map(({ dir, icon: Icon, label }) => (
                    <button
                      key={dir}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setInsertDir(dir)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '5px 8px',
                        borderRadius: '6px',
                        border: insertDir === dir ? `1.5px solid ${C.primary}` : `1px solid ${C.border}`,
                        background: insertDir === dir ? C.primaryLight : 'transparent',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontSize: '11px',
                        color: insertDir === dir ? C.primary : C.text,
                        transition: 'all 0.12s',
                      }}
                    >
                      <Icon size={12} />
                      <span>{label.replace('插行', '').replace('插列', '')}</span>
                    </button>
                  ))}
                </div>
                {/* 数量选择 + 确认按钮 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', color: C.textMuted, whiteSpace: 'nowrap' }}>数量</span>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setInsertCount((v) => Math.max(1, v - 1))}
                    disabled={insertCount <= 1}
                    style={{ ...miniBtn, opacity: insertCount <= 1 ? 0.4 : 1 }}
                  >−</button>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={insertCount}
                    onChange={(e) => {
                      const raw = e.target.value
                      if (raw === '') { setInsertCount(1); return }
                      const v = parseInt(raw, 10)
                      if (!isNaN(v)) setInsertCount(Math.max(1, Math.min(100, v)))
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      width: '48px',
                      height: '24px',
                      padding: '2px 4px',
                      fontSize: '13px',
                      textAlign: 'center',
                      border: `1px solid ${C.border}`,
                      borderRadius: '4px',
                      fontFamily: 'inherit',
                      color: C.text,
                      background: C.surface,
                      outline: 'none',
                    }}
                  />
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setInsertCount((v) => Math.min(100, v + 1))}
                    disabled={insertCount >= 100}
                    style={{ ...miniBtn, opacity: insertCount >= 100 ? 0.4 : 1 }}
                  >+</button>
                </div>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (insertDir === 'top' || insertDir === 'bottom') insertRows(insertCount, insertDir)
                    else insertColumns(insertCount, insertDir)
                    setInsertPop(false); setInsertPos(null)
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    border: 'none',
                    background: C.primary,
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'opacity 0.12s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85' }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                >
                  确认插入
                </button>
              </Popover>
            )}
          </div>
          <div style={{ width: '1px', height: '20px', background: C.border, margin: '0 2px' }} />

          {/* 排序 */}
          <div style={{ position: 'relative' }}>
            <ToolBtn
              onClick={() => { setToolPop(toolPop === 'sort' ? null : 'sort'); setMultiOpen(null) }}
              icon={<ArrowUpDown size={14} />}
              label="排序"
              active={!!sort}
            />
            {toolPop === 'sort' && (
              <Popover onClose={() => setToolPop(null)}>
                <div style={{ fontSize: '11px', color: C.textMuted, marginBottom: '6px' }}>按列排序</div>
                <select
                  value={sort?.colId ?? ''}
                  onChange={(e) => {
                    const colId = e.target.value
                    if (!colId) { setSort(null); return }
                    const dir = sort?.colId === colId ? (sort.dir === 'asc' ? 'desc' : 'asc') : 'asc'
                    setSort({ colId, dir })
                  }}
                  style={selStyle}
                >
                  <option value="">选择列…</option>
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {sort && (
                  <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
                    <button
                      style={{ ...miniBtn, background: sort.dir === 'asc' ? C.primaryLight : C.surface, color: sort.dir === 'asc' ? C.primary : C.text }}
                      onClick={() => setSort({ ...sort, dir: 'asc' })}
                    >
                      <ArrowUp size={12} /> 升序
                    </button>
                    <button
                      style={{ ...miniBtn, background: sort.dir === 'desc' ? C.primaryLight : C.surface, color: sort.dir === 'desc' ? C.primary : C.text }}
                      onClick={() => setSort({ ...sort, dir: 'desc' })}
                    >
                      <ArrowDown size={12} /> 降序
                    </button>
                    <button style={miniBtn} onClick={() => setSort(null)}>清除</button>
                  </div>
                )}
              </Popover>
            )}
          </div>

          {/* 筛选 */}
          <div style={{ position: 'relative' }}>
            <ToolBtn
              onClick={() => { setToolPop(toolPop === 'filter' ? null : 'filter'); setMultiOpen(null) }}
              icon={<Filter size={14} />}
              label="筛选"
              active={filters.length > 0}
            />
            {toolPop === 'filter' && (
              <Popover onClose={() => setToolPop(null)}>
                <div style={{ fontSize: '11px', color: C.textMuted, marginBottom: '6px' }}>按列筛选</div>
                {filters.length === 0 && <div style={{ fontSize: '11px', color: C.textMuted }}>暂无筛选条件</div>}
                {filters.map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <select
                      value={f.colId}
                      onChange={(e) => {
                        const nextColId = e.target.value
                        const t = columns.find((c) => c.id === nextColId)?.type
                        // 换列后旧模式可能不适用（如「大于」切到文本列），纠正为该列默认模式
                        updateFilter(i, { ...f, colId: nextColId, mode: normalizeMode(f.mode, t) })
                      }}
                      style={selStyle}
                    >
                      <option value="">列…</option>
                      {columns.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                    </select>
                    <select
                      value={f.mode}
                      onChange={(e) => updateFilter(i, { ...f, mode: e.target.value as FilterMode })}
                      style={selStyle}
                    >
                      {modesForType(colType(f.colId)).map((m) => (
                        <option key={m} value={m}>{MODE_LABELS[m]}</option>
                      ))}
                    </select>
                    {f.mode !== 'empty' && f.mode !== 'checked' && f.mode !== 'unchecked' && (
                      <ImeTextField
                        value={f.value}
                        onChange={(v) => updateFilter(i, { ...f, value: v })}
                        placeholder={isNumericType(colType(f.colId)) ? '数值' : '值'}
                        style={{ ...inputStyle, width: '90px' }}
                      />
                    )}
                    <button style={miniBtn} onClick={() => setFilters((arr) => arr.filter((_, j) => j !== i))}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <button style={miniBtn} onClick={() => setFilters((arr) => [...arr, { colId: columns[0]?.id ?? '', mode: normalizeMode('contains', columns[0]?.type), value: '' }])}>
                  + 添加条件
                </button>
              </Popover>
            )}
          </div>

          <div style={{ width: '1px', height: '20px', background: C.border, margin: '0 2px' }} />
          <ToolBtn onClick={async () => { if (await confirm('确定删除该智能表格？', { title: '删除智能表格' })) commit([], []) }} icon={<Trash2 size={14} />} label="删除" danger />
          {hasActiveView && (
            <button style={{ ...miniBtn, marginLeft: 'auto' }} onClick={() => { setSort(null); setFilters([]) }}>
              重置视图
            </button>
          )}
        </div>

        {/* ── 表格（固定表头） ── */}
        <div
          ref={tableWrapRef}
          style={{
            overflow: 'auto',
            maxHeight: 'min(60vh, 520px)',
          }}
        >
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', width: 'max-content', minWidth: '100%', fontSize: '13px' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                {/* 行序号/操作列 */}
                <th
                  style={{
                    width: ACTION_COL_WIDTH,
                    minWidth: ACTION_COL_WIDTH,
                    maxWidth: ACTION_COL_WIDTH,
                    background: C.bg,
                    borderBottom: `2px solid ${C.border}`,
                    borderRight: `1px solid ${C.border}`,
                    padding: 0,
                    position: 'sticky',
                    left: 0,
                    zIndex: 11,
                  }}
                />
                {columns.map((c) => (
                  <th
                    key={c.id}
                    style={{
                      width: c.width ?? DEFAULT_COL_WIDTH,
                      minWidth: c.width ?? DEFAULT_COL_WIDTH,
                      maxWidth: c.width ?? DEFAULT_COL_WIDTH,
                      background: C.bg,
                      borderBottom: `2px solid ${C.border}`,
                      borderRight: `1px solid ${C.border}`,
                      padding: 0,
                      textAlign: 'left',
                      position: 'relative',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', height: '38px', padding: '0 8px', gap: '4px', overflow: 'hidden' }}>
                      <ImeTextField
                        value={c.name}
                        onChange={(v) => renameColumn(c.id, v)}
                        style={{
                          ...inputStyle,
                          fontWeight: 600,
                          border: 'none',
                          background: 'transparent',
                          padding: '2px 2px',
                          flex: 1,
                          minWidth: 40,
                        }}
                        title={c.name}
                      />
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          const open = colMenu === c.id
                          setColMenu(open ? null : c.id)
                          setColMenuPos(open ? null : rectOf(e.currentTarget))
                          setOptEditor(null)
                          setOptEditorPos(null)
                          setMultiOpen(null)
                        }}
                        title="列设置"
                        style={iconBtn}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    </div>

                    {/* 列宽拖拽条 */}
                    <div
                      className="du-table-resize"
                      onMouseDown={(e) => onResizeStart(e, c.id)}
                    />

                    {/* 列设置菜单（列名/类型/选项/删除） */}
                    {colMenu === c.id && colMenuPos && (
                      <Popover fixed pos={colMenuPos} onClose={() => setColMenu(null)}>
                        <ColMenuContent
                          col={c}
                          onRename={(n) => renameColumn(c.id, n)}
                          onChangeType={(t) => changeColumnType(c.id, t)}
                          onManageOptions={() => { setOptEditor(c.id); setOptEditorPos(colMenuPos); setColMenu(null); setColMenuPos(null) }}
                          onDelete={() => deleteColumn(c.id)}
                        />
                      </Popover>
                    )}

                    {/* 选项编辑 */}
                    {optEditor === c.id && optEditorPos && (
                      <Popover fixed pos={optEditorPos} onClose={() => setOptEditor(null)}>
                        <OptionEditor
                          col={c}
                          onChange={(opts) => setColumnOptions(c.id, opts)}
                          onClose={() => setOptEditor(null)}
                        />
                      </Popover>
                    )}
                  </th>
                ))}
                {columns.length === 0 && (
                  <th style={{ padding: '10px', color: C.textMuted, background: C.bg, borderBottom: `2px solid ${C.border}` }}>
                    暂无列，点击「+ 列」添加
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((r, idx) => (
                <tr key={r.id}>
                  {/* 行操作 */}
                  <td
                    style={{
                      width: ACTION_COL_WIDTH,
                      minWidth: ACTION_COL_WIDTH,
                      maxWidth: ACTION_COL_WIDTH,
                      borderBottom: `1px solid ${C.border}`,
                      borderRight: `1px solid ${C.border}`,
                      textAlign: 'center',
                      background: C.surface,
                      position: 'sticky',
                      left: 0,
                      zIndex: 1,
                      padding: 0,
                    }}
                    className="du-table-action-cell"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                      <span className="du-table-row-num" style={{ fontSize: '11px', color: C.textMuted, width: '18px', textAlign: 'center' }}>
                        {idx + 1}
                      </span>
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => deleteRow(r.id)}
                        title="删除此行"
                        className="du-table-row-del"
                        style={{
                          ...iconBtn,
                          opacity: 0,
                          color: C.danger,
                          padding: '2px',
                          transition: 'opacity 0.15s',
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                  {columns.map((c) => {
                    const hl = cellHighlight(r.id, c.id)
                    return (
                    <td
                      key={c.id}
                      className={hl === 'current' ? 'search-current' : hl === 'match' ? 'search-match' : undefined}
                      style={{
                        width: c.width ?? DEFAULT_COL_WIDTH,
                        minWidth: c.width ?? DEFAULT_COL_WIDTH,
                        maxWidth: c.width ?? DEFAULT_COL_WIDTH,
                        borderBottom: `1px solid ${C.border}`,
                        borderRight: `1px solid ${C.border}`,
                        padding: '4px 6px',
                        verticalAlign: 'top',
                        background: hl === 'current' ? HL_CURRENT : hl === 'match' ? HL_MATCH : C.surface,
                        overflowWrap: 'anywhere',
                        wordBreak: 'break-word',
                      }}
                    >
                      <CellEditor
                        column={c}
                        value={getCell(r, c.id)}
                        onChange={(v) => setCell(r.id, c.id, v)}
                        multiOpen={multiOpen === r.id + ':' + c.id}
                        onToggleMulti={() => setMultiOpen(multiOpen === r.id + ':' + c.id ? null : r.id + ':' + c.id)}
                      />
                    </td>
                    )
                  })}
                </tr>
              ))}
              {displayRows.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    style={{ padding: '14px', textAlign: 'center', color: C.textMuted, fontSize: '12px', borderBottom: `1px solid ${C.border}` }}
                  >
                    {rows.length === 0 ? '暂无数据，点击「+ 行」添加' : '没有符合筛选条件的数据'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── 新增行快捷按钮 ── */}
        <div
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insertRows(1, 'bottom')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '7px 10px',
            borderTop: `1px dashed ${C.border}`,
            background: C.bg,
            cursor: 'pointer',
            fontSize: '12px',
            color: C.textSecondary,
            transition: 'all 0.12s',
            userSelect: 'none',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = C.primaryLight
            e.currentTarget.style.color = C.primary
            e.currentTarget.style.borderColor = C.primary
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = C.bg
            e.currentTarget.style.color = C.textSecondary
            e.currentTarget.style.borderColor = C.border
          }}
        >
          <Plus size={14} />
          <span>新增一行</span>
        </div>

        {/* ── 统计栏 ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '6px 10px',
            borderTop: `1px solid ${C.border}`,
            background: C.bg,
            fontSize: '11px',
            color: C.textSecondary,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <BarChart3 size={13} /> 可见 {stats.visible} 行
          </span>
          {Object.keys(stats.numberSums).map((colId) => {
            const s = stats.numberSums[colId]
            const name = columns.find((c) => c.id === colId)?.name
            return (
              <span key={colId}>
                {name} 合计 <b style={{ color: C.text }}>{s.sum}</b>
                {s.count > 0 && <>（均 { (s.sum / s.count).toFixed(2) }）</>}
              </span>
            )
          })}
          {Object.keys(stats.selectCounts).map((colId) => {
            const counts = stats.selectCounts[colId]
            const col = columns.find((c) => c.id === colId)
            const parts = Object.keys(counts).map((label) => {
              const opt = col?.options.find((o) => o.label === label)
              return (
                <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: opt?.color || C.textMuted }} />
                  {label} {counts[label]}
                </span>
              )
            })
            return <span key={colId} style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>{parts}</span>
          })}
        </div>
      </div>
    </NodeViewWrapper>
  )

  /* ── 局部辅助 ── */
  function updateFilter(i: number, f: FilterState) {
    setFilters((arr) => arr.map((x, j) => (j === i ? f : x)))
  }
}

/* ─── 列设置菜单内容 ─── */
function ColMenuContent({
  col,
  onRename,
  onChangeType,
  onManageOptions,
  onDelete,
}: {
  col: Column
  onRename: (n: string) => void
  onChangeType: (t: FieldType) => void
  onManageOptions: () => void
  onDelete: () => void
}) {
  const [name, setName] = useState(col.name)
  return (
    <div style={{ minWidth: 220 }}>
      <div style={{ fontSize: '11px', color: C.textMuted, marginBottom: '4px' }}>列名</div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => onRename(name)}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }}
        style={{ ...inputStyle, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '5px 7px', width: '100%', marginBottom: '8px' }}
      />

      <div style={{ fontSize: '11px', color: C.textMuted, marginBottom: '4px' }}>字段类型</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', marginBottom: '8px' }}>
        {FIELD_TYPES.map((t) => (
          <button
            key={t.value}
            style={{
              ...miniBtn,
              background: col.type === t.value ? C.primaryLight : C.surface,
              color: col.type === t.value ? C.primary : C.text,
              border: `1px solid ${col.type === t.value ? C.primary : C.border}`,
              justifyContent: 'center',
            }}
            onClick={() => onChangeType(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '6px' }}>
        {(col.type === 'select' || col.type === 'multiSelect' || col.type === 'person') && (
          <button style={{ ...miniBtn, flex: 1 }} onClick={onManageOptions}>管理选项</button>
        )}
        <button style={{ ...miniBtn, color: C.danger, flex: 1 }} onClick={onDelete}>删除列</button>
      </div>
    </div>
  )
}

/* ─── 选项标签输入（IME 安全） ───
 * 用本地草稿 + 合成守卫，避免父级 updateAttributes 在合成期间反复重渲染导致光标跳动。
 */
function OptLabelInput({
  value,
  onCommit,
  style,
}: {
  value: string
  onCommit: (v: string) => void
  style?: React.CSSProperties
}) {
  const [draft, setDraft] = useState(value)
  const composing = useRef(false)
  useEffect(() => {
    if (!composing.current) setDraft(value)
  }, [value])
  return (
    <input
      value={draft}
      onChange={(e) => {
        const v = e.target.value
        setDraft(v)
        if (!composing.current) onCommit(v)
      }}
      onCompositionStart={() => { composing.current = true }}
      onCompositionEnd={(e) => {
        composing.current = false
        const v = e.currentTarget.value
        setDraft(v)
        onCommit(v)
      }}
      onBlur={(e) => { if (composing.current) return; onCommit(e.currentTarget.value) }}
      style={style}
    />
  )
}

/* ─── 选项编辑器 ─── */
function OptionEditor({
  col,
  onChange,
  onClose,
}: {
  col: Column
  onChange: (opts: SelectOption[]) => void
  onClose: () => void
}) {
  const [opts, setOpts] = useState<SelectOption[]>(col.options)
  const commit = (next: SelectOption[]) => { setOpts(next); onChange(next) }
  return (
    <div style={{ minWidth: 220 }}>
      <div style={{ fontSize: '11px', color: C.textMuted, marginBottom: '6px' }}>选项（{col.name}）</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '220px', overflowY: 'auto' }}>
        {opts.map((o, i) => (
          <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="color"
              value={o.color}
              onChange={(e) => commit(opts.map((x, idx) => (idx === i ? { ...x, color: e.target.value } : x)))}
              style={{ width: '22px', height: '22px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
            />
            <OptLabelInput
              value={o.label}
              onCommit={(v) => commit(opts.map((x, idx) => (idx === i ? { ...x, label: v } : x)))}
              style={{ ...inputStyle, flex: 1, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '4px 6px' }}
            />
            <button style={miniBtn} onClick={() => commit(opts.filter((_, idx) => idx !== i))}>
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      <button
        style={{ ...miniBtn, width: '100%', marginTop: '6px' }}
        onClick={() => commit([...opts, { id: uid('opt'), label: `选项${opts.length + 1}`, color: OPTION_COLORS[opts.length % OPTION_COLORS.length] }])}
      >
        + 添加选项
      </button>
      <button style={{ ...miniBtn, width: '100%', marginTop: '4px' }} onClick={onClose}>完成</button>
    </div>
  )
}

/* ─── 自定义中文日历（替代原生 input[type=date]，月份/星期全中文） ─── */
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function parseISO(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}

function toISO(y: number, m: number, d: number): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${y}-${p(m + 1)}-${p(d)}`
}

function formatCN(s: string): string {
  const d = parseISO(s)
  if (!d) return ''
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const today = new Date()
  const init = parseISO(value) || today
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'day' | 'month' | 'year'>('day')
  const [view, setView] = useState({ y: init.getFullYear(), m: init.getMonth() })
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        popRef.current && !popRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const openPop = () => {
    const d = parseISO(value)
    setView(d ? { y: d.getFullYear(), m: d.getMonth() } : { y: today.getFullYear(), m: today.getMonth() })
    setMode('day')
    setOpen((v) => !v)
  }

  // 日期选择器定位：下方空间不足时自动翻到触发元素上方，同时避免超出右边界
  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current?.getBoundingClientRect()
    const pop = popRef.current?.getBoundingClientRect()
    if (!trigger || !pop) return
    const gap = 4
    const viewportH = window.innerHeight
    const viewportW = window.innerWidth
    const spaceBelow = viewportH - trigger.bottom
    const placeBelow = spaceBelow >= pop.height + gap
    const top = placeBelow
      ? trigger.bottom + gap
      : Math.max(gap, trigger.top - pop.height - gap)
    const left = Math.max(gap, Math.min(trigger.left, viewportW - pop.width - gap))
    setPos({ left, top })
  }, [open, mode])

  const firstDay = new Date(view.y, view.m, 1).getDay()
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const sel = parseISO(value)
  const sameYM = !!sel && sel.getFullYear() === view.y && sel.getMonth() === view.m

  const cellBtn = (active: boolean, isToday = false): React.CSSProperties => ({
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
      <div
        onClick={openPop}
        style={{
          ...cellInputStyle,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          minHeight: '26px',
          color: value ? C.text : C.textMuted,
        }}
      >
        {formatCN(value) || '选择日期'}
      </div>

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
          {/* 标题栏：点标题在 日/月/年 视图间切换，可跳年/跳月 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <button
              onClick={() => setView({ y: view.m === 0 ? view.y - 1 : view.y, m: view.m === 0 ? 11 : view.m - 1 })}
              style={{ ...iconBtn, padding: '2px 6px', display: mode === 'day' ? 'block' : 'none' }}
            >‹</button>
            <button
              onClick={() => setMode(mode === 'year' ? 'month' : 'year')}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: C.text }}
            >
              {mode === 'day' ? `${view.y}年 ${view.m + 1}月` : mode === 'month' ? `${view.y}年` : `${Math.floor(view.y / 12) * 12}年代`}
            </button>
            <button
              onClick={() => setView({ y: view.m === 11 ? view.y + 1 : view.y, m: view.m === 11 ? 0 : view.m + 1 })}
              style={{ ...iconBtn, padding: '2px 6px', display: mode === 'day' ? 'block' : 'none' }}
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
                    <button key={d} onClick={() => { onChange(toISO(view.y, view.m, d)); setOpen(false) }} style={cellBtn(isSel, isToday)}>{d}</button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                <button onClick={() => { const t = new Date(); setView({ y: t.getFullYear(), m: t.getMonth() }); onChange(toISO(t.getFullYear(), t.getMonth(), t.getDate())); setOpen(false) }} style={{ ...miniBtn, flex: 1 }}>今天</button>
                <button onClick={() => { onChange(''); setOpen(false) }} style={{ ...miniBtn, flex: 1 }}>清除</button>
              </div>
            </>
          )}

          {/* 月视图：点月份回到日视图 */}
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

          {/* 年视图：点年份进入月视图 */}
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

/* ─── IME 安全文本输入 ───
 * 解决中文输入法（IME）合成期间受控组件被 React 重设 value 导致的「光标跳到开头 / 多出换行」。
 * 原理：合成中只更新本地 internal（不提交父组件），避免重渲染打断 IME；
 *       合成结束(onCompositionEnd)或失焦(onBlur)时才把最终文本提交给 onChange。
 * 英文/粘贴不经过合成，onChange 实时提交（composing=false）。
 * 多行(multiline)时内置 autoSize，随内容/列宽变化撑高，避免多行文本被裁切。
 */
function ImeTextField({
  value,
  onChange,
  multiline,
  resizeSignal,
  className,
  style,
  placeholder,
  rows = 1,
  onKeyDown,
  title,
}: {
  value?: string
  onChange: (v: string) => void
  multiline?: boolean
  resizeSignal?: unknown
  className?: string
  style?: React.CSSProperties
  placeholder?: string
  rows?: number
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement | HTMLInputElement>
  title?: string
}) {
  const [internal, setInternal] = useState(value ?? '')
  const composing = useRef(false)
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null)

  const autoSize = useCallback(() => {
    const el = ref.current
    if (el && multiline) {
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
    }
  }, [multiline])

  // 外部值变化（撤销/重做/历史恢复/列宽变化）且当前未合成时同步
  useEffect(() => {
    if (!composing.current) setInternal(value ?? '')
  }, [value])

  // 内容或列宽变化后撑高
  useEffect(() => {
    autoSize()
  }, [internal, resizeSignal, autoSize])

  // 监听元素自身宽度变化（table-layout:fixed 下宽度 settled 较晚），据此重算高度
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !multiline || typeof ResizeObserver === 'undefined') return
    let lastW = 0
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (cr == null) return
      if (cr.width !== lastW) {
        lastW = cr.width
        autoSize()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [autoSize, multiline])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const v = e.currentTarget.value
    setInternal(v)
    if (!composing.current) onChange(v) // 非合成（英文/粘贴）实时提交
  }
  const handleCompositionStart = () => {
    composing.current = true
  }
  const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    composing.current = false
    const v = e.currentTarget.value
    setInternal(v)
    onChange(v) // 合成结束提交最终中文
  }
  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (composing.current) return // 合成中失焦不提交（避免截断未完成的拼音）
    onChange(e.currentTarget.value)
  }

  const common: Record<string, unknown> = {
    ref,
    value: internal,
    onChange: handleChange,
    onCompositionStart: handleCompositionStart,
    onCompositionEnd: handleCompositionEnd,
    onBlur: handleBlur,
    className,
    style,
    placeholder,
    title,
    onKeyDown,
  }
  return multiline
    ? <textarea {...common} rows={rows} />
    : <input {...common} />
}

/* ─── 单元格编辑器 ─── */
function CellEditor({
  column,
  value,
  onChange,
  multiOpen,
  onToggleMulti,
}: {
  column: Column
  value: CellValue
  onChange: (v: CellValue) => void
  multiOpen: boolean
  onToggleMulti: () => void
}) {
  const t = column.type

  if (t === 'checkbox') {
    return (
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
      />
    )
  }

  if (t === 'rating') {
    const n = typeof value === 'number' ? value : 0
    return (
      <span style={{ display: 'inline-flex', gap: '2px' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            onClick={() => onChange(i === n ? 0 : i)}
            style={{ cursor: 'pointer', color: i <= n ? '#F59E0B' : C.border, fontSize: '16px', lineHeight: 1 }}
          >
            ★
          </span>
        ))}
      </span>
    )
  }

  if (t === 'select') {
    return (
      <select value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} style={cellSelectStyle(column, value as string)}>
        <option value=""> </option>
        {column.options.map((o) => (
          <option key={o.id} value={o.label}>{o.label}</option>
        ))}
      </select>
    )
  }

  if (t === 'multiSelect' || t === 'person') {
    const arr = Array.isArray(value) ? (value as string[]) : []
    const suggestions = column.options.map((o) => o.label)
    const [text, setText] = useState('')
    const addTag = (label: string) => {
      const v = label.trim()
      if (!v || arr.includes(v)) return
      onChange([...arr, v])
    }
    return (
      <div style={{ position: 'relative' }}>
        <div
          onClick={onToggleMulti}
          style={{
            minHeight: '26px',
            border: `1px solid ${C.border}`,
            borderRadius: '6px',
            padding: '3px 6px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px',
            alignItems: 'center',
            cursor: 'pointer',
            background: C.surface,
          }}
        >
          {arr.map((label) => {
            const opt = column.options.find((o) => o.label === label)
            return (
              <span key={label} style={pillStyle(opt?.color)}>
                {label}
                <span
                  onClick={(e) => { e.stopPropagation(); onChange(arr.filter((x) => x !== label)) }}
                  style={{ cursor: 'pointer', marginLeft: '2px' }}
                >✕</span>
              </span>
            )
          })}
          {arr.length === 0 && <span style={{ color: C.textMuted, fontSize: '12px' }}>点击选择</span>}
        </div>
        {multiOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '4px',
              zIndex: 50,
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              padding: '6px',
              minWidth: '180px',
            }}
          >
            {t === 'person' && (
              <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                <input
                  value={text}
                  autoFocus
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { addTag(text); setText('') } }}
                  placeholder="输入人员回车"
                  style={inputStyle}
                />
                <button style={miniBtn} onClick={() => { addTag(text); setText('') }}>+</button>
              </div>
            )}
            <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {suggestions.map((label) => (
                <label key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 6px', borderRadius: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={arr.includes(label)}
                    onChange={(e) => e.target.checked ? addTag(label) : onChange(arr.filter((x) => x !== label))}
                  />
                  <span style={pillStyle(column.options.find((o) => o.label === label)?.color)}>{label}</span>
                </label>
              ))}
              {suggestions.length === 0 && <span style={{ fontSize: '11px', color: C.textMuted }}>暂无选项，请在列设置中添加</span>}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (t === 'number') {
    return (
      <input
        type="number"
        value={value === '' || value === null || value === undefined ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        style={cellInputStyle}
      />
    )
  }

  if (t === 'progress') {
    const n = typeof value === 'number' ? value : Number(value) || 0
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div
          style={{
            flex: 1,
            height: '8px',
            background: C.border,
            borderRadius: '9999px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              borderRadius: '9999px',
              background: C.primary,
              width: `${Math.max(0, Math.min(100, n))}%`,
            }}
          />
        </div>
        <input
          type="number"
          min={0}
          max={100}
          value={n}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Math.max(0, Math.min(100, Number(e.target.value))))}
          style={{ ...cellInputStyle, width: '44px', textAlign: 'right' }}
        />
        <span style={{ fontSize: '11px', color: C.textMuted }}>%</span>
      </div>
    )
  }

  if (t === 'date') {
    return <DateField value={(value as string) || ''} onChange={(v) => onChange(v)} />
  }

  if (t === 'url') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <ImeTextField
          value={(value as string) || ''}
          onChange={(v) => onChange(v)}
          placeholder="https://"
          style={cellInputStyle}
        />
        {(value as string) && (
          <a href={value as string} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="打开链接" style={{ color: C.primary }}>
            ↗
          </a>
        )}
      </div>
    )
  }

  // text 默认：换行文本框（超出列宽自动折行，高度随内容增长）
  // 用 ImeTextField（受控 + 合成守卫）彻底规避中文 IME 合成期间光标跳开头/多出换行
  return (
    <ImeTextField
      multiline
      resizeSignal={column.width}
      value={(value as string) || ''}
      onChange={(v) => onChange(v)}
      rows={1}
      style={{
        ...cellInputStyle,
        display: 'block',
        height: 'auto',
        minHeight: '26px',
        resize: 'none',
        overflow: 'hidden',
        lineHeight: 1.45,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflowWrap: 'anywhere',
        background: 'transparent',
        borderRadius: '4px',
      }}
    />
  )
}

/* ─── 工具函数 ─── */
function cellToText(v: CellValue, t: FieldType): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? '是' : ''
  if (Array.isArray(v)) return v.join(',')
  return String(v)
}

function compareValues(a: CellValue, b: CellValue, t: FieldType): number {
  const ea = a === '' || a === null || a === undefined || (Array.isArray(a) && a.length === 0)
  const eb = b === '' || b === null || b === undefined || (Array.isArray(b) && b.length === 0)
  if (ea && eb) return 0
  if (ea) return 1
  if (eb) return -1
  if (t === 'number' || t === 'progress') return (Number(a) || 0) - (Number(b) || 0)
  if (t === 'date') {
    const da = Date.parse(String(a))
    const db = Date.parse(String(b))
    if (!isNaN(da) && !isNaN(db)) return da - db
  }
  if (t === 'rating') return (Number(a) || 0) - (Number(b) || 0)
  if (t === 'checkbox') return a ? 1 : -1
  return cellToText(a, t).localeCompare(cellToText(b, t), 'zh-Hans-CN')
}

/* ─── Popover ─── */
function Popover({
  children,
  onClose,
  fixed,
  pos,
}: {
  children: React.ReactNode
  onClose: () => void
  fixed?: boolean
  pos?: { left: number; top: number } | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])
  const content = (
    <div
      ref={ref}
      style={{
        position: fixed ? 'fixed' : 'absolute',
        ...(fixed && pos ? { left: pos.left, top: pos.top } : { top: '100%', right: 0 }),
        marginTop: fixed ? 0 : '6px',
        zIndex: 200,
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: '8px',
        boxShadow: '0 6px 18px rgba(0,0,0,0.14)',
        padding: '8px',
        minWidth: '160px',
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
  if (fixed) return createPortal(content, document.body)
  return content
}

/* ─── 样式辅助 ─── */
const baseBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px 8px',
  borderRadius: '6px',
  border: `1px solid ${C.border}`,
  background: C.surface,
  color: C.text,
  fontSize: '12px',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

function ToolBtn({
  onClick, icon, label, active, danger,
}: {
  onClick: () => void
  icon: React.ReactNode
  label: string
  active?: boolean
  danger?: boolean
}) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={{
        ...baseBtn,
        background: active ? C.primaryLight : C.surface,
        color: danger ? C.danger : active ? C.primary : C.text,
        borderColor: active ? C.primary : C.border,
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

const miniBtn: React.CSSProperties = {
  ...baseBtn,
  padding: '3px 6px',
  fontSize: '11px',
}

const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  padding: '6px 8px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: '13px',
  color: C.text,
  fontFamily: 'inherit',
  textAlign: 'left',
  borderRadius: '4px',
  transition: 'background 0.12s',
}

const iconBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: C.textSecondary,
  padding: '3px',
  borderRadius: '5px',
}

const inputStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  outline: 'none',
  fontFamily: 'inherit',
  fontSize: '13px',
  color: C.text,
}

const cellInputStyle: React.CSSProperties = {
  ...inputStyle,
  width: '100%',
  padding: '3px 2px',
}

const cellSelectStyle = (column: Column, value: string | undefined): React.CSSProperties => {
  const opt = value ? column.options.find((o) => o.label === value) : undefined
  return {
    ...inputStyle,
    width: '100%',
    padding: '3px 2px',
    color: opt?.color || C.text,
    fontWeight: value ? 500 : 400,
    cursor: 'pointer',
    background: 'transparent',
  }
}

const pillStyle = (color?: string): React.CSSProperties => ({
  fontSize: '11px',
  padding: '1px 6px',
  borderRadius: '999px',
  background: (color || C.textMuted) + '20',
  color: color || C.textMuted,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  fontWeight: 500,
})

const selStyle: React.CSSProperties = {
  fontSize: '12px',
  padding: '4px 6px',
  borderRadius: '6px',
  border: `1px solid ${C.border}`,
  background: C.surface,
  color: C.text,
  fontFamily: 'inherit',
  cursor: 'pointer',
  outline: 'none',
}
