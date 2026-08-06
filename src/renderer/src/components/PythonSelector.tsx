import React, { useState, useEffect } from 'react'
import { Terminal, Check, Loader2, RotateCw, Package, FolderCog, AlertTriangle } from 'lucide-react'

interface PythonInfo {
  choice: { mode: 'portable' | 'system' | 'custom'; path?: string }
  currentPath: string
  currentVersion?: string
  portable: { exists: boolean; path: string; version?: string }
  systemCandidates: { path: string; version: string }[]
}

const MODE_NAME: Record<string, string> = {
  portable: '便携版',
  system: '系统',
  custom: '自定义',
}

/** Python 解释器选择面板（内嵌在环境检测浮窗中使用） */
export function PythonSelectorPanel() {
  const [info, setInfo] = useState<PythonInfo | null>(null)
  const [customPath, setCustomPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const api = () => (window as any).supplyChainTester

  const applyInfo = (res: any) => {
    if (!res) return
    setInfo(res)
    setCustomPath(res.choice?.mode === 'custom' ? res.choice?.path || '' : '')
  }

  const load = async () => {
    try {
      setErr('')
      const res = await api()?.getPythonInfo?.()
      applyInfo(res)
    } catch (e: any) {
      setErr(e?.message || '加载失败')
    }
  }

  useEffect(() => {
    load()
  }, [])

  const select = async (mode: 'portable' | 'system' | 'custom', path?: string) => {
    if (busy) return
    // 便携版未安装时直接提示，避免静默回退造成困惑
    if (mode === 'portable' && info && !info.portable.exists) {
      setErr('未检测到内置便携版 Python，无法使用。请选择系统 Python 或安装便携版后重试。')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const res = await api()?.setPythonMode?.({ mode, path })
      if (res?.ok) {
        applyInfo(res)
      } else {
        setErr(res?.error || '设置失败')
      }
    } catch (e: any) {
      setErr(e?.message || '设置失败')
    } finally {
      setBusy(false)
    }
  }

  const applyCustom = () => {
    const p = customPath.trim()
    if (!p) {
      setErr('请输入 Python 路径')
      return
    }
    select('custom', p)
  }

  const currentMode = info?.choice?.mode || 'portable'
  const versionShort = (v?: string) => (v || '').replace(/^Python\s*/i, '').trim()

  // 便携版模式但便携版不存在 → 处于自动回退状态（实际使用系统 Python）
  const isPortableFallback = currentMode === 'portable' && !!info && !info.portable.exists

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Terminal size={14} className="text-accent-light" />
          Python 解释器
        </span>
        <button
          onClick={() => load()}
          className="p-1 rounded hover:bg-hover/10 text-muted hover:text-foreground transition-colors"
          title="刷新检测"
        >
          <RotateCw size={12} className={busy ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* 当前使用 */}
      {info && (
        <div className="mb-2 rounded-lg bg-hover/5 px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-widest text-muted mb-0.5">
            当前使用（{MODE_NAME[currentMode]}）
          </div>
          <div className="text-[11px] font-mono text-foreground truncate" title={info.currentPath}>
            {info.currentPath}
          </div>
          {info.currentVersion && (
            <div className="text-[11px] text-accent-light">{info.currentVersion}</div>
          )}
          {isPortableFallback && (
            <div className="mt-1.5 flex items-start gap-1 text-[10px] text-amber-500/90">
              <AlertTriangle size={11} className="shrink-0 mt-px" />
              <span>内置便携版未安装，已自动回退使用系统 Python。若需使用便携版，请安装 python-portable 后再切换。</span>
            </div>
          )}
        </div>
      )}

      <div className="text-[10px] uppercase tracking-widest text-muted mb-1">选择解释器</div>
      <div className="space-y-1">
        {/* 便携版 */}
        <button
          onClick={() => select('portable')}
          disabled={busy}
          className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-left transition-colors
            ${currentMode === 'portable' ? 'bg-accent/10 text-accent-light' : 'hover:bg-hover/5'}
            disabled:opacity-50`}
        >
          <Package size={13} className="shrink-0" />
          <span className="flex-1 text-xs truncate">内置便携版</span>
          {currentMode === 'portable' && <Check size={13} className="shrink-0" />}
          {info && !info.portable.exists && (
            <span className="shrink-0 text-[10px] text-muted/70">未安装</span>
          )}
        </button>

        {/* 系统 Python 列表 */}
        {info?.systemCandidates.map(c => (
          <button
            key={c.path}
            onClick={() => select('system', c.path)}
            disabled={busy}
            className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-left transition-colors
              ${currentMode === 'system' && info?.choice?.path === c.path ? 'bg-accent/10 text-accent-light' : 'hover:bg-hover/5'}
              disabled:opacity-50`}
          >
            <FolderCog size={13} className="shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-[11px] font-mono truncate" title={c.path}>{c.path}</span>
              <span className="block text-[10px] text-muted/70 truncate">{c.version}</span>
            </span>
            {currentMode === 'system' && info?.choice?.path === c.path && (
              <Check size={13} className="shrink-0" />
            )}
          </button>
        ))}

        {/* 自定义路径 */}
        <div className="pt-1.5 border-t border-border/10 mt-1.5">
          <div className="text-[10px] text-muted mb-1">自定义路径</div>
          <div className="flex items-center gap-1.5">
            <input
              value={customPath}
              onChange={e => setCustomPath(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') applyCustom() }}
              placeholder="/usr/bin/python3 或 C:\Python312\python.exe"
              className="flex-1 min-w-0 text-[11px] font-mono bg-surface rounded px-2 py-1.5 border border-border/10 outline-none focus:border-accent/50"
            />
            <button
              onClick={applyCustom}
              disabled={busy}
              className="shrink-0 text-[11px] px-2 py-1.5 rounded bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              应用
            </button>
          </div>
        </div>
      </div>

      {err && (
        <div className="mt-2 text-[11px] text-red-500/90">{err}</div>
      )}
      {busy && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
          <Loader2 size={12} className="animate-spin" /> 正在检测…
        </div>
      )}
    </div>
  )
}
