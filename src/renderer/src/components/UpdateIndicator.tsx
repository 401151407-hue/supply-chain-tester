import React, { useEffect, useState, useCallback } from 'react'
import { Download, CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react'

interface UpdateState {
  status: string
  info?: { version?: string; releaseDate?: string; releaseNotes?: string } | null
  progress: number
  currentVersion: string
}

export function UpdateIndicator() {
  const [updateState, setUpdateState] = useState<UpdateState | null>(null)
  const [checking, setChecking] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const api = (window as any).supplyChainTester

  const refreshState = useCallback(async () => {
    if (!api?.getUpdateState) return
    try {
      const state = await api.getUpdateState()
      setUpdateState(state)
    } catch {}
  }, [])

  useEffect(() => {
    refreshState()
    // 监听主进程推送的更新状态变化
    if (api?.onUpdateStateChanged) {
      const unsub = api.onUpdateStateChanged((state: UpdateState) => {
        setUpdateState(state)
      })
      return () => { if (typeof unsub === 'function') unsub() }
    }
  }, [])

  // 应用启动后自动检查一次
  useEffect(() => {
    const timer = setTimeout(() => {
      if (api?.checkForUpdates) {
        setChecking(true)
        api.checkForUpdates().finally(() => setChecking(false))
      }
    }, 2000)
    return () => clearTimeout(timer)
  }, [])

  async function handleCheck() {
    if (!api?.checkForUpdates || checking) return
    setChecking(true)
    try {
      await api.checkForUpdates()
      await refreshState()
    } catch {} finally {
      setChecking(false)
    }
  }

  async function handleDownload() {
    if (!api?.downloadUpdate || downloading) return
    setDownloading(true)
    try {
      await api.downloadUpdate()
      await refreshState()
    } catch {} finally {
      setDownloading(false)
    }
  }

  function handleInstall() {
    // 局域网更新走独立安装流程
    const isLan = updateState?.info?.releaseNotes?.includes('局域网')
    if (isLan) {
      api?.installLanUpdate?.()
    } else {
      api?.installUpdate?.()
    }
  }

  if (!updateState) return null

  const { status, info, progress, currentVersion } = updateState

  // 空闲状态：显示版本号 + 检查按钮
  if (status === 'idle' || status === 'not-available') {
    return (
      <div className="px-2 py-1.5 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted truncate flex-1">v{currentVersion}</span>
          <button
            onClick={handleCheck}
            disabled={checking}
            className="p-1 rounded hover:bg-hover/10 text-muted hover:text-foreground transition-colors disabled:opacity-50"
            title="检查更新"
          >
            <RefreshCw size={12} className={checking ? 'animate-spin' : ''} />
          </button>
        </div>
        {status === 'not-available' && (
          <p className="text-[10px] text-success flex items-center gap-1">
            <CheckCircle size={10} /> 已是最新
          </p>
        )}
      </div>
    )
  }

  // 检查中
  if (status === 'checking') {
    return (
      <div className="px-2 py-1.5 flex items-center gap-2">
        <Loader2 size={12} className="animate-spin text-muted" />
        <span className="text-[10px] text-muted">检查更新中...</span>
      </div>
    )
  }

  // 发现新版本
  if (status === 'available') {
    const isLan = info?.releaseNotes?.includes('局域网')
    return (
      <div className="px-2 py-1.5 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <AlertCircle size={12} className="text-warning" />
          <span className="text-[10px] text-warning font-medium">新版本 v{info?.version}</span>
          {isLan && <span className="text-[9px] text-accent-light ml-auto">🌐 局域网</span>}
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-1.5 w-full px-2 py-1 rounded text-[10px] font-medium
                     bg-accent/20 hover:bg-accent/30 text-accent-light transition-colors
                     disabled:opacity-50"
        >
          {downloading ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
          {downloading ? '准备下载...' : '下载更新'}
        </button>
      </div>
    )
  }

  // 下载中
  if (status === 'downloading') {
    return (
      <div className="px-2 py-1.5 space-y-1">
        <div className="flex items-center gap-1.5">
          <Download size={12} className="text-accent-light animate-pulse" />
          <span className="text-[10px] text-accent-light">下载中 {progress}%</span>
        </div>
        <div className="h-1 bg-hover/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    )
  }

  // 下载完成，等待安装
  if (status === 'downloaded') {
    return (
      <div className="px-2 py-1.5 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <CheckCircle size={12} className="text-success" />
          <span className="text-[10px] text-success font-medium">v{info?.version} 已就绪</span>
        </div>
        <button
          onClick={handleInstall}
          className="flex items-center gap-1.5 w-full px-2 py-1 rounded text-[10px] font-medium
                     bg-success/20 hover:bg-success/30 text-success transition-colors"
        >
          安装并重启
        </button>
      </div>
    )
  }

  // 错误
  if (status === 'error') {
    return (
      <div className="px-2 py-1.5 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted truncate flex-1">v{currentVersion}</span>
          <button
            onClick={handleCheck}
            disabled={checking}
            className="p-1 rounded hover:bg-hover/10 text-muted hover:text-foreground transition-colors disabled:opacity-50"
            title="重试检查"
          >
            <RefreshCw size={12} className={checking ? 'animate-spin' : ''} />
          </button>
        </div>
        <p className="text-[10px] text-danger">检查失败，点击重试</p>
      </div>
    )
  }

  return null
}
