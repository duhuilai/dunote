/**
 * 浏览器 / Tauri WebView 环境补丁：
 * isomorphic-git 把 Buffer、process 当作全局变量使用，但 WebView 里默认没有。
 * 这里在模块加载时把它们挂到 globalThis 上，确保 git 备份功能可运行。
 * 在 main.tsx 顶部 import 一次即可（幂等）。
 */
import { Buffer } from 'buffer'
import process from 'process'

const g = globalThis as any
if (typeof g.Buffer === 'undefined') {
  g.Buffer = Buffer
}
if (typeof g.process === 'undefined') {
  g.process = process
}

export {}
