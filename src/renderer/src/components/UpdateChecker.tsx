import React, { useState, useEffect } from 'react'
import { Download, RefreshCw, CheckCircle2, AlertTriangle, Rocket, X, Loader2 } from 'lucide-react'

interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  info?: { version?: string; releaseDate?: string; releaseNotes?: string } | null
  progress?: number
  currentVersion?: string
}

export function UpdateChecker() {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  const [showModal, setShowModal] = useState(false)
  const [checking, setChecking] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    const api = (window as any).supplyChainTester
    if (!api?.onUpdateStateChanged) return

    // 初始获取状态
    api.getUpdateState().then((s: UpdateState) => setState(s))

    // 监听状态变化
    const unsub = api.onUpdateStateChanged((s: UpdateState) => {
      setState(s)
      if (s.status === 'available') setShowModal(true)
    })
    return unsub
  }, [])

  async function handleCheck() {
    const api = (window as any).supplyChainTester
    if (!api?.checkForUpdates || checking) return
    setChecking(true)
    try {
      const s = await api.checkForUpdates()
      setState(s)
      if (s.status === 'available' || s.status === 'not-available') {
        setShowModal(true)
      }
    } finally {
      setChecking(false)
    }
  }

  async function handleDownload() {
    const api = (window as any).supplyChainTester
    if (!api?.downloadUpdate || downloading) return
    setDownloading(true)
    try {
      const s = await api.downloadUpdate()
      setState(s)
    } finally {
      setDownloading(false)
    }
  }

  function handleInstall() {
    ;(window as any).supplyChainTester?.installUpdate()
  }

  const badge = () => {
    switch (state.status) {
      case 'checking': return { icon: <Loader2 size={12} className="animate-spin text-accent-light" />, text: '检查中...', cls: 'text-accent-light' }
      case 'available': return { icon: <Rocket size={12} className="text-purple-400" />, text: `v${state.info?.version}`, cls: 'text-purple-400' }
      case 'downloading': return { icon: <Download size={12} className="animate-bounce text-accent-light" />, text: `${state.progress ?? 0}%`, cls: 'text-accent-light' }
      case 'downloaded': return { icon: <CheckCircle2 size={12} className="text-success" />, text: '可安装', cls: 'text-success' }
      case 'not-available': return { icon: <CheckCircle2 size={12} className="text-muted" />, text: '已是最新', cls: 'text-muted' }
      case 'error': return { icon: <AlertTriangle size={12} className="text-danger" />, text: '出错', cls: 'text-danger' }
      default: return { icon: <RefreshCw size={12} className="text-muted" />, text: `v${state.currentVersion ?? ''}`, cls: 'text-muted' }
    }
  }

  const b = badge()

  return (
    <>
      <button
        onClick={() => state.status === 'idle' || state.status === 'not-available' ? handleCheck() : setShowModal(true)}
        className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs transition-colors hover:bg-hover/5 group"
        title="检查更新"
      >
        {b.icon}
        <span className={b.cls}>更新 {b.text}</span>
        {((state.status === 'idle' || state.status === 'not-available') && !checking) && (
          <RefreshCw size={11} className="ml-auto text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </button>

      {/* 更新弹窗 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-surface-light border border-border/10 rounded-2xl w-[420px] shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/5">
              <div className="flex items-center gap-2">
                <Rocket size={16} className="text-purple-400" />
                <h3 className="text-sm font-semibold">软件更新</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1 rounded hover:bg-hover/10 text-muted hover:text-foreground">
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              {/* 当前版本 */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">当前版本</span>
                <span className="font-mono text-foreground">v{state.currentVersion}</span>
              </div>

              {/* 状态 */}
              {state.status === 'checking' && (
                <div className="flex items-center gap-2 text-accent-light bg-accent/5 rounded-lg px-3 py-2.5">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-xs">正在检查更新...</span>
                </div>
              )}
              {state.status === 'not-available' && (
                <div className="flex items-center gap-2 text-success bg-success/5 rounded-lg px-3 py-2.5">
                  <CheckCircle2 size={14} />
                  <span className="text-xs">已是最新版本</span>
                </div>
              )}
              {state.status === 'available' && (
                <>
                  <div className="flex items-center gap-2 text-purple-400 bg-purple-500/5 rounded-lg px-3 py-2.5">
                    <Rocket size={14} />
                    <span className="text-xs font-medium">发现新版本 v{state.info?.version}</span>
                  </div>
                  {state.info?.releaseNotes && (
                    <div className="bg-surface rounded-lg p-3 max-h-32 overflow-y-auto">
                      <p className="text-[11px] text-muted whitespace-pre-wrap">{state.info.releaseNotes}</p>
                    </div>
                  )}
                  {!downloading && (
                    <button onClick={handleDownload}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium
                                 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 transition-colors">
                      <Download size={14} />
                      下载更新
                    </button>
                  )}
                </>
              )}
              {state.status === 'downloading' && (
                <>
                  <div className="flex items-center gap-2 text-accent-light bg-accent/5 rounded-lg px-3 py-2.5">
                    <Download size={14} className="animate-bounce" />
                    <span className="text-xs">正在下载... {state.progress}%</span>
                  </div>
                  <div className="w-full bg-surface rounded-full h-2 overflow-hidden">
                    <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${state.progress ?? 0}%` }} />
                  </div>
                </>
              )}
              {state.status === 'downloaded' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-success bg-success/5 rounded-lg px-3 py-2.5">
                    <CheckCircle2 size={14} />
                    <span className="text-xs">下载完成，重启即可安装</span>
                  </div>
                  <button onClick={handleInstall}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium
                               bg-success/20 hover:bg-success/30 text-success transition-colors">
                    <Rocket size={14} />
                    立即重启安装
                  </button>
                </div>
              )}
              {state.status === 'error' && (
                <div className="flex items-center gap-2 text-danger bg-danger/5 rounded-lg px-3 py-2.5">
                  <AlertTriangle size={14} />
                  <span className="text-xs">检查更新失败，请稍后重试</span>
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-border/5 flex justify-between">
              <button onClick={handleCheck} disabled={checking}
                className="flex items-center gap-1 px-3 py-1.5 rounded text-xs text-muted hover:text-foreground hover:bg-hover/10 transition-colors disabled:opacity-50">
                <RefreshCw size={11} className={checking ? 'animate-spin' : ''} />
                重新检查
              </button>
              <button onClick={() => setShowModal(false)}
                className="px-4 py-1.5 rounded text-xs text-muted hover:text-foreground hover:bg-hover/10 transition-colors">
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
