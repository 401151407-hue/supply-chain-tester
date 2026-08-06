import React, { useState, useRef, useEffect } from 'react'
import { ImagePlus, X, Check, Loader2, Eraser } from 'lucide-react'
import { useAppStore } from '../store'

/**
 * 首页 —— 空白占位页，支持自定义背景
 * 打开 APP 时默认进入此页
 */
export function HomePage() {
  const bgImage = useAppStore(s => s.bgImage)
  const setBgImage = useAppStore(s => s.setBgImage)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const popRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  const importImage = async () => {
    try {
      setError('')
      setLoading(true)
      const api = (window as any).supplyChainTester
      if (!api?.pickImage) {
        setError('当前环境不支持导入图片')
        return
      }
      const res = await api.pickImage()
      if (res?.ok && res.dataUrl) {
        setBgImage(res.dataUrl)
        setOpen(false)
      } else if (res?.canceled) {
        // 用户取消
      } else {
        setError(res?.error || '导入失败')
      }
    } catch (err: any) {
      setError(`导入失败: ${err?.message || err}`)
    } finally {
      setLoading(false)
    }
  }

  const clearBg = () => {
    setBgImage('')
    setOpen(false)
  }

  return (
    <div className="relative h-full w-full">
      {/* 顶部窗口拖拽区（macOS hiddenInset 标题栏，透明可拖动整个 APP） */}
      <div className="drag-region absolute inset-x-0 top-0 z-40 h-12" />

      {/* 空内容区 —— 透明，露出自定义背景 */}
      {!bgImage && (
        <div className="flex h-full w-full items-center justify-center">
          <p className="select-none text-sm tracking-wide text-surface-foreground/30">
            欢迎使用测易融
          </p>
        </div>
      )}

      {/* 背景设置浮动控件 */}
      <div ref={popRef} className="absolute bottom-5 right-5 z-50 flex flex-col items-end gap-2">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
            {error}
          </div>
        )}
        {open && (
          <div className="w-64 animate-in fade-in-0 zoom-in-95 rounded-2xl border border-border/60 bg-popover/95 p-3 shadow-xl shadow-black/10 backdrop-blur-xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">自定义背景</span>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-2">
              {bgImage ? (
                <>
                  <div className="relative h-32 overflow-hidden rounded-xl border border-border/60">
                    <img src={bgImage} alt="背景预览" className="h-full w-full object-cover" />
                    <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white backdrop-blur">
                      <Check className="h-3 w-3 text-emerald-400" /> 已启用
                    </span>
                  </div>
                  <button
                    onClick={importImage}
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    更换图片
                  </button>
                  <button
                    onClick={clearBg}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                  >
                    <Eraser className="h-4 w-4" />
                    清除背景
                  </button>
                </>
              ) : (
                <button
                  onClick={importImage}
                  disabled={loading}
                  className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border/70 px-3 py-6 text-sm text-muted-foreground transition-colors hover:border-accent/60 hover:text-accent"
                >
                  {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
                  <span>导入图片作为背景</span>
                  <span className="text-[11px] opacity-60">支持 PNG / JPG / WEBP / GIF，20MB 以内</span>
                </button>
              )}
            </div>
          </div>
        )}
        {!open && (
          <button
            onClick={() => setOpen(true)}
            title="自定义背景"
            className="group flex items-center gap-2 rounded-full border border-border/60 bg-popover/80 px-4 py-2.5 text-sm text-muted-foreground shadow-lg shadow-black/5 backdrop-blur-xl transition-all hover:border-accent/50 hover:text-accent"
          >
            <ImagePlus className="h-4 w-4" />
            背景
          </button>
        )}
      </div>
    </div>
  )
}

