import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Terminal, X } from 'lucide-react'

interface DialogRequest {
  title?: string
  prompt: string
  options?: string[]
  notify?: boolean   // 纯提醒模式，无输入框，只有确定按钮
}

/**
 * 脚本交互弹窗（与环境检测浮窗风格一致）
 * - 无 options: 文本输入框
 * - 有 options: 单选列表
 */
export function InputDialog() {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [title, setTitle] = useState('脚本交互')
  const [options, setOptions] = useState<string[] | undefined>(undefined)
  const [value, setValue] = useState('')
  const [selected, setSelected] = useState('')
  const [notify, setNotify] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const api = () => (window as any).supplyChainTester

  const handleRequest = useCallback((req: DialogRequest) => {
    setTitle(req.title || '脚本交互')
    setPrompt(req.prompt)
    setNotify(req.notify || false)
    setOptions(req.options)
    setValue('')
    setSelected(req.options?.[0] || '')
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  useEffect(() => {
    const a = api()
    if (!a?.onRequestDialogInput) return
    const unsub = a.onRequestDialogInput((req: DialogRequest) => {
      handleRequest(req)
    })
    return unsub
  }, [handleRequest])

  const confirm = () => {
    const result = options ? selected : value.trim()
    api()?.sendDialogInput?.(result)
    setOpen(false)
  }

  const cancel = () => {
    api()?.sendDialogInput?.('__CANCEL__')
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !options) confirm()
    if (e.key === 'Escape') cancel()
  }

  if (!open) return null

  const isSelect = !!(options && options.length > 0)

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-[440px] max-h-[80vh] overflow-hidden flex flex-col animate-zoom-in"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/10 shrink-0">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Terminal size={14} className="text-accent-light" />
            {title}
          </span>
          <button onClick={cancel}
            className="p-1 rounded hover:bg-hover/10 text-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3 overflow-y-auto min-h-0 flex-1 max-h-[55vh]">
          <p className="text-sm text-foreground whitespace-pre-wrap">{prompt}</p>

          {isSelect ? (
            <div className="space-y-1">
              {options!.map((opt, i) => (
                <label
                  key={i}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors
                    ${selected === opt ? 'bg-accent/10 text-accent-light' : 'hover:bg-hover/5'}`}
                  onKeyDown={e => { if (e.key === 'Enter') confirm() }}
                >
                  <input type="radio" name="dialog-option" value={opt}
                    checked={selected === opt} onChange={() => setSelected(opt)}
                    className="sr-only" />
                  <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${selected === opt ? 'border-accent' : 'border-border/50'}`}>
                    {selected === opt && <span className="w-2 h-2 rounded-full bg-accent" />}
                  </span>
                  <span className="text-sm font-mono truncate">{opt}</span>
                </label>
              ))}
            </div>
          ) : notify ? null : (
            <input ref={inputRef} value={value} onChange={e => setValue(e.target.value)}
              onKeyDown={onKeyDown} placeholder="在此输入…" autoFocus
              className="w-full text-sm font-mono bg-surface-light rounded-lg px-3 py-2.5 border border-border/20 outline-none focus:border-accent/50 transition-colors" />
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            {!notify && (
              <button onClick={cancel}
                className="px-4 py-2 rounded-lg text-sm text-muted hover:text-foreground hover:bg-hover/10 transition-colors">
                取消
              </button>
            )}
            <button onClick={confirm}
              className="px-4 py-2 rounded-lg text-sm bg-accent text-accent-foreground hover:bg-accent/90 transition-colors">
              确定
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
