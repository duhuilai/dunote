import { Download, RefreshCw, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react'
import { useAppStore } from '@/store'
import {
  downloadUpdate,
  openInstaller,
  openReleasePage,
  formatBytes,
  type UpdateDownloadState,
} from '@/utils/update'

interface Props {
  /** compact: 侧边栏窄条；full: 设置页完整卡片 */
  variant?: 'compact' | 'full'
}

export default function UpdateDownloader({ variant = 'full' }: Props) {
  const updateInfo = useAppStore((s) => s.updateInfo)
  const dl = useAppStore((s) => s.updateDownload) as UpdateDownloadState
  const setUpdateDownload = useAppStore((s) => s.setUpdateDownload)
  const resetUpdateDownload = useAppStore((s) => s.resetUpdateDownload)
  const showToast = useAppStore((s) => s.showToast)

  if (!updateInfo?.hasUpdate) return null

  const handleDownload = async () => {
    const url = updateInfo.assetUrl
    const name = updateInfo.assetName
    if (!url || !name) {
      // 兜底：无对应平台安装包时直接打开发布页
      await openReleasePage(updateInfo.releaseUrl)
      return
    }
    resetUpdateDownload()
    setUpdateDownload({ status: 'downloading', progress: 0, loaded: 0, total: 0, filePath: null, error: null })
    const res = await downloadUpdate(url, name, (loaded, total) => {
      const pct = total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : 0
      setUpdateDownload({ progress: pct, loaded, total })
    })
    if (res.ok && res.filePath) {
      setUpdateDownload({ status: 'downloaded', progress: 100, loaded: dl.total || 0, total: dl.total || 0, filePath: res.filePath, error: null })
      showToast('下载完成，点击安装', 'success')
    } else {
      setUpdateDownload({ status: 'failed', error: res.message })
      showToast(res.message, 'error')
    }
  }

  const handleInstall = async () => {
    if (!dl.filePath) return
    const res = await openInstaller(dl.filePath)
    if (!res.ok) showToast(res.message, 'error')
  }

  const indeterminate = dl.status === 'downloading' && dl.total <= 0
  const fillClass = `dl-progress-fill${indeterminate ? ' indeterminate' : ''}`

  /* ── 已下载完成：显示「安装」按钮 ── */
  if (dl.status === 'downloaded') {
    const installBtn = (
      <button
        onClick={handleInstall}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          width: variant === 'compact' ? '100%' : 'auto',
          padding: '8px 16px', borderRadius: 8,
          border: 'none', background: '#166534', color: '#fff',
          fontSize: variant === 'compact' ? 12 : 13, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <CheckCircle2 size={variant === 'compact' ? 14 : 15} />
        安装
      </button>
    )
    if (variant === 'compact') return installBtn
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {installBtn}
        <span style={{ fontSize: 12, color: '#166534' }}>
          安装包已下载完成{updateInfo.assetName ? `（${updateInfo.assetName}）` : ''}
        </span>
      </div>
    )
  }

  /* ── 下载失败：显示错误 + 重试 ── */
  if (dl.status === 'failed') {
    const retryBtn = (
      <button
        onClick={handleDownload}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          width: variant === 'compact' ? '100%' : 'auto',
          padding: '8px 16px', borderRadius: 8,
          border: '1px solid #2563EB', background: '#fff', color: '#2563EB',
          fontSize: variant === 'compact' ? 12 : 13, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <RotateCcw size={variant === 'compact' ? 14 : 15} />
        重试
      </button>
    )
    if (variant === 'compact') return retryBtn
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12, color: '#991B1B', display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertCircle size={14} />
          {dl.error || '下载失败'}
        </div>
        {retryBtn}
      </div>
    )
  }

  /* ── 下载中：显示进度条 ── */
  if (dl.status === 'downloading') {
    const pctText = dl.total > 0 ? `${dl.progress}%` : '下载中…'
    const sizeText =
      dl.total > 0
        ? `${formatBytes(dl.loaded)} / ${formatBytes(dl.total)}`
        : formatBytes(dl.loaded)
    if (variant === 'compact') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#166534' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={12} className="spin" />
              {pctText}
            </span>
          </div>
          <div className="dl-progress-track">
            <div className={fillClass} style={{ width: `${dl.progress}%` }} />
          </div>
        </div>
      )
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#166534' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} className="spin" />
            正在下载更新…
          </span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{pctText}</span>
        </div>
        <div className="dl-progress-track">
          <div className={fillClass} style={{ width: `${dl.progress}%` }} />
        </div>
        <div style={{ fontSize: 11, color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>{sizeText}</div>
      </div>
    )
  }

  /* ── idle：显示「下载并更新」按钮 ── */
  const downloadBtn = (
    <button
      onClick={handleDownload}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        width: variant === 'compact' ? '100%' : 'auto',
        padding: variant === 'compact' ? '7px 10px' : '8px 16px',
        borderRadius: 8,
        border: variant === 'compact' ? '1px solid #BBF7D0' : 'none',
        background: variant === 'compact' ? '#F0FDF4' : '#166534',
        color: variant === 'compact' ? '#166534' : '#fff',
        fontSize: variant === 'compact' ? 12 : 13,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <Download size={variant === 'compact' ? 14 : 15} />
      {variant === 'compact' ? `发现新版本 v${updateInfo.latestVersion}` : '下载并更新'}
    </button>
  )
  return downloadBtn
}
