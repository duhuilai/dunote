import type { SearchDtMatch } from './search'

// 检索状态广播：search 插件在命中智能表格单元格时通知 React 节点视图，
// 让其高亮对应的单元格并参与「上一个/下一个」定位。
export interface SearchBroadcast {
  query: string
  current: SearchDtMatch | null
  matches: SearchDtMatch[]
}

let state: SearchBroadcast = { query: '', current: null, matches: [] }
const listeners = new Set<() => void>()

export function setSearchBroadcast(next: SearchBroadcast): void {
  state = next
  listeners.forEach((l) => l())
}

export function getSearchBroadcast(): SearchBroadcast {
  return state
}

export function subscribeSearchBroadcast(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
