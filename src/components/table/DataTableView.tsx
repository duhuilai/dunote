import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Plus, Trash2, X, ArrowUpDown, Filter, ArrowUp, ArrowDown,
  BarChart3, MoreHorizontal, GripVertical,
} from 'lucide-react'
import {
  type Column, type Row, type FieldType, type SelectOption, type CellValue,
  FIELD_TYPES, OPTION_COLORS, emptyValueFor, uid,
} from './fieldTypes'
import { confirm } from '@tauri-apps/plugin-dialog'

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

type SortState = { colId: string; dir: 'asc' | 'desc' } | null
type FilterMode = 'contains' | 'equals' | 'empty'
type FilterState = { colId: string; mode: FilterMode; value: string }

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

  const tableWrapRef = useRef<HTMLDivElement>(null)

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
  const addRow = () => {
    const cells: Record<string, CellValue> = {}
    columns.forEach((c) => (cells[c.id] = emptyValueFor(c.type)))
    commit(columns, [...rows, { id: uid('row'), cells }])
  }

  const deleteRow = (rowId: string) => {
    commit(columns, rows.filter((r) => r.id !== rowId))
  }

  const addColumn = () => {
    const col: Column = {
      id: uid('col'),
      name: `列${columns.length + 1}`,
      type: 'text',
      options: [],
      width: DEFAULT_COL_WIDTH,
    }
    const nextCols = [...columns, col]
    const nextRows = rows.map((r) => ({
      ...r,
      cells: { ...r.cells, [col.id]: emptyValueFor('text') },
    }))
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
      list = list.filter((r) => {
        const v = getCell(r, f.colId)
        if (f.mode === 'empty') {
          const empty =
            v === '' || v === null || v === undefined || (Array.isArray(v) && v.length === 0) || v === false
          return empty
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
      style={{ margin: '12px 0', userSelect: 'none' }}
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
          <ToolBtn onClick={addRow} icon={<Plus size={14} />} label="行" />
          <ToolBtn onClick={addColumn} icon={<Plus size={14} />} label="列" />
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
                    <select value={f.colId} onChange={(e) => updateFilter(i, { ...f, colId: e.target.value })} style={selStyle}>
                      <option value="">列…</option>
                      {columns.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                    </select>
                    <select value={f.mode} onChange={(e) => updateFilter(i, { ...f, mode: e.target.value as FilterMode })} style={selStyle}>
                      <option value="contains">包含</option>
                      <option value="equals">等于</option>
                      <option value="empty">为空</option>
                    </select>
                    {f.mode !== 'empty' && (
                      <input
                        value={f.value}
                        onChange={(e) => updateFilter(i, { ...f, value: e.target.value })}
                        placeholder="值"
                        style={{ ...inputStyle, width: '90px' }}
                      />
                    )}
                    <button style={miniBtn} onClick={() => setFilters((arr) => arr.filter((_, j) => j !== i))}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <button style={miniBtn} onClick={() => setFilters((arr) => [...arr, { colId: columns[0]?.id ?? '', mode: 'contains', value: '' }])}>
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
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: '13px' }}>
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
                      <input
                        value={c.name}
                        onChange={(e) => renameColumn(c.id, e.target.value)}
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
                  {columns.map((c) => (
                    <td
                      key={c.id}
                      style={{
                        width: c.width ?? DEFAULT_COL_WIDTH,
                        minWidth: c.width ?? DEFAULT_COL_WIDTH,
                        maxWidth: c.width ?? DEFAULT_COL_WIDTH,
                        borderBottom: `1px solid ${C.border}`,
                        borderRight: `1px solid ${C.border}`,
                        padding: '4px 6px',
                        verticalAlign: 'top',
                        background: C.surface,
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
                  ))}
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
            <input
              value={o.label}
              onChange={(e) => commit(opts.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))}
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
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) setPos({ left: r.left, top: r.bottom + 4 })
    setOpen((v) => !v)
  }

  const firstDay = new Date(view.y, view.m, 1).getDay()
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const sel = parseISO(value)
  const sameYM = sel && sel.getFullYear() === view.y && sel.getMonth() === view.m

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={triggerRef}
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <button
              onClick={() => setView({ y: view.m === 0 ? view.y - 1 : view.y, m: view.m === 0 ? 11 : view.m - 1 })}
              style={{ ...iconBtn, padding: '2px 6px' }}
            >‹</button>
            <div style={{ fontSize: '13px', fontWeight: 600, color: C.text }}>{view.y}年 {view.m + 1}月</div>
            <button
              onClick={() => setView({ y: view.m === 11 ? view.y + 1 : view.y, m: view.m === 11 ? 0 : view.m + 1 })}
              style={{ ...iconBtn, padding: '2px 6px' }}
            >›</button>
          </div>

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
                <button
                  key={d}
                  onClick={() => { onChange(toISO(view.y, view.m, d)); setOpen(false) }}
                  style={{
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 0',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    background: isSel ? C.primary : 'transparent',
                    color: isSel ? '#fff' : isToday ? C.primary : C.text,
                    fontWeight: isSel || isToday ? 600 : 400,
                  }}
                >{d}</button>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
            <button
              onClick={() => { const t = new Date(); setView({ y: t.getFullYear(), m: t.getMonth() }); onChange(toISO(t.getFullYear(), t.getMonth(), t.getDate())); setOpen(false) }}
              style={{ ...miniBtn, flex: 1 }}
            >今天</button>
            <button onClick={() => { onChange(''); setOpen(false) }} style={{ ...miniBtn, flex: 1 }}>清除</button>
          </div>
        </div>
      )}
    </div>
  )
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
    const s = (value as string) || ''
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <input value={s} onChange={(e) => onChange(e.target.value)} placeholder="https://" style={cellInputStyle} />
        {s && (
          <a href={s} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="打开链接" style={{ color: C.primary }}>
            ↗
          </a>
        )}
      </div>
    )
  }

  // text 默认
  return (
    <input
      value={(value as string) || ''}
      onChange={(e) => onChange(e.target.value)}
      style={cellInputStyle}
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
