/**
 * isomorphic-git 的 fs 适配器（基于 @tauri-apps/plugin-fs）
 *
 * 设计要点：
 * - 本机不依赖系统 git：isomorphic-git 完全用 JS 实现 git 协议，所有磁盘读写
 *   走 Tauri 的 fs 插件，因此「软件自带 git」，即使目标机器没装 git 也能备份。
 * - isomorphic-git 内部传给 fs 的路径大多是「绝对路径」（dir + 相对路径拼接而成，
 *   如 `D:/notes/.git/HEAD`）。适配器对绝对路径原样透传（按平台规范化分隔符），
 *   对极少数相对路径则拼到 root 下。
 * - 错误码翻译：Tauri 的 fs 报错没有标准 POSIX code，这里根据 message 关键词
 *   翻译成 isomorphic-git 期望的 ENOENT / EEXIST / ENOTDIR / EISDIR 等，否则
 *   init / add / commit / log 会因为拿不到 ENOENT 而判断失误。
 */
import * as tauriFs from '@tauri-apps/plugin-fs'

const isWin = typeof navigator !== 'undefined' && /Win/i.test(navigator.platform || navigator.userAgent || '')

/** 规范化路径分隔符：Windows 下统一转成反斜杠，避免 Tauri/Rust 解析歧义 */
function norm(p: string): string {
  if (isWin) return p.replace(/\//g, '\\')
  return p.replace(/\\/g, '/')
}

/** 去掉路径两端的斜杠/反斜杠 */
function stripSlashes(p: string): string {
  return p.replace(/^[\\/]+/, '').replace(/[\\/]+$/, '')
}

/** 判断 isomorphic-git 传入的路径是否已经是绝对路径 */
function isAbsolute(p: string): boolean {
  if (/^[A-Za-z]:[\\/]/.test(p)) return true // Windows 盘符
  if (p.startsWith('/')) return true // POSIX 绝对
  return false
}

/** 把 fs 调用路径解析成 Tauri 可接受的绝对路径 */
function resolve(root: string, p: string): string {
  const clean = (p || '').replace(/^\.\//, '')
  if (isAbsolute(clean)) return norm(clean)
  const r = stripSlashes(root)
  const c = stripSlashes(clean)
  if (!r) return norm('/' + c)
  return norm(r + '/' + c)
}

function translateError(err: any, fallback = 'EIO'): any {
  const msg = (err && err.message ? err.message : String(err || '')) as string
  let code = fallback
  // 命令未暴露 / 无权限（如 capability 漏配导致 "command ... not found"）——
  // 必须识别为权限错误，绝不能误判成「文件不存在」，否则上层会抛出误导性的
  // "Could not find xxx" 而掩盖真实原因。
  if (/command|not allowed|denied|permission/i.test(msg)) code = 'EPERM'
  else if (/not found|no such file|ENOENT/i.test(msg)) code = 'ENOENT'
  else if (/EEXIST|already exists/i.test(msg)) code = 'EEXIST'
  else if (/ENOTDIR|not a directory/i.test(msg)) code = 'ENOTDIR'
  else if (/EISDIR|is a directory/i.test(msg)) code = 'EISDIR'
  else if (/EACCES|permission denied/i.test(msg)) code = 'EACCES'
  const e: any = new Error(msg || code)
  e.code = code
  return e
}

function toStats(info: any) {
  const type: 'file' | 'dir' = info.isDirectory ? 'dir' : 'file'
  return {
    type,
    mode: info.isSymlink ? 0 : info.isDirectory ? 0o040000 : 0o100000,
    size: info.size || 0,
    ino: 0,
    mtimeMs: info.mtime ? info.mtime.getTime() : 0,
    ctimeMs: info.birthtime ? info.birthtime.getTime() : 0,
    uid: 0,
    gid: 0,
    dev: 0,
    isFile: () => !info.isDirectory && !info.isSymlink,
    isDirectory: () => !!info.isDirectory,
    isSymbolicLink: () => !!info.isSymlink,
  }
}

export interface GitFs {
  root: string
  readFile: (path: string, opts?: { encoding?: string }) => Promise<any>
  writeFile: (path: string, data: any, opts?: any) => Promise<void>
  unlink: (path: string) => Promise<void>
  readdir: (path: string) => Promise<string[]>
  mkdir: (path: string, opts?: any) => Promise<void>
  rmdir: (path: string) => Promise<void>
  stat: (path: string) => Promise<any>
  lstat: (path: string) => Promise<any>
  readlink: (path: string) => Promise<string>
  symlink: (target: string, path: string) => Promise<void>
  chmod: (path: string, mode: number) => Promise<void>
}

export function makeTauriFs(root: string): GitFs {
  return {
    root,
    async readFile(path, opts) {
      try {
        const data = await tauriFs.readFile(resolve(root, path))
        if (opts && opts.encoding) return Buffer.from(data).toString(opts.encoding as BufferEncoding)
        return Buffer.from(data)
      } catch (e) {
        throw translateError(e, 'ENOENT')
      }
    },
    async writeFile(path, data, _opts) {
      try {
        const buf = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data as Uint8Array)
        await tauriFs.writeFile(resolve(root, path), new Uint8Array(buf), { create: true })
      } catch (e) {
        throw translateError(e)
      }
    },
    async unlink(path) {
      try {
        await tauriFs.remove(resolve(root, path))
      } catch (e) {
        throw translateError(e, 'ENOENT')
      }
    },
    async readdir(path) {
      try {
        const entries = await tauriFs.readDir(resolve(root, path))
        return entries.map((e) => e.name)
      } catch (e) {
        throw translateError(e, 'ENOENT')
      }
    },
    async mkdir(path, opts) {
      const recursive = !!(opts && (opts as any).recursive)
      const full = resolve(root, path)
      try {
        const ex = await tauriFs.exists(full)
        if (ex) {
          if (!recursive) throw translateError({ message: 'EEXIST' }, 'EEXIST')
          return
        }
        await tauriFs.mkdir(full, { recursive })
      } catch (e) {
        if ((e as any).code === 'EEXIST') throw e
        throw translateError(e)
      }
    },
    async rmdir(path) {
      try {
        await tauriFs.remove(resolve(root, path), { recursive: true })
      } catch (e) {
        throw translateError(e, 'ENOENT')
      }
    },
    async stat(path) {
      try {
        const info = await tauriFs.stat(resolve(root, path))
        return toStats(info)
      } catch (e) {
        throw translateError(e, 'ENOENT')
      }
    },
    async lstat(path) {
      // .git 内无符号链接，直接走 stat
      return this.stat(path)
    },
    async readlink() {
      throw translateError({ message: 'ENOTSUP' }, 'ENOTSUP')
    },
    async symlink() {
      // 备份仓库不使用符号链接，noop
    },
    async chmod() {
      // Windows 上权限忽略
    },
  }
}
