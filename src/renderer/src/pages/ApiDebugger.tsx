import React, { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Send, Loader2, Clock, Plus, Trash2, Copy, ChevronDown, Save, Bookmark, X, FolderPlus, Folder, ChevronRight, Variable, Search, Sparkles, CheckCircle2, Eye, Code2, FileCode, Upload, Download, Gauge, Zap, AlertCircle, Pencil } from 'lucide-react'
import { useAppStore } from '../store'
import { EditorView, keymap, lineNumbers, highlightActiveLine, Decoration, ViewPlugin, MatchDecorator, ViewUpdate } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { defaultKeymap } from '@codemirror/commands'

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const
type TabKey = 'params' | 'headers' | 'body' | 'prescript' | 'postscript'

interface HeaderRow { id: number; key: string; value: string }
interface HistoryItem { method: string; url: string; status?: number; duration?: number; time: string }

interface SavedRequest {
  id: string; name: string; method: string; url: string
  headers: { key: string; value: string }[]; params: { key: string; value: string }[]
  body: string; preScript: string; postScript: string; createdAt: string
}
interface Collection {
  id: string; name: string; items: SavedRequest[]
}

interface VarItem { id: string; key: string; value: string; comment: string }

// ── 模块级状态缓存（跨导航保持数据不丢失）──
let cachedTabs: TabState[] | null = null
let cachedActiveTabId: string | null = null
let cachedHistory: HistoryItem[] | null = null
let cachedExpandedIds: string[] | null = null

interface TabState {
  id: string
  name: string
  method: string
  url: string
  headers: HeaderRow[]
  params: HeaderRow[]
  body: string
  preScript: string
  postScript: string
  response: {
    status?: number; statusText?: string; headers?: Record<string,string>
    body?: string; duration?: number; error?: string
  } | null
  editingRequest: { collId: string; reqId: string } | null
}

function newBlankTab(name?: string): TabState {
  return {
    id: uid(),
    name: name || '新请求',
    method: 'POST',
    url: '',
    headers: [{ id: 1, key: '', value: '' }],
    params: [{ id: 1, key: '', value: '' }],
    body: '',
    preScript: '',
    postScript: '',
    response: null,
    editingRequest: null,
  }
}

function uid(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function loadVars(env: string): VarItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(`api_vars_${env}`) || '[]')
    return raw.map((v: any) => ({ id: v.id || uid(), key: v.key, value: v.value, comment: v.comment || '' }))
  } catch { return [] }
}
function persistVars(env: string, vars: VarItem[]) {
  localStorage.setItem(`api_vars_${env}`, JSON.stringify(vars))
}

/** 生成合法格式随机身份证号 */
function genIdCard(): string {
  const area = String(Math.floor(Math.random() * 900000) + 100000)
  const y = 1970 + Math.floor(Math.random() * 40)
  const m = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')
  const d = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')
  const seq = Array(3).fill(0).map(() => Math.floor(Math.random() * 10)).join('')
  const raw = area + y + m + d + seq
  const w = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
  const ck = '10X98765432'
  let s = 0; for (let i = 0; i < 17; i++) s += parseInt(raw[i]) * w[i]
  return raw + ck[s % 11]
}

/** 生成随机统一社会信用代码 */
function genCreditCode(): string {
  const chars = '0123456789ABCDEFGHJKLMNPQRTUWXY'
  return Array(18).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('')
}

/** 解析 cURL 命令 */
function parseCurl(curl: string): { method: string; url: string; headers: { key: string; value: string }[]; body: string } | null {
  try {
    const clean = curl.replace(/\s*\\\n\s*/g, ' ').trim()
    let method = 'GET'
    let url = ''
    const headers: { key: string; value: string }[] = []
    let body = ''

    // Extract URL
    const urlMatch = clean.match(/curl\s+(?:-[^\s]+\s+)*['"]?(https?:\/\/[^\s'"]+)['"]?/)
    if (urlMatch) url = urlMatch[1]
    // Also try: curl 'url' pattern
    if (!url) {
      const m2 = clean.match(/curl\s+['"]?(https?:\/\/[^\s'"]+)['"]?/)
      if (m2) url = m2[1]
    }

    // Method
    const methodMatch = clean.match(/-X\s+['"]?(\w+)['"]?/i)
    if (methodMatch) method = methodMatch[1].toUpperCase()

    // Headers
    const headerRegex = /-H\s+['"]([^'"]+)['"]/g
    let hm: RegExpExecArray | null
    while ((hm = headerRegex.exec(clean)) !== null) {
      const colonIdx = hm[1].indexOf(':')
      if (colonIdx > 0) headers.push({ key: hm[1].slice(0, colonIdx).trim(), value: hm[1].slice(colonIdx + 1).trim() })
    }

    // Body / Data
    const dataMatch = clean.match(/(?:--data(?:-raw|-binary)?|-d)\s+['"]([^'"]+)['"]/)
    if (dataMatch) body = dataMatch[1]
    if (!body) {
      const dm2 = clean.match(/(?:--data(?:-raw|-binary)?|-d)\s+([^\s-][^'"]+?)(?:\s+-|$)/)
      if (dm2) body = dm2[1]
    }

    if (!url) return null
    return { method, url, headers, body }
  } catch { return null }
}

/** 替换字符串中的 {{变量}} */
function interpolate(str: string, vars: VarItem[]): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    const v = vars.find(v => v.key === name)
    if (v) return v.value
    // 系统内置变量
    switch (name) {
      case 'timestampMs': return Date.now().toString()
      case 'randomInt': return Math.floor(Math.random() * 10000).toString()
      case 'randomStr': return Math.random().toString(36).slice(2, 10)
      case 'today': return new Date().toISOString().slice(0, 10)
      case 'yesterday': return new Date(Date.now() - 86400000).toISOString().slice(0, 10)
      case 'tomorrow': return new Date(Date.now() + 86400000).toISOString().slice(0, 10)
      case 'randomPhone': return '1' + String(Math.floor(Math.random() * 9) + 3) + Array(9).fill(0).map(() => Math.floor(Math.random() * 10)).join('')
      case 'randomId': return Array(18).fill(0).map(() => Math.floor(Math.random() * 10)).join('')
      case 'guid': return crypto.randomUUID().replace(/-/g, '')
      case 'randomIdCard': return genIdCard()
      case 'randomCreditCode': return genCreditCode()
      case 'timestamp': return Math.floor(Date.now() / 1000).toString()
      case 'uuid': return crypto.randomUUID()
    }
    return `{{${name}}}`
  })
}

/** 渲染带变量高亮的文本片段 */
function renderHighlightedText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  const regex = /\{\{(\w+)\}\}/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    parts.push(
      <span key={match.index} className="text-[#7dd3fc] bg-[#7dd3fc]/15 rounded px-0.5 font-medium italic">
        {match[0]}
      </span>
    )
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return parts
}

/** 带 {{变量}} 高亮的输入框 */
function HighlightedInput({ value, onChange, onKeyDown, onBlur, placeholder, className = '' }: {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className="relative flex-1">
      {/* 高亮背景层 */}
      <div
        className={`absolute inset-0 pointer-events-none overflow-hidden flex items-center px-3 text-sm font-mono whitespace-pre ${className}`}
        aria-hidden="true"
      >
        <span className={value ? '' : 'text-muted/30'}>
          {value ? renderHighlightedText(value) : placeholder}
        </span>
      </div>
      {/* 透明前景输入层 */}
      <input
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        placeholder={placeholder}
        className={`w-full h-full px-3 text-sm font-mono outline-none bg-transparent border border-border/5 focus:border-accent/50 transition-colors placeholder:text-transparent text-transparent caret-foreground rounded-lg ${className}`}
        style={{ color: 'transparent', caretColor: 'rgb(var(--color-foreground))' }}
      />
    </div>
  )
}

/** CodeMirror {{变量}} 高亮装饰器 */
const varMatchDecorator = new MatchDecorator({
  regexp: /\{\{(\w+)\}\}/g,
  decoration: (match) => {
    const name = match[1]
    const exists = true // 由调用方通过 envVars 判断，这里先统一高亮
    return Decoration.mark({
      class: 'cm-var-interpolation',
      attributes: { 'data-var': name }
    })
  }
})

const varHighlightPlugin = ViewPlugin.fromClass(class {
  decorations: any
  constructor(view: EditorView) {
    this.decorations = varMatchDecorator.createDeco(view)
  }
  update(update: ViewUpdate) {
    this.decorations = varMatchDecorator.updateDeco(update, this.decorations)
  }
}, { decorations: v => v.decorations })

function loadCollections(): Collection[] {
  try {
    const raw = localStorage.getItem('api_collections')
    if (raw) return JSON.parse(raw)
    // 迁移旧数据
    const old = localStorage.getItem('api_saved')
    if (old) {
      const oldList: SavedRequest[] = JSON.parse(old)
      if (oldList.length > 0) {
        const migrated = [{ id: 'default', name: '默认分组', items: oldList }]
        localStorage.setItem('api_collections', JSON.stringify(migrated))
        localStorage.removeItem('api_saved')
        return migrated
      }
    }
  } catch { }
  return []
}
function persistCollections(list: Collection[]) {
  localStorage.setItem('api_collections', JSON.stringify(list))
}

/** JSON 编辑器（CodeMirror 语法高亮） */
function JsonEditor({ value, onChange, readOnly, contentRef }: {
  value: string
  onChange?: (v: string) => void
  readOnly?: boolean
  /** 实时同步最新编辑器内容到该 ref，绕过 React 状态异步延迟 */
  contentRef?: React.MutableRefObject<string>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const skipSyncRef = useRef(false)

  useEffect(() => {
    if (!containerRef.current || viewRef.current) return
    const view = new EditorView({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        keymap.of(defaultKeymap),
        json(),
        oneDark,
        varHighlightPlugin,
        EditorState.readOnly.of(readOnly || false),
        !readOnly && EditorView.updateListener.of(update => {
          if (update.docChanged) {
            const newVal = update.state.doc.toString()
            skipSyncRef.current = true
            // 实时同步到 ref，确保父组件能读到最新值
            if (contentRef) contentRef.current = newVal
            onChange?.(newVal)
          }
        }),
      ].filter(Boolean),
      parent: containerRef.current,
    })
    viewRef.current = view
    // 初始化 ref
    if (contentRef) contentRef.current = value
    return () => { view.destroy(); viewRef.current = null }
  }, [])

  // 外部格式化时同步内容（美化的 JSON）
  useEffect(() => {
    const view = viewRef.current
    if (!view || skipSyncRef.current) {
      skipSyncRef.current = false
      return
    }
    const current = view.state.doc.toString()
    if (value !== current) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    }
  }, [value])

  return <div ref={containerRef} className="flex-1 overflow-hidden rounded-lg border border-border/5 focus-within:border-accent/50" />
}

/** ── JSON 树形视图 ── */
interface FlatNode { key: string; path: string; depth: number; data: any; isCollapsible: boolean; isLast: boolean }

function flattenJSON(data: any, path: string, depth: number, maxDepth: number): FlatNode[] {
  const result: FlatNode[] = []
  const isCollapsible = data !== null && typeof data === 'object'
  const isArray = Array.isArray(data)
  const entries: [string, any][] = isCollapsible
    ? isArray ? data.map((v: any, i: number) => [String(i), v] as [string, any]) : Object.entries(data)
    : []
  result.push({ key: path.split('.').pop() || 'root', path, depth, data, isCollapsible, isLast: false })
  if (isCollapsible && depth < maxDepth) {
    entries.forEach(([key, val], idx) => {
      const childPath = path ? `${path}.${key}` : key
      const children = flattenJSON(val, childPath, depth + 1, maxDepth)
      if (children.length > 0) children[children.length - 1].isLast = idx === entries.length - 1
      result.push(...children)
    })
  }
  return result
}

function TreeRoot({ data, onExtractVar }: { data: any; onExtractVar?: (key: string, val: any) => void }) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set(['']))
  const flatNodes = useMemo(() => flattenJSON(data, '', 0, 10), [data])
  useEffect(() => {
    const autoExpand = new Set<string>([''])
    for (const n of flatNodes) { if (n.isCollapsible && n.depth < 3) autoExpand.add(n.path) }
    setExpandedPaths(autoExpand)
  }, [flatNodes])
  const visibleNodes = useMemo(() => flatNodes.filter(n => {
    if (n.path === '') return true
    const parentPath = n.path.split('.').slice(0, -1).join('.')
    return expandedPaths.has(parentPath)
  }), [flatNodes, expandedPaths])
  const [valPopover, setValPopover] = useState<{ x: number; y: number; path: string; val: any } | null>(null)

  return (
    <div>
      {visibleNodes.map((node, i) => {
        const padLeft = node.depth * 16
        const isArray = Array.isArray(node.data)
        const bracket = isArray ? ['[', ']'] : ['{', '}']
        const obj = node.data && typeof node.data === 'object' ? node.data : {}
        const length = isArray ? node.data.length : Object.keys(obj).length
        if (!node.isCollapsible) {
          return (
            <div key={node.path || `leaf-${i}`} className="flex items-start group hover:bg-hover/5 rounded" style={{ paddingLeft: padLeft }}>
              <span className="text-accent-light mr-1.5 shrink-0">"{node.key}":</span>
              <span
                onClick={onExtractVar ? (e) => {
                  e.stopPropagation()
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  const top = rect.bottom + 3 > window.innerHeight - 60 ? rect.top - 60 : rect.bottom + 3
                  setValPopover({ x: Math.min(rect.left, window.innerWidth - 160), y: top, path: node.path, val: node.data })
                } : undefined}
                className={`${onExtractVar ? 'cursor-pointer hover:underline hover:underline-offset-2 decoration-dotted decoration-muted/30 rounded px-0.5 -mx-0.5' : ''} ${typeof node.data === 'string' ? 'text-success' : typeof node.data === 'number' ? 'text-warning' : typeof node.data === 'boolean' ? 'text-blue-400' : 'text-muted'}`}
                title={onExtractVar ? '点击复制或存为变量' : undefined}
              >{typeof node.data === 'string' ? `"${node.data}"` : String(node.data ?? 'null')}</span>
            </div>
          )
        }
        const nodePath = node.path
        const isOpen = expandedPaths.has(nodePath)
        return (
          <div key={nodePath || 'root'}>
            <div className="flex items-center cursor-pointer hover:bg-hover/5 rounded select-none" style={{ paddingLeft: padLeft }}
              onClick={() => setExpandedPaths(prev => { const next = new Set(prev); if (next.has(nodePath)) next.delete(nodePath); else next.add(nodePath); return next })}>
              <span className="w-3.5 inline-flex items-center justify-center shrink-0 text-muted">{isOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}</span>
              {node.key !== 'root' && <span className="text-accent-light mr-1.5">"{node.key}":</span>}
              {!isOpen ? <><span className="text-muted/40">{bracket[0]}</span><span className="text-muted/30 ml-1">{length} {isArray ? 'items' : 'keys'}</span><span className="text-muted/40">{bracket[1]}</span></> : <span className="text-muted/40">{bracket[0]}</span>}
            </div>
            {isOpen && node.isLast && <div style={{ paddingLeft: padLeft }}><span className="text-muted/40">{bracket[1]}</span></div>}
          </div>
        )
      })}
      {valPopover && <>
        <div className="fixed inset-0 z-[59]" onClick={() => setValPopover(null)} />
        <div className="fixed z-[60] bg-surface border border-border/10 rounded-lg shadow-xl py-1 px-1 text-[11px]" style={{ left: valPopover.x, top: valPopover.y }}>
          <button onClick={() => { navigator.clipboard.writeText(typeof valPopover.val === 'string' ? valPopover.val : String(valPopover.val)); setValPopover(null) }} className="flex items-center gap-1.5 w-full px-2.5 py-1.5 rounded hover:bg-hover/10 text-muted hover:text-foreground transition-colors whitespace-nowrap"><Copy size={11} /> 复制值</button>
          <button onClick={() => { onExtractVar?.(valPopover.path, valPopover.val); setValPopover(null) }} className="flex items-center gap-1.5 w-full px-2.5 py-1.5 rounded hover:bg-hover/10 text-muted hover:text-accent-light transition-colors whitespace-nowrap"><Variable size={11} /> 存为变量</button>
        </div>
      </>}
    </div>
  )
}

function JsonTreeView({ value, onExtractVar }: { value: string; onExtractVar?: (key: string, val: any) => void }) {
  let parsed: any
  try { parsed = JSON.parse(value) } catch {
    return <div className="p-4 space-y-2"><div className="text-xs text-danger font-mono">无效 JSON</div><pre className="text-[10px] text-muted/50 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">{value.slice(0, 500) || '(空字符串)'}</pre></div>
  }
  return (
    <div className="p-2 font-mono text-xs leading-relaxed overflow-y-auto h-full">
      {onExtractVar && <div className="text-[10px] text-muted/40 mb-1 select-none flex items-center gap-1"><Variable size={10} />点击彩色值可复制或存为变量</div>}
      <TreeRoot data={parsed} onExtractVar={onExtractVar} />
    </div>
  )
}

/** 保存飞入目标分组动画 */
function FlyToTarget({ startX, startY, endX, endY, text }: {
  startX: number; startY: number; endX: number; endY: number; text: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const dx = endX - startX
    const dy = endY - startY
    el.animate([
      { transform: `translate(-50%, -50%) scale(1)`, opacity: 1 },
      { transform: `translate(-50%, -50%) scale(1.1)`, opacity: 1, offset: 0.3 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.3)`, opacity: 0 },
    ], { duration: 500, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' })
  }, [])
  return (
    <div ref={ref}
      className="fixed pointer-events-none z-[100] flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent text-foreground text-sm font-medium shadow-lg"
      style={{ left: startX, top: startY }}
    >
      <Save size={14} />
      {text}
    </div>
  )
}

/** 分组选择弹窗（选中高亮 + 确认按钮） */
function GroupPickerModal({ collections, newGroupName, onNewGroupNameChange, onSelect, onClose, persistCollections, setCollections }: {
  collections: Collection[]
  newGroupName: string
  onNewGroupNameChange: (v: string) => void
  onSelect: (collId: string) => void
  onClose: () => void
  persistCollections: (list: Collection[]) => void
  setCollections: React.Dispatch<React.SetStateAction<Collection[]>>
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  function handleConfirm() {
    if (selectedId) onSelect(selectedId)
  }

  function handleCreateAndSelect() {
    if (!newGroupName.trim()) return
    const id = Date.now().toString()
    const updated = [...collections, { id, name: newGroupName.trim(), items: [] }]
    setCollections(updated); persistCollections(updated)
    onSelect(id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-surface rounded-xl border border-border/10 shadow-2xl w-72 p-4 animate-zoom-in" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-3">选择保存到分组</h3>
        {collections.length === 0 ? (
          <p className="text-xs text-muted mb-3">暂无分组，请在下方新建</p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto mb-2">
            {collections.map(c => (
              <button key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors
                  ${selectedId === c.id
                    ? 'bg-accent/20 text-accent-light border border-accent/30'
                    : 'hover:bg-accent/10 hover:text-accent-light border border-transparent'}`}
              >
                <Folder size={14} className={`${selectedId === c.id ? 'text-accent-light' : 'text-warning'} shrink-0`} />
                <span className="truncate">{c.name}</span>
                <span className="text-[10px] text-muted ml-auto">{c.items.length}</span>
              </button>
            ))}
          </div>
        )}
        {/* 新建分组 */}
        <div className="flex gap-1 pt-2 border-t border-border/5">
          <input
            value={newGroupName}
            onChange={e => onNewGroupNameChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateAndSelect() }}
            placeholder="新建分组..."
            className="flex-1 rounded px-2 py-1.5 text-xs outline-none bg-surface-light border border-border/5 focus:border-accent/50"
          />
          <button
            onClick={handleCreateAndSelect}
            disabled={!newGroupName.trim()}
            className="px-3 py-1.5 rounded text-xs font-medium bg-accent/20 text-accent-light hover:bg-accent/30 disabled:opacity-30 transition-colors">
            新建
          </button>
        </div>
        {/* 确认 + 取消 */}
        <div className="flex gap-2 mt-3">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg text-xs font-medium bg-hover/5 hover:bg-hover/10 text-muted transition-colors">
            取消
          </button>
          <button onClick={handleConfirm} disabled={!selectedId}
            className="flex-1 py-2 rounded-lg text-xs font-medium bg-accent hover:bg-accent-light text-foreground disabled:opacity-30 transition-colors">
            确认
          </button>
        </div>
      </div>
    </div>
  )
}

/** 可双击编辑的名称组件 */
function EditableName({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      // 延迟聚焦确保 DOM 已挂载
      requestAnimationFrame(() => inputRef.current?.select())
    }
  }, [editing])

  function commit() {
    setEditing(false)
    if (draft.trim() && draft !== value) onChange(draft.trim())
    else setDraft(value)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
        className="flex-1 px-2 py-0.5 text-sm font-medium bg-surface border border-accent/50 rounded outline-none animate-fade-in"
      />
    )
  }
  return (
    <span
      onClick={() => { setDraft(value); setEditing(true) }}
      className="group flex items-center gap-1.5 px-2 py-0.5 text-sm font-medium rounded cursor-text
                 hover:bg-hover/5 transition-colors"
      title="点击修改名称"
    >
      <span className="text-foreground/80 group-hover:text-foreground transition-colors">
        {value || '未命名接口'}
      </span>
      <Pencil size={11} className="opacity-0 group-hover:opacity-40 text-muted transition-opacity shrink-0" />
    </span>
  )
}

/** 系统变量弹出框（从按钮处展开/收缩） */
function SysVarsPopover({ closing, onClose, anchorRef }: { closing: boolean; onClose: () => void; anchorRef: React.RefObject<HTMLButtonElement | null> }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [animating, setAnimating] = useState(true)
  const [pos, setPos] = useState({ right: 0, top: 0 })

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      setPos({
        right: window.innerWidth - rect.right + 100,
        top: rect.top - 4,
      })
    }
    requestAnimationFrame(() => setAnimating(false))
  }, [])

  const sysVars = [
    { name: '{{timestampMs}}', desc: '时间戳(毫秒)', preview: Date.now().toString() },
    { name: '{{randomInt}}', desc: '随机整数', preview: Math.floor(Math.random()*10000).toString() },
    { name: '{{randomStr}}', desc: '随机字符串', preview: Math.random().toString(36).slice(2,10) },
    { name: '{{randomPhone}}', desc: '随机手机号', preview: '1' + String(Math.floor(Math.random()*9)+3) + Array(9).fill(0).map(() => Math.floor(Math.random()*10)).join('') },
    { name: '{{randomId}}', desc: '随机18位ID', preview: Array(18).fill(0).map(() => Math.floor(Math.random()*10)).join('') },
    { name: '{{guid}}', desc: 'GUID', preview: crypto.randomUUID().replace(/-/g, '') },
    { name: '{{randomIdCard}}', desc: '随机身份证', preview: genIdCard() },
    { name: '{{randomCreditCode}}', desc: '随机信用代码', preview: genCreditCode() },
  ]

  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div ref={cardRef}
        className="absolute w-[480px] bg-surface-light border border-border/10 rounded-xl shadow-xl p-4 origin-top-right transition-all duration-200"
        style={{
          right: pos.right,
          top: pos.top,
          ...(closing || animating
            ? { opacity: 0, transform: 'scale(0.3)' }
            : { opacity: 1, transform: 'scale(1)' })
        }}
        onClick={e => e.stopPropagation()}>
        <h4 className="text-[11px] uppercase tracking-widest text-muted mb-2.5">系统变量</h4>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] text-muted/50 px-1">
            <span className="w-[150px] shrink-0">变量名</span>
            <span className="w-[88px] shrink-0">说明</span>
            <span className="flex-1">生成效果</span>
          </div>
          {sysVars.map(v => (
            <div key={v.name} className="group flex items-center gap-2">
              <code className="w-[150px] text-xs text-accent-light font-mono italic shrink-0 truncate">{v.name}</code>
              <span className="w-[88px] text-[11px] text-muted/60 shrink-0 truncate">{v.desc}</span>
              <span className="flex-1 text-xs text-foreground font-mono bg-surface rounded px-2 py-1 break-all">{v.preview}</span>
              <button
                onClick={() => { navigator.clipboard.writeText(v.name); onClose() }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent/20 text-muted hover:text-accent-light transition-all shrink-0"
                title="复制变量名">
                <Copy size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ApiDebugger() {
  const { env } = useAppStore()

  // 多标签管理（从缓存恢复，跨导航保持状态）
  const [tabs, setTabs] = useState<TabState[]>(() => cachedTabs || [newBlankTab()])
  const [activeTabId, setActiveTabId] = useState<string>(() => cachedActiveTabId || tabs[0]?.id || '')

  // 同步到缓存
  useEffect(() => { cachedTabs = tabs }, [tabs])
  useEffect(() => { cachedActiveTabId = activeTabId }, [activeTabId])

  function getActiveTab(): TabState {
    return tabs.find(t => t.id === activeTabId) || tabs[0]
  }
  const tab = getActiveTab()

  // 从当前 tab 派生各字段
  const method = tab.method
  const url = tab.url
  const headers = tab.headers
  const params = tab.params
  const body = tab.body
  const preScript = tab.preScript
  const postScript = tab.postScript
  const response = tab.response
  const editingRequest = tab.editingRequest

  function updateTab(id: string, patch: Partial<TabState>) {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
  }
  function updateActiveTab(patch: Partial<TabState>) {
    updateTab(activeTabId, patch)
  }

  function createTab() {
    const t = newBlankTab()
    setTabs(prev => [...prev, t])
    setActiveTabId(t.id)
  }
  function closeTab(id: string) {
    if (tabs.length <= 1) return
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === id)
      const next = prev.filter(t => t.id !== id)
      if (id === activeTabId) {
        const newIdx = Math.min(idx, next.length - 1)
        if (next[newIdx]) setActiveTabId(next[newIdx].id)
      }
      return next
    })
  }
  function switchTab(id: string) {
    setActiveTabId(id)
  }

  // setX wrappers
  const setMethod = (v: string) => updateActiveTab({ method: v })
  const setUrl = (v: string) => updateActiveTab({ url: v })
  const setHeaders = (v: HeaderRow[] | ((prev: HeaderRow[]) => HeaderRow[])) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, headers: typeof v === 'function' ? v(t.headers) : v } : t))
  }
  const setParams = (v: HeaderRow[] | ((prev: HeaderRow[]) => HeaderRow[])) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, params: typeof v === 'function' ? v(t.params) : v } : t))
  }
  const setBody = (v: string) => updateActiveTab({ body: v })
  const setPreScript = (v: string) => updateActiveTab({ preScript: v })
  const setPostScript = (v: string) => updateActiveTab({ postScript: v })
  const setResponse = (v: TabState['response']) => updateActiveTab({ response: v })
  const setEditingRequest = (v: TabState['editingRequest']) => updateActiveTab({ editingRequest: v })

  const bodyContentRef = useRef('')  // 实时同步最新 body，绕过 React 状态延迟
  const [activeTabKey, setActiveTabKey] = useState<TabKey>('params')
  const [isSending, setIsSending] = useState(false)

  // 请求区 & 响应区 Tab 滑动方向
  const REQ_ORDER: TabKey[] = ['params', 'headers', 'body', 'prescript', 'postscript']
  const RES_ORDER = ['body', 'cookies', 'headers', 'request'] as const
  const [reqDir, setReqDir] = useState<'left' | 'right'>('right')
  const [resDir, setResDir] = useState<'left' | 'right'>('right')
  const switchReqTab = (t: TabKey) => {
    if (t === activeTabKey) return
    setReqDir(REQ_ORDER.indexOf(t) > REQ_ORDER.indexOf(activeTabKey) ? 'right' : 'left')
    setActiveTabKey(t)
  }
  const switchResTab = (t: typeof RES_ORDER[number]) => {
    if (t === responseTab) return
    setResDir(RES_ORDER.indexOf(t) > RES_ORDER.indexOf(responseTab) ? 'right' : 'left')
    setResponseTab(t)
  }

  const [responseTab, setResponseTab] = useState<'body' | 'headers' | 'cookies' | 'request'>('body')
  const [sentRequest, setSentRequest] = useState<{
    method: string; url: string; headers: Record<string, string>; body?: string
  } | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>(() => cachedHistory || [])
  useEffect(() => { cachedHistory = history }, [history])

  // ── 后置脚本可视化提取 ──
  const [postScriptMode, setPostScriptMode] = useState<'visual' | 'code'>('visual')
  interface Extraction { id: string; path: string; varName: string }
  const [extractions, setExtractions] = useState<Extraction[]>([])
  const [savedFlash, setSavedFlash] = useState(false)
  const [deletingExtId, setDeletingExtId] = useState<string | null>(null)
  function addExtraction(path: string) {
    const clean = path.replace(/^\./, '')
    const varName = clean.replace(/\./g, '_')
    if (extractions.some(e => e.path === clean)) return
    setExtractions(prev => [...prev, { id: uid(), path: clean, varName }])
  }
  function updateExtractionVar(id: string, varName: string) {
    setExtractions(prev => prev.map(e => e.id === id ? { ...e, varName } : e))
  }
  function removeExtraction(id: string) {
    setDeletingExtId(id)
    setTimeout(() => {
      setExtractions(prev => prev.filter(e => e.id !== id))
      setDeletingExtId(null)
    }, 250)
  }
  function runExtractions() {
    if (extractions.length === 0) return
    const script = extractions.map(e => `env.set('${e.varName}', response.json().${e.path})`).join('\n')
    // 移除旧的提取行（以 env.set 开头的），替换为新的，保留其他手写代码
    const oldLines = postScript.split('\n').filter(line => !/^\s*env\.set\(/.test(line))
    const combined = [...oldLines.filter(l => l.trim()), script].join('\n')
    updateActiveTab({ postScript: combined })
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1200)
  }
  /** 扫描 JSON 中所有叶子路径 */
  function scanJsonPaths(obj: any, prefix = ''): string[] {
    if (obj === null || obj === undefined) return []
    if (typeof obj !== 'object' || obj instanceof Array) return [prefix || '(root)']
    const paths: string[] = []
    for (const key of Object.keys(obj)) {
      const full = prefix ? `${prefix}.${key}` : key
      const val = obj[key]
      if (val !== null && typeof val === 'object' && !(val instanceof Array)) {
        paths.push(...scanJsonPaths(val, full))
      } else {
        paths.push(full)
      }
    }
    return paths
  }
  /** 一键提取顶层字段 */
  function extractTopLevel() {
    try {
      const json = JSON.parse(response?.body || '{}')
      if (typeof json !== 'object' || json === null) return
      const keys = Object.keys(json)
      keys.forEach(key => {
        const val = json[key]
        if (val !== null && typeof val === 'object') return // 跳过嵌套对象，用点选方式提取
        addExtraction(key)
      })
      // 对嵌套对象也添加顶层路径
      keys.forEach(key => {
        const val = json[key]
        if (val !== null && typeof val === 'object' && !(val instanceof Array)) {
          addExtraction(key)
        }
      })
    } catch { }
  }
  /** 一键提取所有叶子字段 */
  function extractAllLeaves() {
    try {
      const json = JSON.parse(response?.body || '{}')
      const paths = scanJsonPaths(json)
      paths.forEach(p => addExtraction(p))
    } catch { }
  }
  /** 生成动态提取脚本（运行时遍历 JSON 自动提取） */
  function generateDynamicScript() {
    const script = `// 动态提取：自动遍历响应JSON所有字段
const json = response.json()
function flatten(obj, prefix = '') {
  for (const key of Object.keys(obj || {})) {
    const fullKey = prefix ? prefix + '_' + key : key
    const val = obj[key]
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      flatten(val, fullKey)
    } else {
      env.set(fullKey, String(val))
    }
  }
}
flatten(json)`
    const combined = postScript.trim() ? `${postScript.trim()}\n${script}` : script
    updateActiveTab({ postScript: combined })
  }

  // ── 请求/响应区拖拽调节高度 ──
  const [resPanelRatio, setResPanelRatio] = useState(42) // 响应区高度百分比
  const dragRef = useRef<{ startY: number; startRatio: number } | null>(null)
  const centerPanelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current || !centerPanelRef.current) return
      const rect = centerPanelRef.current.getBoundingClientRect()
      const dy = dragRef.current.startY - e.clientY
      const newRatio = Math.min(85, Math.max(15, dragRef.current.startRatio + (dy / rect.height) * 100))
      setResPanelRatio(newRatio)
    }
    const onUp = () => { dragRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // ── 并发性能测试状态 ──
  const [showPerfPanel, setShowPerfPanel] = useState(false)
  const [concurrency, setConcurrency] = useState(10)
  const [totalRequests, setTotalRequests] = useState(100)
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchResult, setBatchResult] = useState<{
    method: string; url: string; headers: Record<string, string>; body?: string
    total: number; success: number; failed: number; totalDuration: number
    minDuration: number; maxDuration: number; avgDuration: number
    qps: number
    statusDistribution: Record<number, number>
    items: { index: number; status?: number; duration: number; body?: string; error?: string }[]
  } | null>(null)
  const [batchError, setBatchError] = useState<string | null>(null)
  const [responseViewMode, setResponseViewMode] = useState<'tree' | 'pretty' | 'raw'>('tree')
  const [showCodeExport, setShowCodeExport] = useState(false)
  const [collRunner, setCollRunner] = useState<{
    running: boolean; collName: string; results: { name: string; method: string; url: string; status?: number; duration?: number; error?: string }[]; done: number; total: number
  } | null>(null)
  const runnerAbortRef = useRef(false)
  // 滑动索引（必须在 activeTabKey 和 responseTab 之后）
  const reqTabOrder: TabKey[] = ['params', 'headers', 'body', 'prescript', 'postscript']
  const reqTabIndex = reqTabOrder.indexOf(activeTabKey)
  const resTabOrder = ['body', 'cookies', 'headers', 'request'] as const
  const resTabIndex = resTabOrder.indexOf(responseTab)
  const [loadedReqTabs, setLoadedReqTabs] = useState<Set<TabKey>>(() => new Set(['params']))
  const [loadedResTabs, setLoadedResTabs] = useState<Set<string>>(() => new Set(['body']))
  useEffect(() => { setLoadedReqTabs(prev => { const next = new Set(prev); next.add(activeTabKey); return next }) }, [activeTabKey])
  useEffect(() => { setLoadedResTabs(prev => { const next = new Set(prev); next.add(responseTab); return next }) }, [responseTab])

  async function handleBatchSend() {
    if (!url.trim() || batchRunning) return
    setBatchRunning(true)
    setBatchResult(null)
    setBatchError(null)

    const reqHeaders: Record<string, string> = {}
    for (const h of headers) {
      if (h.key.trim()) reqHeaders[h.key.trim()] = h.value
    }

    try {
      const api = (window as any).supplyChainTester
      if (!api || typeof api.apiDebugBatch !== 'function') {
        setBatchError('后端不支持并发测试，请重启应用')
        setBatchRunning(false)
        return
      }

      const trimmedUrl = url.trim()
      const baseWithProtocol = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : 'http://' + trimmedUrl
      const urlWithoutQS = baseWithProtocol.replace(/\?.*$/, '')
      const activeParams = params.filter(p => p.key.trim())
      const qs = activeParams.map(p =>
        `${encodeURIComponent(interpolate(p.key.trim(), envVars))}=${encodeURIComponent(interpolate(p.value, envVars))}`
      ).join('&')
      const fullUrl = qs ? `${urlWithoutQS}?${qs}` : urlWithoutQS
      const interpolatedUrl = interpolate(fullUrl, envVars)
      const interpolatedHeaders = Object.fromEntries(
        Object.entries(reqHeaders).map(([k, v]) => [k, interpolate(v, envVars)])
      )
      const currentBody = bodyContentRef.current || body
      const interpolatedBody = method !== 'GET' ? interpolate(currentBody, envVars) : undefined

      const result = await api.apiDebugBatch({
        method, url: interpolatedUrl, headers: interpolatedHeaders,
        body: interpolatedBody, concurrency, totalRequests,
      })
      setBatchResult(result)
    } catch (err: any) {
      setBatchError(err.message)
    } finally {
      setBatchRunning(false)
    }
  }

  // 变量管理
  const [envVars, setEnvVars] = useState<VarItem[]>(() => loadVars(env))
  const originalVarsRef = useRef<VarItem[]>([])
  const [showVars, setShowVars] = useState(false)
  const [varsClosing, setVarsClosing] = useState(false)
  const [deletingVarId, setDeletingVarId] = useState<string | null>(null)
  const [varSearch, setVarSearch] = useState('')
  const [varSearchInput, setVarSearchInput] = useState('')
  const [newVarKey, setNewVarKey] = useState('')
  const [newVarValue, setNewVarValue] = useState('')
  const [newVarComment, setNewVarComment] = useState('')

  const isVarsDirty = JSON.stringify(envVars) !== JSON.stringify(originalVarsRef.current)

  function openVarsModal() {
    originalVarsRef.current = JSON.parse(JSON.stringify(envVars))
    setNewVarKey(''); setNewVarValue(''); setNewVarComment('')
    setVarsClosing(false)
    setShowVars(true)
  }
  function closeWithAnimation() {
    setVarsClosing(true)
    setTimeout(() => {
      setShowVars(false)
      setVarsClosing(false)
    }, 200)
  }
  function handleSaveVars() {
    persistVars(env, envVars)
    originalVarsRef.current = JSON.parse(JSON.stringify(envVars))
    closeWithAnimation()
  }
  function handleCloseVars() {
    setEnvVars(JSON.parse(JSON.stringify(originalVarsRef.current)))
    closeWithAnimation()
  }
  const isDuplicate = !!(newVarKey.trim() && envVars.find(v => v.key === newVarKey.trim()))

  function addVar() {
    if (!newVarKey.trim() || isDuplicate) return
    const updated = [...envVars.filter(v => v.key !== newVarKey.trim()), { id: uid(), key: newVarKey.trim(), value: newVarValue, comment: newVarComment.trim() }]
    setEnvVars(updated)
    setNewVarKey(''); setNewVarValue(''); setNewVarComment('')
  }
  function removeVar(id: string) {
    setDeletingVarId(id)
    setTimeout(() => {
      setEnvVars(prev => prev.filter(v => v.id !== id))
      setDeletingVarId(null)
    }, 200)
  }
  function updateVar(id: string, field: 'key' | 'value' | 'comment', val: string) {
    if (field === 'key' && val.trim() && envVars.some(v => v.id !== id && v.key === val.trim())) return
    setEnvVars(prev => prev.map(x => x.id === id ? { ...x, [field]: field === 'key' ? val.trim() : val } : x))
  }

  const filteredVars = envVars.filter(v =>
    !varSearch || v.key.includes(varSearch) || v.comment.includes(varSearch)
  )

  // 分组管理
  const [collections, setCollections] = useState<Collection[]>(loadCollections)
  const [flashReqId, setFlashReqId] = useState<string | null>(null)
  const [showSavePicker, setShowSavePicker] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(cachedExpandedIds || []))
  useEffect(() => { cachedExpandedIds = [...expandedIds] }, [expandedIds])
  const [renamingCollId, setRenamingCollId] = useState<string | null>(null)
  const [renameCollName, setRenameCollName] = useState('')
  const [showSysVars, setShowSysVars] = useState(false)
  const [sysVarsClosing, setSysVarsClosing] = useState(false)
  const [showCurlImport, setShowCurlImport] = useState(false)

  function closeSysVars() {
    setSysVarsClosing(true)
    setTimeout(() => { setShowSysVars(false); setSysVarsClosing(false) }, 200)
  }
  function openSysVars() {
    setSysVarsClosing(false)
    setShowSysVars(true)
  }
  const [dragItem, setDragItem] = useState<{ reqId: string; fromCollId: string } | null>(null)
  const [dragOverCollId, setDragOverCollId] = useState<string | null>(null)

  // ── 确认对话框 ──
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null)

  function showConfirm(message: string, onConfirm: () => void) {
    setConfirmDialog({ message, onConfirm })
  }

  // ── 保存飞入动画 ──
  const saveBtnRef = useRef<HTMLDivElement>(null)
  const sysVarsBtnRef = useRef<HTMLButtonElement>(null)
  const collRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const [flyAnim, setFlyAnim] = useState<{ startX: number; startY: number; endX: number; endY: number; text: string } | null>(null)

  function triggerFlyTo(collId: string) {
    const btn = saveBtnRef.current
    const target = collRefs.current.get(collId)
    if (!btn || !target) return
    const btnRect = btn.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    setFlyAnim({
      startX: btnRect.left + btnRect.width / 2,
      startY: btnRect.top + btnRect.height / 2,
      endX: targetRect.left + targetRect.width / 2,
      endY: targetRect.top + targetRect.height / 2,
      text: editingRequest ? '更新' : '保存',
    })
    setTimeout(() => setFlyAnim(null), 600)
  }

  // ── 拖拽处理 ──
  function handleDragStart(e: React.DragEvent, reqId: string, fromCollId: string) {
    setDragItem({ reqId, fromCollId })
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/json', JSON.stringify({ reqId, fromCollId }))
  }
  function handleDragOver(e: React.DragEvent, collId: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverCollId !== collId) {
      setDragOverCollId(collId)
      // 自动展开目标分组，确保 drop zone 可接收事件
      setExpandedIds(prev => new Set([...prev, collId]))
    }
  }
  function handleDragLeave(e: React.DragEvent) {
    // 只在真正离开容器时清除
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      setDragOverCollId(null)
    }
  }
  function handleDrop(e: React.DragEvent, toCollId: string) {
    e.preventDefault()
    setDragOverCollId(null)
    setDragItem(null)
    try {
      const raw = e.dataTransfer.getData('application/json')
      if (!raw) return
      const { reqId, fromCollId } = JSON.parse(raw) as { reqId: string; fromCollId: string }
      if (fromCollId === toCollId) return
      const fromCol = collections.find(c => c.id === fromCollId)
      const toCol = collections.find(c => c.id === toCollId)
      if (!fromCol || !toCol) return
      const item = fromCol.items.find(it => it.id === reqId)
      if (!item) return
      const updated = collections.map(c => {
        if (c.id === fromCollId) return { ...c, items: c.items.filter(it => it.id !== reqId) }
        if (c.id === toCollId) return { ...c, items: [...c.items, item] }
        return c
      })
      setCollections(updated)
      persistCollections(updated)
      setExpandedIds(prev => new Set([...prev, toCollId]))
      setDragItem(null)
      setDragOverCollId(null)
    } catch { /* ignore */ }
    setDragItem(null)
    setDragOverCollId(null)
  }

  function handleDragEnd() {
    setDragItem(null)
    setDragOverCollId(null)
  }

  async function handleSend() {
    if (!url.trim() || isSending) return
    setIsSending(true)
    setResponse(null)

    // ── 前置脚本 ──
    if (preScript.trim()) {
      try {
        const sandbox = { env: { get: (k: string) => envVars.find(v => v.key === k)?.value ?? '', set: (k: string, v: string) => {
          setEnvVars(prev => { const exists = prev.find(x => x.key === k); const updated = exists ? prev.map(x => x.key === k ? { ...x, value: v } : x) : [...prev, { id: uid(), key: k, value: v, comment: '' }]; persistVars(env, updated); return updated })
        }}, console: { log: (...args: any[]) => console.log('[前置脚本]', ...args) } }
        new Function('sandbox', `with(sandbox) { ${preScript} }`)(sandbox)
      } catch (err: any) { console.error('[前置脚本] 执行失败:', err.message) }
    }

    const reqHeaders: Record<string, string> = {}
    for (const h of headers) {
      if (h.key.trim()) reqHeaders[h.key.trim()] = h.value
    }

    try {
      const api = (window as any).supplyChainTester
      const trimmedUrl = url.trim()
      // 构建完整 URL：基础路径 + Query Params（忽略 URL 中已有的 ?query）
      const baseWithProtocol = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : 'http://' + trimmedUrl
      const urlWithoutQS = baseWithProtocol.replace(/\?.*$/, '')
      const activeParams = params.filter(p => p.key.trim())
      const qs = activeParams.map(p =>
        `${encodeURIComponent(interpolate(p.key.trim(), envVars))}=${encodeURIComponent(interpolate(p.value, envVars))}`
      ).join('&')
      const fullUrl = qs ? `${urlWithoutQS}?${qs}` : urlWithoutQS
      if (!api) { setResponse({ error: '后端未连接 - 请重启应用' }); setIsSending(false); return }
      if (typeof api.apiDebug !== 'function') {
        setResponse({ error: `api.apiDebug 不可用，可用方法: ${Object.keys(api || {}).join(', ')}` })
        setIsSending(false)
        return
      }
      const interpolatedUrl = interpolate(fullUrl, envVars)
      const interpolatedHeaders = Object.fromEntries(
        Object.entries(reqHeaders).map(([k, v]) => [k, interpolate(v, envVars)])
      )
      const currentBody = bodyContentRef.current  // 从 ref 读最新值，避免 React 状态异步延迟
      const interpolatedBody = method !== 'GET' ? interpolate(currentBody, envVars) : undefined

      // 调试日志：对比 ref 原始值和插值后结果
      console.log('[handleSend] bodyContentRef length:', currentBody.length)
      console.log('[handleSend] interpolatedBody length:', interpolatedBody?.length ?? 0)
      if (currentBody !== interpolatedBody) {
        console.log('[handleSend] ⚠️ Body was modified by interpolation!')
        console.log('[handleSend] Before:', currentBody.slice(0, 200))
        console.log('[handleSend] After:', interpolatedBody?.slice(0, 200) ?? '(undefined)')
      }

      // 保存实际发送的请求
      setSentRequest({
        method,
        url: interpolatedUrl,
        headers: interpolatedHeaders,
        body: interpolatedBody,
      })

      const res = await api.apiDebug({
        method,
        url: interpolatedUrl,
        headers: interpolatedHeaders,
        body: interpolatedBody,
      })
      setResponse(res)
      // ── 后置脚本 ──
      if (postScript.trim() && res.body) {
        try {
          let parsedBody: any = undefined
          try { parsedBody = JSON.parse(res.body) } catch {}
          const extractedVars: { key: string; value: string }[] = []
          // 直接解析 env.set('key', response.json().path) 模式并执行提取
          const setRegex = /env\.set\s*\(\s*['"]([^'"]+)['"]\s*,\s*response\.json\(\)\.(.+?)\s*\)/g
          let match: RegExpExecArray | null
          while ((match = setRegex.exec(postScript)) !== null) {
            const varName = match[1]
            const path = match[2]
            try {
              const val = path.split('.').reduce((obj: any, k) => obj?.[k], parsedBody)
              if (val !== undefined && val !== null) {
                extractedVars.push({ key: varName, value: String(val) })
              }
            } catch { }
          }
          if (extractedVars.length > 0) {
            setEnvVars(prev => {
              const merged = [...prev]
              extractedVars.forEach(({ key, value }) => {
                const idx = merged.findIndex(v => v.key === key)
                if (idx >= 0) merged[idx] = { ...merged[idx], value }
                else merged.push({ id: uid(), key, value, comment: '' })
              })
              persistVars(env, merged)
              return merged
            })
          }
        } catch (err: any) {
          setResponse({ ...res, error: `后置脚本: ${err.message}` })
        }
      }
      setHistory(prev => [{
        method, url: fullUrl, status: res.status,
        duration: res.duration, time: new Date().toLocaleTimeString('zh-CN'),
      }, ...prev].slice(0, 50))
    } catch (err: any) {
      setResponse({ error: err.message })
    } finally {
      setIsSending(false)
    }
  }

  // ── Ctrl+Enter 发送 ──
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSend()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [url, method, headers, params, body, isSending])

  /** 从响应 JSON 树中点击值 → 生成 env.set() 代码插入后置脚本 */
  function handleExtractVar(path: string, _val: any) {
    const cleanPath = path.replace(/^\./, '')
    const code = `env.set('${cleanPath}', response.json().${cleanPath})`
    const currentScript = postScript.trim()
    const newScript = currentScript ? `${currentScript}\n${code}` : code
    updateActiveTab({ postScript: newScript })
    setActiveTabKey('postscript')
  }

  /** 构建完整请求 URL */
  function buildFullUrl(reqMethod: string, reqUrl: string, reqParams: HeaderRow[]): string {
    const trimmed = reqUrl.trim()
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : 'http://' + trimmed
    const base = withProto.replace(/\?.*$/, '')
    const activeParams = reqParams.filter(p => p.key.trim())
    const qs = activeParams.map(p =>
      `${encodeURIComponent(interpolate(p.key.trim(), envVars))}=${encodeURIComponent(interpolate(p.value, envVars))}`
    ).join('&')
    return interpolate(qs ? `${base}?${qs}` : base, envVars)
  }

  /** 集合 Runner */
  async function runCollection(collId: string) {
    const col = collections.find(c => c.id === collId)
    if (!col || col.items.length === 0 || collRunner?.running) return
    const api = (window as any).supplyChainTester
    if (!api?.apiDebug) return
    runnerAbortRef.current = false
    setCollRunner({ running: true, collName: col.name, results: [], done: 0, total: col.items.length })
    for (let i = 0; i < col.items.length; i++) {
      if (runnerAbortRef.current) break
      const req = col.items[i]
      const reqParams: HeaderRow[] = (req.params || []).length > 0
        ? req.params.map((p, j) => ({ id: j + 1, key: p.key, value: p.value }))
        : [{ id: 1, key: '', value: '' }]
      const reqHeaders = Object.fromEntries(
        (req.headers || []).filter((h: any) => h.key.trim()).map((h: any) => [h.key, interpolate(h.value, envVars)])
      )
      const fullUrl = buildFullUrl(req.method, req.url, reqParams)
      const reqBody = req.method !== 'GET' ? interpolate(req.body || '', envVars) : undefined
      try {
        const res = await api.apiDebug({ method: req.method, url: fullUrl, headers: reqHeaders, body: reqBody })
        setCollRunner(prev => prev ? { ...prev, done: i + 1, results: [...prev.results, { name: req.name, method: req.method, url: fullUrl, status: res.status, duration: res.duration }] } : null)
      } catch (err: any) {
        setCollRunner(prev => prev ? { ...prev, done: i + 1, results: [...prev.results, { name: req.name, method: req.method, url: fullUrl, error: err.message }] } : null)
      }
    }
    setCollRunner(prev => prev ? { ...prev, running: false } : null)
  }

  /** 生成代码片段 */
  function generateCodeSnippet(lang: 'curl' | 'python' | 'fetch'): string {
    const fullUrl = buildFullUrl(method, url, params)
    const cleanHeaders = headers.filter(h => h.key.trim())
    const currentBody = bodyContentRef.current || body
    const interpolatedBody = method !== 'GET' ? interpolate(currentBody, envVars) : undefined
    switch (lang) {
      case 'curl': {
        let cmd = `curl -X ${method} "${fullUrl}"`
        for (const h of cleanHeaders) cmd += ` \\\n  -H '${h.key.trim()}: ${h.value}'`
        if (interpolatedBody) cmd += ` \\\n  -d '${interpolatedBody.replace(/'/g, "\\'")}'`
        return cmd
      }
      case 'python': {
        let code = `import requests\n\nurl = "${fullUrl}"\n`
        if (cleanHeaders.length > 0) code += `headers = {\n  ${cleanHeaders.map(h => `"${h.key.trim()}": "${h.value}"`).join(',\n  ')}\n}\n`
        if (interpolatedBody) code += `data = '''${interpolatedBody}'''\n`
        code += `\nresponse = requests.${method.toLowerCase()}(${['url', cleanHeaders.length > 0 ? 'headers=headers' : '', interpolatedBody ? 'data=data' : ''].filter(Boolean).join(', ')})\nprint(response.status_code, response.text)`
        return code
      }
      case 'fetch': {
        let code = `fetch("${fullUrl}", {\n  method: "${method}",\n`
        if (cleanHeaders.length > 0) code += `  headers: {\n    ${cleanHeaders.map(h => `"${h.key.trim()}": "${h.value}"`).join(',\n    ')}\n  },\n`
        if (interpolatedBody) code += `  body: \`${interpolatedBody}\`,\n`
        code += `})\n  .then(r => r.text())\n  .then(console.log)`
        return code
      }
    }
  }

  // 保存到指定分组
  function saveToGroup(collId: string) {
    if (!url.trim()) return
    setShowSavePicker(false)
    setNewGroupName('')
    triggerFlyTo(collId)
    setTimeout(() => {
      const cleanParams = params.filter(p => p.key.trim()).map(p => ({ key: p.key.trim(), value: p.value }))
      const cleanHeaders = headers.filter(h => h.key.trim()).map(h => ({ key: h.key.trim(), value: h.value }))
      const reqName = tab.name || '未命名接口'
      setCollections(prev => {
        const item: SavedRequest = {
          id: Date.now().toString(), name: reqName,
          method, url: url.trim(),
          headers: cleanHeaders, params: cleanParams,
          body, preScript, postScript, createdAt: new Date().toISOString(),
        }
        const updated = editingRequest
          ? prev.map(c => c.id === editingRequest.collId ? {
              ...c,
              items: c.id === collId
                ? c.items.map(i => i.id === editingRequest.reqId ? { ...i, name: reqName, method, url: url.trim(), headers: cleanHeaders, params: cleanParams, body, preScript, postScript } : i)
                : c.items.filter(i => i.id !== editingRequest.reqId),
            } : c.id === collId ? { ...c, items: [...c.items, item] } : c) as Collection[]
          : prev.map(c => c.id === collId ? { ...c, items: [...c.items, item] } : c)
        persistCollections(updated)
        return updated
      })
      setEditingRequest(null)
      setExpandedIds(prev => new Set([...prev, collId]))
      // 重新查找刚保存的 item 设置 editing 状态
      setTimeout(() => {
        setCollections(current => {
          const col = current.find(c => c.id === collId)
          if (col) {
            const last = col.items[col.items.length - 1]
            if (last) setEditingRequest({ collId, reqId: last.id })
          }
          return current
        })
      }, 0)
    }, 250)
  }

  // 保存当前请求（默认存到默认分组，Ctrl+点击弹窗选分组）
  function handleSave(e?: React.MouseEvent) {
    const ctrl = e?.ctrlKey || e?.metaKey
    if (ctrl) {
      e?.preventDefault()
      setShowSavePicker(true)
      return
    }
    if (!url.trim()) return
    const cleanParams = params.filter(p => p.key.trim()).map(p => ({ key: p.key.trim(), value: p.value }))
    const cleanHeaders = headers.filter(h => h.key.trim()).map(h => ({ key: h.key.trim(), value: h.value }))
    const reqName = tab.name || '未命名接口'

    if (editingRequest) {
      setCollections(prev => {
        const updated = prev.map(c => c.id === editingRequest.collId ? {
          ...c,
          items: c.items.map(i => i.id === editingRequest.reqId ? {
            ...i, name: reqName, method, url: url.trim(),
            headers: cleanHeaders, params: cleanParams, body, preScript, postScript,
          } : i),
        } : c)
        persistCollections(updated)
        return updated
      })
      setFlashReqId(editingRequest.reqId); setTimeout(() => setFlashReqId(null), 700)
    } else {
      saveToGroup(getOrCreateDefaultId())
    }
  }

  function getOrCreateDefaultId(): string {
    let def = collections.find(c => c.name === '默认分组')
    if (!def) {
      def = { id: uid(), name: '默认分组', items: [] }
      setCollections(prev => { const u = [...prev, def!]; persistCollections(u); return u })
    }
    return def.id
  }

  // 新建请求时清除编辑状态
  function startNewRequest() {
    createTab()
  }

  function loadRequest(req: SavedRequest, collId: string) {
    updateActiveTab({
      name: req.name,
      method: req.method,
      url: req.url,
      params: req.params && req.params.length > 0
        ? req.params.map((p, i) => ({ id: i + 1, key: p.key, value: p.value }))
        : [{ id: 1, key: '', value: '' }],
      headers: req.headers.length > 0
        ? req.headers.map((h, i) => ({ id: i + 1, key: h.key, value: h.value }))
        : [{ id: 1, key: '', value: '' }],
      body: req.body,
      preScript: req.preScript || '',
      postScript: req.postScript || '',
      response: null,
      editingRequest: { collId, reqId: req.id },
    })
    bodyContentRef.current = req.body
  }

  function deleteRequest(collId: string, reqId: string) {
    const updated = collections.map(c =>
      c.id === collId ? { ...c, items: c.items.filter(i => i.id !== reqId) } : c
    )
    setCollections(updated); persistCollections(updated)
  }

  function deleteCollection(collId: string) {
    const updated = collections.filter(c => c.id !== collId)
    setCollections(updated); persistCollections(updated)
  }

  function createCollection() {
    if (!newGroupName.trim()) return
    const updated = [...collections, { id: Date.now().toString(), name: newGroupName.trim(), items: [] }]
    setCollections(updated); persistCollections(updated)
    setNewGroupName(''); setShowNewGroup(false)
  }

  function addToCollection(collId: string) {
    const item: SavedRequest = {
      id: Date.now().toString(),
      name: '新建接口',
      method: 'POST', url: '',
      headers: [], params: [], body: '', preScript: '', postScript: '',
      createdAt: new Date().toISOString(),
    }
    const updated = collections.map(c =>
      c.id === collId ? { ...c, items: [...c.items, item] } : c
    )
    setCollections(updated)
    persistCollections(updated)
    setExpandedIds(prev => new Set([...prev, collId]))
  }

  // ── Postman 导入 ──
  const fileInputRef = useRef<HTMLInputElement>(null)

  function importPostman(json: string) {
    try {
      const data = JSON.parse(json)
      const newCols: Collection[] = []
      const items = data.item || []

      function walk(list: any[], parentName?: string) {
        for (const item of list) {
          if (item.request) {
            const req = item.request
            let rawUrl = ''
            if (typeof req.url === 'string') rawUrl = req.url
            else if (req.url?.raw) rawUrl = req.url.raw
            else if (req.url) rawUrl = String(req.url)
            const headers = (req.header || []).map((h: any) => ({ key: h.key || '', value: h.value || '' }))
            let body = ''
            if (req.body?.mode === 'raw' && req.body.raw) body = req.body.raw
            const saved: SavedRequest = {
              id: uid(), name: item.name || '未命名',
              method: req.method || 'GET', url: rawUrl,
              headers,
              params: [],
              body, preScript: '', postScript: '',
              createdAt: new Date().toISOString(),
            }
            const colName = parentName || data.info?.name || '导入'
            let col = newCols.find(c => c.name === colName)
            if (!col) { col = { id: uid(), name: colName, items: [] }; newCols.push(col) }
            col.items.push(saved)
          } else if (item.item) {
            walk(item.item, item.name)
          }
        }
      }
      walk(items)
      if (newCols.length === 0) return
      setCollections([...collections, ...newCols])
      persistCollections([...collections, ...newCols])
    } catch { }
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      importPostman(reader.result as string)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    reader.readAsText(file)
  }

  // 响应体大小计算
  const responseSize = useMemo(() => {
    if (!response?.body) return 0
    return new Blob([response.body]).size
  }, [response?.body])

  // 响应头排序展示
  const sortedResponseHeaders = useMemo(() => {
    if (!response?.headers) return []
    return Object.entries(response.headers).sort(([a], [b]) => a.localeCompare(b))
  }, [response?.headers])

  // 格式化响应体（用于 Pretty/Raw 展示）
  const formattedBody = useMemo(() => {
    if (!response?.body) return ''
    if (responseViewMode === 'pretty') {
      try { return JSON.stringify(JSON.parse(response.body), null, 2) } catch { return response.body }
    }
    return response.body
  }, [response?.body, responseViewMode])

  // 从响应头中提取 Cookies
  const responseCookies = useMemo(() => {
    if (!response?.headers) return []
    const cookies: { name: string; value: string; domain?: string; path?: string; httpOnly?: boolean; secure?: boolean }[] = []
    for (const [key, val] of Object.entries(response.headers)) {
      if (key.toLowerCase() === 'set-cookie') {
        // 解析 Set-Cookie: name=value; Domain=...; Path=...; HttpOnly; Secure
        const parts = val.split(';').map(s => s.trim())
        const [name, ...valueParts] = parts[0].split('=')
        const cookie: typeof cookies[0] = { name: name.trim(), value: valueParts.join('=').trim() }
        for (const part of parts.slice(1)) {
          const [attr, attrVal] = part.split('=').map(s => s.trim())
          const lowerAttr = attr.toLowerCase()
          if (lowerAttr === 'domain') cookie.domain = attrVal
          else if (lowerAttr === 'path') cookie.path = attrVal
          else if (lowerAttr === 'httponly') cookie.httpOnly = true
          else if (lowerAttr === 'secure') cookie.secure = true
        }
        cookies.push(cookie)
      }
    }
    return cookies
  }, [response?.headers])

  function addHeader() { setHeaders(prev => [...prev, { id: Date.now(), key: '', value: '' }]) }
  function removeHeader(id: number) { setHeaders(prev => prev.filter(h => h.id !== id)) }
  function updateHeader(id: number, field: 'key' | 'value', val: string) {
    setHeaders(prev => prev.map(h => h.id === id ? { ...h, [field]: val } : h))
  }

  // ── Query Params 管理 ──
  function addParam() { setParams(prev => [...prev, { id: Date.now(), key: '', value: '' }]) }
  function removeParam(id: number) { setParams(prev => prev.filter(p => p.id !== id)) }
  function updateParam(id: number, field: 'key' | 'value', val: string) {
    setParams(prev => {
      const next = prev.map(p => p.id === id ? { ...p, [field]: val } : p)
      // 双向同步：Params → URL
      syncParamsToUrl(next)
      return next
    })
  }

  /** 将 params 数组同步到 URL 的 query string */
  function syncParamsToUrl(currentParams: HeaderRow[]) {
    const active = currentParams.filter(p => p.key.trim())
    if (active.length === 0) return
    // 去掉 URL 中已有的 query string，拼接新的
    const baseUrl = url.trim().replace(/\?.*$/, '')
    const qs = active.map(p => `${encodeURIComponent(p.key.trim())}=${encodeURIComponent(p.value)}`).join('&')
    if (qs && baseUrl !== url.trim()) {
      setUrl(`${baseUrl}?${qs}`)
    }
  }

  /** URL 变化时反向解析 query string → params */
  function syncUrlToParams(newUrl: string) {
    const qIdx = newUrl.indexOf('?')
    if (qIdx === -1) return // 无 query string，保留现有 params
    const qs = newUrl.slice(qIdx + 1)
    if (!qs.trim()) return
    const pairs = qs.split('&').filter(Boolean)
    if (pairs.length === 0) return
    const newParams: HeaderRow[] = pairs.map((pair, i) => {
      const [k, ...v] = pair.split('=')
      return { id: Date.now() + i, key: decodeURIComponent(k), value: decodeURIComponent(v.join('=')) }
    })
    setParams(newParams)
  }

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 flex items-center gap-3 px-4 border-b border-border/5 bg-surface-light/50 shrink-0 drag-region">
        <Send size={18} className="text-accent" />
        <h2 className="text-lg font-semibold">API 调试</h2>
        <div className="flex-1" />
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden animate-tab-switch" key={activeTabId} ref={centerPanelRef}>
          {/* 标签栏 */}
          <div className="px-2 py-0 flex items-end shrink-0">
            <div className="flex items-end gap-0.5 overflow-x-auto flex-1 min-w-0">
              {tabs.map(t => (
                <button key={t.id}
                  onClick={() => switchTab(t.id)}
                  onMouseDown={e => e.button === 1 && closeTab(t.id)}
                  className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs transition-colors whitespace-nowrap shrink-0 border border-b-0
                    ${t.id === activeTabId
                      ? 'bg-accent/10 border-border/5 border-t-2 border-t-accent text-foreground font-semibold'
                      : 'bg-transparent border-transparent text-muted hover:bg-hover/5 hover:text-foreground'}`}
                >
                  <span className={`font-mono text-[10px] ${t.method === 'GET' ? 'text-success' : t.method === 'POST' ? 'text-warning' : t.method === 'DELETE' ? 'text-danger' : 'text-accent-light'}`}>
                    {t.method}
                  </span>
                  <span className="max-w-[100px] truncate">{t.name || '新请求'}</span>
                  {tabs.length > 1 && (
                    <span
                      onClick={e => { e.stopPropagation(); closeTab(t.id) }}
                      className="opacity-0 group-hover:opacity-100 ml-0.5 p-0.5 rounded hover:bg-red-500/20 text-muted hover:text-red-400"
                    >×</span>
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={e => {
                if (e.ctrlKey || e.metaKey) { setShowCurlImport(true); return }
                createTab()
              }}
              className="p-1 mb-1 rounded hover:bg-accent/20 text-muted hover:text-accent-light transition-colors shrink-0"
              title="新建标签 · Ctrl+点击导入 cURL"
            >
              <Plus size={14} />
            </button>
          </div>
          {/* 请求名称栏 */}
          <div className="px-4 py-2 bg-surface flex items-center gap-2 shrink-0">
            <EditableName
              value={tab.name}
              onChange={v => updateActiveTab({ name: v || '新请求' })}
            />
          </div>
          {/* 请求栏 */}
          <div className="px-4 py-3 border-b border-border/5 bg-surface shrink-0 space-y-2">
        <div className="flex gap-2">
          {/* Method */}
          <div className="relative">
            <select
              value={method}
              onChange={e => setMethod(e.target.value)}
              className={`h-9 rounded-lg pl-3 pr-7 text-xs font-bold outline-none
                         bg-surface border border-border/5 focus:border-accent/50
                         appearance-none cursor-pointer transition-colors
                         ${method === 'GET' ? '!bg-success/10 text-success !border-success/30' :
                           method === 'POST' ? '!bg-warning/10 text-warning !border-warning/30' :
                           method === 'PUT' ? '!bg-blue-500/10 text-blue-400 !border-blue-500/30' :
                           method === 'DELETE' ? '!bg-danger/10 text-danger !border-danger/30' :
                           '!bg-accent/10 text-accent-light !border-accent/30'}`}
            >
              {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          </div>
          {/* URL */}
          <div className="flex-1 h-9 relative rounded-lg border border-border/5 focus-within:border-accent/50 overflow-hidden bg-surface">
              <div
                className="absolute inset-0 pointer-events-none flex items-center px-3 text-sm font-mono whitespace-pre overflow-hidden"
                aria-hidden="true"
              >
                <span className={url ? '' : 'text-muted/30'}>
                  {url ? renderHighlightedText(url) : 'api.example.com/endpoint'}
                </span>
              </div>
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                onBlur={e => syncUrlToParams(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="api.example.com/endpoint"
                className="w-full h-full px-3 text-sm font-mono outline-none bg-transparent placeholder:text-transparent"
                style={{ color: 'transparent', caretColor: 'rgb(var(--color-foreground))' }}
              />
            </div>
          {/* Send */}
          <button
            onClick={handleSend}
            disabled={isSending || !url.trim()}
            className="flex items-center gap-1.5 px-5 h-9 rounded-lg text-sm font-semibold
                       bg-accent hover:bg-accent-light text-foreground active:scale-95
                       disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            发送
          </button>
          {/* Save */}
          <div ref={saveBtnRef}>
          {editingRequest ? (
            <button onClick={(e) => handleSave(e)}
              disabled={!url.trim()}
              className="flex items-center gap-1.5 px-4 h-9 rounded-lg text-sm font-medium
                         bg-success/20 hover:bg-success/30 text-success transition-all active:scale-90
                         disabled:opacity-30 disabled:cursor-not-allowed"
              title="Ctrl+点击可选择分组">
              <Save size={14} />
              更新
            </button>
          ) : (
            <button onClick={(e) => handleSave(e)}
              disabled={!url.trim()}
              className="flex items-center gap-1.5 px-4 h-9 rounded-lg text-sm font-medium
                         bg-accent/20 hover:bg-accent/30 text-accent-light transition-all
                         disabled:opacity-30 disabled:cursor-not-allowed"
              title="Ctrl+点击可选择分组">
              <Save size={14} />
              保存
            </button>
          )}
          </div>
        </div>

        {/* 变量弹窗 */}
        {showVars && createPortal(
          <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${varsClosing ? 'opacity-0' : 'opacity-100'}`}>
            <div className={`bg-surface-light border border-border/10 rounded-2xl w-[700px] h-[85vh] flex flex-col shadow-2xl transition-all duration-200 ${varsClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100 animate-fade-in'}`} onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/5 shrink-0">
                <div className="flex items-center gap-2">
                  <Variable size={16} className="text-accent-light" />
                  <h3 className="text-sm font-semibold">环境变量 ({env})</h3>
                </div>
                <button onClick={handleCloseVars} className="p-1 rounded-lg hover:bg-hover/10 text-muted hover:text-foreground">
                  <X size={16} />
                </button>
              </div>
              <div className="px-6 pt-4 pb-2 shrink-0">
                {/* 搜索 */}
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      value={varSearchInput}
                      onChange={e => setVarSearchInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && setVarSearch(varSearchInput)}
                      placeholder="搜索变量名或注释..."
                      className="w-full rounded-lg pl-3 pr-8 py-2 text-xs bg-surface border border-border/5 outline-none focus:border-accent/50"
                    />
                    {varSearchInput && (
                      <button onClick={() => { setVarSearch(''); setVarSearchInput('') }}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-muted hover:text-foreground transition-colors">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  <button onClick={() => setVarSearch(varSearchInput)}
                    className="p-2 rounded-lg bg-surface border border-border/5 hover:border-accent/50 text-muted hover:text-foreground transition-colors">
                    <Search size={14} />
                  </button>
                  {varSearch && (
                    <button onClick={() => { setVarSearch(''); setVarSearchInput('') }}
                      className="p-2 rounded-lg hover:bg-hover/10 text-muted hover:text-foreground transition-colors">
                      <X size={14} />
                    </button>
                  )}
              </div>
              </div>
              {/* 变量列表 - 可滚动 */}
              <div className="flex-1 overflow-y-auto px-6 py-2 space-y-2">
                {filteredVars.length === 0 && (
                  <p className="text-xs text-muted text-center py-4">{varSearch ? '无匹配变量' : '暂无变量'}</p>
                )}
                {filteredVars.map(v => (
                  <div key={v.id} className={`flex items-center gap-2 ${deletingVarId === v.id ? 'animate-slide-out-left' : ''}`}>
                    <input value={v.key}
                      onChange={e => updateVar(v.id, 'key', e.target.value)}
                      className="w-28 rounded-lg px-3 py-2 text-xs font-mono bg-surface border border-border/5 outline-none focus:border-accent/50 text-accent-light shrink-0" />
                    <input value={v.value}
                      onChange={e => updateVar(v.id, 'value', e.target.value)}
                      className="flex-1 rounded-lg px-3 py-2 text-xs font-mono bg-surface border border-border/5 outline-none focus:border-accent/50" />
                    <input value={v.comment || ''}
                      onChange={e => updateVar(v.id, 'comment', e.target.value)}
                      placeholder="注释"
                      className="w-28 rounded-lg px-2 py-2 text-[11px] bg-surface border border-border/5 outline-none focus:border-accent/50 text-muted shrink-0" />
                    <button onClick={() => removeVar(v.id)}
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-muted hover:text-red-400 shrink-0 transition-colors"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
              {/* 新增变量 - 固定底部 */}
              <div className="shrink-0 px-6 py-3 border-t border-border/5">
                <span className="text-[10px] text-muted uppercase tracking-wider mb-2 block">新增变量</span>
                <div className="flex items-center gap-2 p-2 rounded-lg border border-dashed border-border/10 bg-surface/50">
                  <input value={newVarKey} onChange={e => setNewVarKey(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addVar()}
                    placeholder="变量名"
                    className={`w-28 rounded-lg px-3 py-2 text-xs font-mono bg-transparent outline-none placeholder:text-muted/40 ${isDuplicate ? 'text-danger' : ''}`} />
                  <input value={newVarValue} onChange={e => setNewVarValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addVar()}
                    placeholder="变量值" className="flex-1 rounded-lg px-3 py-2 text-xs font-mono bg-transparent outline-none placeholder:text-muted/40" />
                  <input value={newVarComment} onChange={e => setNewVarComment(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addVar()}
                    placeholder="注释" className="w-28 rounded-lg px-2 py-2 text-[11px] bg-transparent outline-none placeholder:text-muted/40" />
                  <button onClick={addVar} disabled={!newVarKey.trim() || isDuplicate}
                    className="px-4 py-2 rounded-lg text-xs font-medium bg-accent hover:bg-accent-light text-foreground disabled:opacity-40 transition-all shrink-0">
                    {!newVarKey.trim() ? '添加' : isDuplicate ? '重复' : '添加'}
                  </button>
                </div>
                {isDuplicate && <p className="text-[10px] text-danger mt-1">变量名已存在</p>}
              </div>
              {/* 底部按钮 */}
              <div className="flex items-center justify-between px-6 py-3 border-t border-border/5 shrink-0">
                {isVarsDirty ? <span className="text-[11px] text-warning">有未保存的修改</span> : <span />}
                <div className="flex gap-2">
                  <button onClick={handleCloseVars}
                    className="px-4 py-2 rounded-lg text-xs font-medium bg-hover/5 hover:bg-hover/10 text-muted hover:text-foreground transition-colors">
                    关闭
                  </button>
                  <button onClick={handleSaveVars}
                    className="px-5 py-2 rounded-lg text-xs font-medium bg-accent hover:bg-accent-light text-foreground transition-all">
                    保存
                  </button>
                </div>
              </div>
            </div>
          </div>, document.body)}
      </div>

      {/* ── 并发性能测试面板 ── */}
      <div className="px-4 border-b border-border/5 bg-surface-light/10 shrink-0">
        <button
          onClick={() => setShowPerfPanel(!showPerfPanel)}
          className="flex items-center gap-2 w-full py-2 text-xs font-medium text-muted hover:text-foreground transition-colors"
        >
          <Gauge size={14} className={showPerfPanel ? 'text-accent-light' : ''} />
          性能测试
          <ChevronDown size={12} className={`ml-auto transition-transform duration-200 ${showPerfPanel ? 'rotate-0' : ''}`} />
        </button>

        <div className={`overflow-hidden transition-all duration-300 ease-out ${showPerfPanel ? 'max-h-[360px] opacity-100 pb-3 overflow-y-auto' : 'max-h-0 opacity-0'}`}>
          {/* 控制区 */}
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-muted uppercase tracking-wider whitespace-nowrap">并发数</label>
              <input
                type="number" min={1} max={200} value={concurrency}
                onChange={e => setConcurrency(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))}
                className="w-16 rounded px-2 py-1 text-xs font-mono outline-none bg-surface border border-border/5 focus:border-accent/50"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-muted uppercase tracking-wider whitespace-nowrap">总请求</label>
              <input
                type="number" min={1} max={10000} value={totalRequests}
                onChange={e => setTotalRequests(Math.max(1, Math.min(10000, parseInt(e.target.value) || 1)))}
                className="w-20 rounded px-2 py-1 text-xs font-mono outline-none bg-surface border border-border/5 focus:border-accent/50"
              />
            </div>
            <button
              onClick={handleBatchSend}
              disabled={batchRunning || !url.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold
                         bg-accent hover:bg-accent-light text-foreground
                         disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {batchRunning ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
              {batchRunning ? '压测中...' : '开始压测'}
            </button>
          </div>

          {/* 错误信息 */}
          {batchError && (
            <div className="mb-3 p-2.5 rounded-lg bg-danger/5 border border-danger/10 flex items-start gap-2">
              <AlertCircle size={14} className="text-danger shrink-0 mt-0.5" />
              <p className="text-xs text-danger font-mono">{batchError}</p>
            </div>
          )}

          {/* 结果区 */}
          {batchResult && (
            <div className="space-y-3 animate-fade-in">
              {/* 总览卡片 */}
              <div className="grid grid-cols-6 gap-2">
                <div className="bg-surface rounded-lg p-2.5 border border-border/5">
                  <div className="text-[10px] text-muted uppercase tracking-wider">总请求</div>
                  <div className="text-lg font-bold text-foreground font-mono">{batchResult.total}</div>
                </div>
                <div className="bg-surface rounded-lg p-2.5 border border-border/5">
                  <div className="text-[10px] text-muted uppercase tracking-wider">成功</div>
                  <div className="text-lg font-bold text-success font-mono">{batchResult.success}</div>
                </div>
                <div className="bg-surface rounded-lg p-2.5 border border-border/5">
                  <div className="text-[10px] text-muted uppercase tracking-wider">失败</div>
                  <div className={`text-lg font-bold font-mono ${batchResult.failed > 0 ? 'text-danger' : 'text-muted'}`}>{batchResult.failed}</div>
                </div>
                <div className="bg-surface rounded-lg p-2.5 border border-border/5">
                  <div className="text-[10px] text-muted uppercase tracking-wider">最快响应</div>
                  <div className="text-lg font-bold text-success font-mono">{batchResult.minDuration}<span className="text-[10px] text-muted ml-0.5">ms</span></div>
                </div>
                <div className="bg-surface rounded-lg p-2.5 border border-border/5">
                  <div className="text-[10px] text-muted uppercase tracking-wider">最慢响应</div>
                  <div className="text-lg font-bold text-danger font-mono">{batchResult.maxDuration}<span className="text-[10px] text-muted ml-0.5">ms</span></div>
                </div>
                <div className="bg-surface rounded-lg p-2.5 border border-border/5">
                  <div className="text-[10px] text-muted uppercase tracking-wider">平均响应</div>
                  <div className="text-lg font-bold text-warning font-mono">{batchResult.avgDuration}<span className="text-[10px] text-muted ml-0.5">ms</span></div>
                </div>
              </div>

              {/* 每次请求响应详情 */}
              <div className="bg-surface rounded-lg border border-border/5 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border/5 bg-surface-light/30">
                  <Clock size={12} className="text-muted" />
                  <span className="text-[10px] text-muted uppercase tracking-wider">
                    每次请求响应 ({batchResult.items.length})
                  </span>
                </div>
                <div className="max-h-[240px] overflow-y-auto">
                  <table className="w-full text-xs font-mono">
                    <thead className="sticky top-0 bg-surface-light/80 backdrop-blur-sm">
                      <tr className="border-b border-border/10">
                        <th className="text-left px-3 py-1.5 text-[10px] text-muted uppercase tracking-wider font-medium w-12">序号</th>
                        <th className="text-left px-3 py-1.5 text-[10px] text-muted uppercase tracking-wider font-medium w-14">状态码</th>
                        <th className="text-left px-3 py-1.5 text-[10px] text-muted uppercase tracking-wider font-medium w-16">耗时</th>
                        <th className="text-left px-3 py-1.5 text-[10px] text-muted uppercase tracking-wider font-medium">响应体</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchResult.items.map((item, i) => (
                        <tr key={i} className="border-b border-border/[0.03] hover:bg-hover/[0.02]">
                          <td className="px-3 py-1 text-muted align-top">#{item.index + 1}</td>
                          <td className="px-3 py-1 align-top">
                            <span className={`font-bold ${!item.status ? 'text-muted' : item.status < 300 ? 'text-success' : item.status < 400 ? 'text-warning' : 'text-danger'}`}>
                              {item.status ?? '-'}
                            </span>
                          </td>
                          <td className="px-3 py-1 text-muted align-top">{item.duration} ms</td>
                          <td className="px-3 py-1 align-top">
                            {item.error ? (
                              <span className="text-danger break-all">{item.error}</span>
                            ) : item.body ? (
                              <span className="text-muted break-all text-[11px] leading-relaxed whitespace-pre-wrap">{item.body}</span>
                            ) : (
                              <span className="text-muted">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs: Params / Headers / Body / Pre / Post */}
          {/* Tab bar */}
          <div className="flex border-b border-border/5 px-4 bg-surface-light/10">
            {(['params', 'headers', 'body', 'prescript', 'postscript'] as TabKey[]).map(t => (
              <button key={t}
                onClick={() => switchReqTab(t)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors
                  ${activeTabKey === t ? 'border-accent text-accent-light' : 'border-transparent text-muted hover:text-foreground'}`}
              >
                {t === 'params' ? 'Params' : t === 'headers' ? 'Headers' : t === 'body' ? 'Body' : t === 'prescript' ? '前置脚本' : '提取变量'}
                {t === 'params' && params.filter(p => p.key.trim()).length > 0 && (
                  <span className="ml-1 text-[10px] text-accent-light">({params.filter(p => p.key.trim()).length})</span>
                )}
              </button>
            ))}
          </div>

          {/* 请求区滑动面板 */}
          <div className="flex-1 overflow-hidden">
            <div key={`req-${activeTabKey}`} className={'h-full w-full ' + (reqDir === 'right' ? 'animate-slide-in-right' : 'animate-slide-in-left')}>
              {activeTabKey === 'params' && (
                <div className="h-full overflow-y-auto p-3 space-y-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-muted uppercase tracking-wider">Query Params</span>
                    <span className="text-[10px] text-muted">URL 自动同步</span>
                  </div>
                  {params.map(p => (
                    <div key={p.id} className="flex gap-1 items-center">
                      <div className="w-48 h-7 relative rounded overflow-hidden bg-surface border border-border/5 focus-within:border-accent/50">
                        <div className="absolute inset-0 pointer-events-none flex items-center px-2 text-xs font-mono whitespace-pre overflow-hidden" aria-hidden="true">
                          <span className={p.key ? '' : 'text-muted/30'}>
                            {p.key ? renderHighlightedText(p.key) : 'Key'}
                          </span>
                        </div>
                        <input value={p.key} onChange={e => updateParam(p.id, 'key', e.target.value)}
                          placeholder="Key"
                          className="w-full h-full px-2 text-xs font-mono outline-none bg-transparent placeholder:text-transparent"
                          style={{ color: 'transparent', caretColor: 'rgb(var(--color-foreground))' }}
                        />
                      </div>
                      <div className="flex-1 h-7 relative rounded overflow-hidden bg-surface border border-border/5 focus-within:border-accent/50">
                        <div className="absolute inset-0 pointer-events-none flex items-center px-2 text-xs font-mono whitespace-pre overflow-hidden" aria-hidden="true">
                          <span className={p.value ? '' : 'text-muted/30'}>
                            {p.value ? renderHighlightedText(p.value) : 'Value'}
                          </span>
                        </div>
                        <input value={p.value} onChange={e => updateParam(p.id, 'value', e.target.value)}
                          placeholder="Value"
                          className="w-full h-full px-2 text-xs font-mono outline-none bg-transparent placeholder:text-transparent"
                          style={{ color: 'transparent', caretColor: 'rgb(var(--color-foreground))' }}
                        />
                      </div>
                      <button onClick={() => removeParam(p.id)}
                        className="p-1 rounded hover:bg-red-500/20 text-muted hover:text-red-400">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                  <button onClick={addParam}
                    className="flex items-center gap-1 text-xs text-muted hover:text-accent-light transition-colors pt-1">
                    <Plus size={12} /> 添加 Param
                  </button>
                </div>
              )}

              {activeTabKey === 'headers' && (
                <div className="h-full overflow-y-auto p-3 space-y-1">
                  {headers.map(h => (
                    <div key={h.id} className="flex gap-1 items-center">
                      <div className="w-48 h-7 relative rounded overflow-hidden bg-surface border border-border/5 focus-within:border-accent/50">
                        <div className="absolute inset-0 pointer-events-none flex items-center px-2 text-xs font-mono whitespace-pre overflow-hidden" aria-hidden="true">
                          <span className={h.key ? '' : 'text-muted/30'}>
                            {h.key ? renderHighlightedText(h.key) : 'Key'}
                          </span>
                        </div>
                        <input value={h.key} onChange={e => updateHeader(h.id, 'key', e.target.value)}
                          placeholder="Key"
                          className="w-full h-full px-2 text-xs font-mono outline-none bg-transparent placeholder:text-transparent"
                          style={{ color: 'transparent', caretColor: 'rgb(var(--color-foreground))' }}
                        />
                      </div>
                      <div className="flex-1 h-7 relative rounded overflow-hidden bg-surface border border-border/5 focus-within:border-accent/50">
                        <div className="absolute inset-0 pointer-events-none flex items-center px-2 text-xs font-mono whitespace-pre overflow-hidden" aria-hidden="true">
                          <span className={h.value ? '' : 'text-muted/30'}>
                            {h.value ? renderHighlightedText(h.value) : 'Value'}
                          </span>
                        </div>
                        <input value={h.value} onChange={e => updateHeader(h.id, 'value', e.target.value)}
                          placeholder="Value"
                          className="w-full h-full px-2 text-xs font-mono outline-none bg-transparent placeholder:text-transparent"
                          style={{ color: 'transparent', caretColor: 'rgb(var(--color-foreground))' }}
                        />
                      </div>
                      <button onClick={() => removeHeader(h.id)}
                        className="p-1 rounded hover:bg-red-500/20 text-muted hover:text-red-400">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                  <button onClick={addHeader}
                    className="flex items-center gap-1 text-xs text-muted hover:text-accent-light transition-colors pt-1">
                    <Plus size={12} /> 添加 Header
                  </button>
                </div>
              )}

              {activeTabKey === 'body' && (
                <div className="h-full flex flex-col overflow-hidden p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-muted uppercase tracking-wider">Body</span>
                    <button
                      onClick={() => {
                        try {
                          const current = bodyContentRef.current
                          const formatted = JSON.stringify(JSON.parse(current), null, 2)
                          setBody(formatted)
                          bodyContentRef.current = formatted
                        } catch { }
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-muted hover:text-foreground hover:bg-hover/10 transition-colors">
                      <Sparkles size={11} /> 美化
                    </button>
                  </div>
                  <JsonEditor key={editingRequest?.reqId ?? 'new'} value={body} onChange={setBody} contentRef={bodyContentRef} />
                </div>
              )}

              {activeTabKey === 'prescript' && (
                <div className="h-full flex flex-col overflow-hidden p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-muted uppercase tracking-wider">前置脚本</span>
                    <span className="text-[10px] text-muted/50">请求发送前执行 · env.set(key, value)</span>
                  </div>
                  <JsonEditor key={`pre-${editingRequest?.reqId ?? 'new'}`} value={preScript} onChange={setPreScript} />
                </div>
              )}

              {activeTabKey === 'postscript' && (
                <div className="h-full flex flex-col min-h-0 overflow-hidden p-3">
                  <div className="flex-1 flex gap-3 min-h-0">
                    {/* 左侧：响应 JSON 树 */}
                    <div className="flex-1 flex flex-col min-h-0 min-w-0">
                      {response?.body ? (
                        <>
                          <div className="text-[10px] text-muted/60 mb-1 shrink-0 flex items-center gap-1">
                            <Variable size={10} />
                            点击字段值提取变量
                          </div>
                          <div className="flex-1 min-h-0 border border-border/5 rounded-lg overflow-hidden bg-surface/50">
                            <JsonTreeView value={response.body} onExtractVar={(path) => addExtraction(path)} />
                          </div>
                        </>
                      ) : (
                        <div className="flex-1 flex items-center justify-center">
                          <div className="text-center text-muted">
                            <Send size={20} className="mx-auto mb-1.5 opacity-10" />
                            <p className="text-[11px]">发送请求后，在此点击响应字段即可提取变量</p>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* 右侧：已提取变量 — 始终展示 */}
                    <div className="w-56 shrink-0 flex flex-col min-h-0">
                      <div className="flex items-center justify-between mb-1 shrink-0">
                        <span className="text-[10px] text-muted uppercase tracking-wider">
                          已提取 ({extractions.length})
                        </span>
                        <div className="flex gap-1">
                          <button onClick={() => { setExtractions([]); updateActiveTab({ postScript: '' }) }}
                            className="px-1.5 py-0.5 rounded text-[10px] text-muted hover:text-foreground hover:bg-hover/10 transition-colors"
                            title="清空提取列表和后置脚本">
                            清空
                          </button>
                          <button onClick={runExtractions}
                            disabled={extractions.length === 0 || savedFlash}
                            className={`flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-medium transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed
                              ${savedFlash ? 'bg-success/20 text-success scale-105' : 'bg-accent/20 hover:bg-accent/30 text-accent-light'}`}>
                            {savedFlash ? <CheckCircle2 size={10} /> : <Sparkles size={10} />}
                            {savedFlash ? '已保存' : '保存'}
                          </button>
                        </div>
                      </div>
                      {extractions.length > 0 ? (
                        <div className="flex-1 overflow-y-auto space-y-1">
                          {extractions.map(e => (
                            <div key={e.id} className={`flex items-center gap-1.5 bg-surface rounded-lg px-2 py-1.5 border border-border/5 ${deletingExtId === e.id ? 'animate-slide-out-left' : ''}`}>
                              <span className="text-[10px] font-mono text-muted truncate flex-1" title={e.path}>{e.path}</span>
                              <span className="text-[9px] text-muted">→</span>
                              <input
                                value={e.varName}
                                onChange={ev => updateExtractionVar(e.id, ev.target.value)}
                                className="w-20 text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/5 bg-surface-light outline-none focus:border-accent/50 text-accent-light text-center"
                              />
                              <button onClick={() => removeExtraction(e.id)}
                                className="p-0.5 rounded hover:bg-red-500/20 text-muted hover:text-red-400 shrink-0">
                                <X size={10} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted/50 py-2">点击左侧 JSON 字段值即可提取</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── 拖拽分隔条 ── */}
          <div
            className="h-1.5 shrink-0 cursor-row-resize hover:bg-accent/20 active:bg-accent/30 transition-colors group flex items-center justify-center border-t border-border/5"
            onMouseDown={e => {
              if (!centerPanelRef.current) return
              dragRef.current = { startY: e.clientY, startRatio: resPanelRatio }
              e.preventDefault()
            }}
          >
            <div className="w-8 h-0.5 rounded-full bg-border/30 group-hover:bg-accent/50 transition-colors" />
          </div>

          {/* ── 响应区 (Postman 风格) ── */}
          <div className="flex flex-col shrink-0 border-t border-border/5" style={{ height: `${resPanelRatio}%` }}>
            {/* 状态栏 */}
            <div className="flex items-center gap-3 px-4 py-1.5 bg-surface-light/20 border-b border-border/5 shrink-0">
              <span className="text-[11px] font-semibold text-foreground tracking-wide">Response</span>
              {response && !response.error && (
                <>
                  {/* 状态码徽章 */}
                  <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded
                    ${response.status! < 300 ? 'bg-success/15 text-success' :
                      response.status! < 400 ? 'bg-warning/15 text-warning' : 'bg-danger/15 text-danger'}`}>
                    {response.status} {response.statusText}
                  </span>
                  {/* 耗时 */}
                  {response.duration != null && (
                    <span className="flex items-center gap-1 text-[11px] text-muted">
                      <Clock size={10} />
                      {response.duration} ms
                    </span>
                  )}
                  {/* 大小 */}
                  {response.body && (
                    <span className="text-[11px] text-muted">
                      {responseSize >= 1024
                        ? `${(responseSize / 1024).toFixed(1)} KB`
                        : `${responseSize} B`}
                    </span>
                  )}
                  <div className="flex-1" />
                  {/* 复制按钮 */}
                  <button
                    onClick={() => navigator.clipboard.writeText(response.body!)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-muted hover:text-foreground hover:bg-hover/10 transition-colors"
                    title="复制响应体"
                  >
                    <Copy size={11} />
                    复制
                  </button>
                </>
              )}
              {response?.error && (
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-danger/15 text-danger">
                  Error
                </span>
              )}
            </div>

            {/* 响应标签栏: Body | Cookies | Headers | Request */}
            <div className="flex items-center px-4 bg-surface-light/10 border-b border-border/5 shrink-0">
              {(['body', 'cookies', 'headers', 'request'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => switchResTab(t)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium border-b-2 transition-colors
                    ${responseTab === t ? 'border-accent text-accent-light' : 'border-transparent text-muted hover:text-foreground'}`}
                >
                  {t === 'body' ? <FileCode size={11} /> : t === 'cookies' ? <CheckCircle2 size={11} /> : t === 'headers' ? <Eye size={11} /> : <Upload size={11} />}
                  {t === 'body' ? 'Body' : t === 'cookies' ? 'Cookies' : t === 'headers' ? 'Headers' : 'Request'}
                  {t === 'cookies' && responseCookies.length > 0 && (
                    <span className="text-[10px] text-muted ml-0.5">({responseCookies.length})</span>
                  )}
                  {t === 'headers' && response?.headers && (
                    <span className="text-[10px] text-muted ml-0.5">({Object.keys(response.headers).length})</span>
                  )}
                </button>
              ))}
              {/* Body 子模式切换 (Tree / Pretty / Raw) */}
              {responseTab === 'body' && response?.body && (
                <div className="flex items-center gap-1 ml-auto">
                  <button onClick={() => setResponseViewMode('tree')}
                    className={`px-2 py-1 rounded text-[10px] transition-colors ${responseViewMode === 'tree' ? 'bg-accent/20 text-accent-light' : 'text-muted hover:text-foreground hover:bg-hover/10'}`}>Tree</button>
                  <button onClick={() => setResponseViewMode('pretty')}
                    className={`px-2 py-1 rounded text-[10px] transition-colors ${responseViewMode === 'pretty' ? 'bg-accent/20 text-accent-light' : 'text-muted hover:text-foreground hover:bg-hover/10'}`}>Pretty</button>
                  <button onClick={() => setResponseViewMode('raw')}
                    className={`px-2 py-1 rounded text-[10px] transition-colors ${responseViewMode === 'raw' ? 'bg-accent/20 text-accent-light' : 'text-muted hover:text-foreground hover:bg-hover/10'}`}>Raw</button>
                </div>
              )}
            </div>

            {/* 响应内容区 - 滑动 */}
            <div className="flex-1 overflow-hidden">
              <div key={`res-${responseTab}`} className={'h-full w-full ' + (resDir === 'right' ? 'animate-slide-in-right' : 'animate-slide-in-left')}>
                {!response ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-muted">
                    <Send size={24} className="mx-auto mb-2 opacity-15" />
                    <p className="text-xs">点击发送后显示响应</p>
                  </div>
                </div>
              ) : responseTab === 'body' ? (
                /* Body 视图 */
                <div className="h-full overflow-y-auto">
                  {response.error ? (
                    <div className="p-4">
                      <div className="bg-danger/5 border border-danger/10 rounded-lg p-3">
                        <p className="text-xs text-danger font-mono whitespace-pre-wrap break-all">{response.error}</p>
                      </div>
                    </div>
                  ) : !response.body ? (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-xs text-muted">(空响应)</p>
                    </div>
                  ) : responseViewMode === 'tree' ? (
                    <JsonTreeView value={response.body} onExtractVar={handleExtractVar} />
                  ) : (
                    <JsonEditor value={formattedBody || '(空响应)'} readOnly />
                  )}
                </div>
              ) : responseTab === 'cookies' ? (
                /* Cookies 视图 */
                <div className="h-full overflow-y-auto">
                  {responseCookies.length > 0 ? (
                    <div className="p-3">
                      <table className="w-full text-xs font-mono">
                        <thead>
                          <tr className="border-b border-border/10">
                            <th className="text-left px-3 py-1.5 text-[10px] text-muted uppercase tracking-wider font-medium w-[25%]">Name</th>
                            <th className="text-left px-3 py-1.5 text-[10px] text-muted uppercase tracking-wider font-medium">Value</th>
                            <th className="text-left px-3 py-1.5 text-[10px] text-muted uppercase tracking-wider font-medium w-[15%]">Domain</th>
                            <th className="text-left px-3 py-1.5 text-[10px] text-muted uppercase tracking-wider font-medium w-[10%]">Path</th>
                            <th className="text-center px-3 py-1.5 text-[10px] text-muted uppercase tracking-wider font-medium w-[12%]">Flags</th>
                          </tr>
                        </thead>
                        <tbody>
                          {responseCookies.map((c, i) => (
                            <tr key={i} className="border-b border-border/[0.03] hover:bg-hover/[0.02]">
                              <td className="px-3 py-1.5 text-accent-light font-medium break-all align-top">{c.name}</td>
                              <td className="px-3 py-1.5 text-muted break-all align-top">{c.value}</td>
                              <td className="px-3 py-1.5 text-muted break-all align-top text-[11px]">{c.domain || '-'}</td>
                              <td className="px-3 py-1.5 text-muted break-all align-top text-[11px]">{c.path || '-'}</td>
                              <td className="px-3 py-1.5 text-center align-top">
                                <div className="flex items-center justify-center gap-1 flex-wrap">
                                  {c.httpOnly && <span className="text-[10px] bg-warning/15 text-warning px-1 rounded">HttpOnly</span>}
                                  {c.secure && <span className="text-[10px] bg-success/15 text-success px-1 rounded">Secure</span>}
                                  {!c.httpOnly && !c.secure && <span className="text-[11px] text-muted">-</span>}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-xs text-muted">无 Cookies</p>
                    </div>
                  )}
                </div>
              ) : responseTab === 'headers' ? (
                /* Headers 视图 - Key/Value 表格 */
                <div className="h-full overflow-y-auto">
                  {response?.headers && sortedResponseHeaders.length > 0 ? (
                    <table className="w-full text-xs font-mono">
                      <thead className="sticky top-0 bg-surface-light/80 backdrop-blur-sm">
                        <tr className="border-b border-border/10">
                          <th className="text-left px-4 py-2 text-[10px] text-muted uppercase tracking-wider font-medium w-[40%]">Key</th>
                          <th className="text-left px-4 py-2 text-[10px] text-muted uppercase tracking-wider font-medium">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedResponseHeaders.map(([key, value]) => (
                          <tr key={key} className="border-b border-border/[0.03] hover:bg-hover/[0.02] transition-colors">
                            <td className="px-4 py-1.5 text-accent-light font-medium break-all align-top">{key}</td>
                            <td className="px-4 py-1.5 text-muted break-all align-top">{value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-xs text-muted">无响应头</p>
                    </div>
                  )}
                </div>
              ) : (
                /* Request 视图 - 实际发送的请求 */
                <div className="h-full overflow-y-auto">
                  {sentRequest ? (
                    <div className="p-3 space-y-3">
                      {/* 请求行 */}
                      <div>
                        <label className="text-[10px] text-muted uppercase tracking-wider block mb-1.5">请求行</label>
                        <div className="bg-surface rounded-lg p-2.5 flex items-center gap-2 flex-wrap">
                          <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded
                            ${sentRequest.method === 'GET' ? 'bg-success/15 text-success' :
                              sentRequest.method === 'POST' ? 'bg-warning/15 text-warning' :
                              sentRequest.method === 'PUT' ? 'bg-blue-500/15 text-blue-400' :
                              sentRequest.method === 'DELETE' ? 'bg-danger/15 text-danger' :
                              'bg-accent/15 text-accent-light'}`}>
                            {sentRequest.method}
                          </span>
                          <span className="text-[11px] font-mono text-foreground break-all">{sentRequest.url}</span>
                        </div>
                      </div>

                      {/* 请求头 */}
                      <div>
                        <label className="text-[10px] text-muted uppercase tracking-wider block mb-1.5">
                          Headers ({Object.keys(sentRequest.headers).length})
                        </label>
                        {Object.keys(sentRequest.headers).length > 0 ? (
                          <table className="w-full text-xs font-mono">
                            <thead>
                              <tr className="border-b border-border/10">
                                <th className="text-left px-3 py-1.5 text-[10px] text-muted uppercase tracking-wider font-medium w-[40%]">Key</th>
                                <th className="text-left px-3 py-1.5 text-[10px] text-muted uppercase tracking-wider font-medium">Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(sentRequest.headers).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => (
                                <tr key={key} className="border-b border-border/[0.03] hover:bg-hover/[0.02]">
                                  <td className="px-3 py-1.5 text-accent-light font-medium break-all align-top">{key}</td>
                                  <td className="px-3 py-1.5 text-muted break-all align-top">{value}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="text-xs text-muted bg-surface rounded-lg p-2.5">无请求头</p>
                        )}
                      </div>

                      {/* 请求体 */}
                      {sentRequest.body ? (
                        <div>
                          <label className="text-[10px] text-muted uppercase tracking-wider block mb-1.5">Body</label>
                          <div className="bg-surface rounded-lg p-2.5">
                            <pre className="text-[11px] font-mono text-muted whitespace-pre-wrap break-all">{sentRequest.body}</pre>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="text-[10px] text-muted uppercase tracking-wider block mb-1.5">Body</label>
                          <p className="text-xs text-muted bg-surface rounded-lg p-2.5">(无请求体)</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-xs text-muted">发送请求后可查看</p>
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：分组 + 历史 */}
        <aside className="w-56 border-l border-border/5 bg-surface-light/10 overflow-y-auto shrink-0 flex flex-col">
          {/* 变量入口 */}
          <div className="px-3 py-2 border-b border-border/5 flex items-center gap-1">
            <button
              onClick={openVarsModal}
              className="flex items-center gap-1.5 flex-1 text-[11px] text-muted hover:text-foreground transition-colors">
              <Variable size={13} />
              变量 ({envVars.length})
            </button>
            <div className="relative">
              <button
                ref={sysVarsBtnRef}
                onClick={() => showSysVars ? closeSysVars() : openSysVars()}
                className="p-1 rounded hover:bg-hover/10 text-muted hover:text-foreground transition-colors"
                title="系统变量">
                <Sparkles size={13} />
              </button>
              {showSysVars && createPortal(
                <SysVarsPopover closing={sysVarsClosing} onClose={closeSysVars} anchorRef={sysVarsBtnRef} />, document.body)}
            </div>
          </div>

          {/* 分组标题栏 */}
          <div className="px-3 py-2 flex items-center justify-end gap-1.5">
            <button onClick={() => setShowNewGroup(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium
                         bg-accent/15 hover:bg-accent/25 text-accent-light transition-all" title="新建分组">
              <FolderPlus size={13} />
              新建
            </button>
            <button onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium
                         bg-surface hover:bg-hover/10 text-muted hover:text-foreground border border-border/5 transition-all" title="导入 Postman / 备份">
              <Download size={13} />
              导入
            </button>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportFile} className="hidden" />
            <button onClick={() => {
              // 导出为 Postman Collection v2.1 格式
              const postmanItems = collections.map(c => ({
                name: c.name,
                item: c.items.map(req => {
                  const item: any = {
                    name: req.name,
                    request: {
                      method: req.method,
                      url: req.url.startsWith('http') ? { raw: req.url, protocol: req.url.split('://')[0], host: [req.url.split('://')[1]?.split('/')[0] || ''], path: req.url.split('://')[1]?.split('/').slice(1) || [] } : req.url,
                      header: req.headers.filter(h => h.key).map(h => ({ key: h.key, value: h.value })),
                    },
                  }
                  if (req.body && req.method !== 'GET') {
                    try {
                      item.request.body = { mode: 'raw', raw: JSON.stringify(JSON.parse(req.body), null, 2), options: { raw: { language: 'json' } } }
                    } catch { item.request.body = { mode: 'raw', raw: req.body } }
                  }
                  if (req.params.filter(p => p.key).length > 0) {
                    item.request.url = { raw: req.url, query: req.params.filter(p => p.key).map(p => ({ key: p.key, value: p.value })) }
                  }
                  return item
                }),
              }))
              const postman = {
                info: { name: 'API Collections', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
                item: postmanItems,
              }
              const blob = new Blob([JSON.stringify(postman, null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url; a.download = `postman-collection-${new Date().toISOString().slice(0,10)}.json`
              a.click(); URL.revokeObjectURL(url)
            }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium
                         bg-surface hover:bg-hover/10 text-muted hover:text-foreground border border-border/5 transition-all" title="导出为 Postman 格式">
              <Upload size={13} />
              导出
            </button>
          </div>

          {/* 新建分组输入 */}
          {showNewGroup && (
            <div className="px-3 pb-2 flex gap-1 animate-fade-in">
              <input
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createCollection(); if (e.key === 'Escape') setShowNewGroup(false) }}
                onBlur={() => {
                  if (newGroupName.trim()) setTimeout(() => createCollection(), 150)
                  else setTimeout(() => setShowNewGroup(false), 150)
                }}
                placeholder="分组名称"
                className="flex-1 rounded-lg px-2.5 py-1.5 text-xs outline-none bg-surface border border-border/5 focus:border-accent/50"
                autoFocus
              />
            </div>
          )}

          {/* 分组列表 */}
          <div className="flex-1 px-2 space-y-0.5">
          {collections.length === 0 ? null : (
            collections.map(c => (
              <div key={c.id}>
                {/* 分组标题 — 仿 NavItem 风格 */}
                {renamingCollId === c.id ? (
                  <div className="flex items-center gap-2 px-3 py-2">
                    <Folder size={14} className="shrink-0 text-muted" />
                    <input
                      value={renameCollName}
                      onChange={e => setRenameCollName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          if (renameCollName.trim()) {
                            setCollections(prev => {
                              const updated = prev.map(col => col.id === c.id ? { ...col, name: renameCollName.trim() } : col)
                              persistCollections(updated)
                              return updated
                            })
                          }
                          setRenamingCollId(null)
                        }
                        if (e.key === 'Escape') setRenamingCollId(null)
                      }}
                      onBlur={() => {
                        if (renameCollName.trim()) {
                          setCollections(prev => {
                            const updated = prev.map(col => col.id === c.id ? { ...col, name: renameCollName.trim() } : col)
                            persistCollections(updated)
                            return updated
                          })
                        }
                        setRenamingCollId(null)
                      }}
                      className="flex-1 px-1 py-0.5 text-[13px] font-medium bg-surface border border-accent/50 rounded outline-none animate-fade-in"
                      autoFocus
                    />
                    <span className="text-[10px] opacity-60">{c.items.length}</span>
                  </div>
                ) : (
                <button
                  ref={el => { if (el) collRefs.current.set(c.id, el); else collRefs.current.delete(c.id) }}
                  onClick={e => {
                    if (e.ctrlKey || e.metaKey) {
                      e.preventDefault()
                      setRenameCollName(c.name)
                      setRenamingCollId(c.id)
                      return
                    }
                    setExpandedIds(prev => {
                      const next = new Set(prev)
                      if (next.has(c.id)) next.delete(c.id); else next.add(c.id)
                      return next
                    })
                  }}
                  className={`w-full flex items-center gap-2 rounded-lg text-sm transition-colors group text-muted hover:bg-hover/5 hover:text-foreground px-3 py-2`}
                  title="Ctrl+点击重命名"
                >
                  <span className="transition-transform duration-200">
                    {expandedIds.has(c.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                  <Folder size={14} className="shrink-0" />
                  <span className="flex-1 text-left text-[13px] font-medium truncate">{c.name}</span>
                  <span className="text-[10px] opacity-60">{c.items.length}</span>
                  <button onClick={(e) => { e.stopPropagation(); showConfirm('确定删除整个分组及其所有接口？', () => deleteCollection(c.id)) }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/20 text-muted hover:text-red-400 transition-all">
                    <Trash2 size={11} />
                  </button>
                </button>
                )}

                {/* 分组内接口列表 — 仿子菜单风格 (左侧竖线) */}
                <div
                  className={`grid transition-all duration-300 ease-out min-h-[4px] ${expandedIds.has(c.id) ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                  onDragOver={(e) => handleDragOver(e, c.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, c.id)}
                >
                  <div className={`ml-4 border-l border-border/10 pl-2 py-0.5 space-y-0.5 overflow-hidden min-h-0 transition-colors ${dragOverCollId === c.id ? '!border-accent/50 bg-accent/5 rounded' : ''}`}>
                  {c.items.map((req, i) => (
                    <button key={req.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, req.id, c.id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => loadRequest(req, c.id)}
                      className={`w-full text-left rounded-md px-2.5 py-1.5 hover:bg-hover/5 group/item transition-colors
                        ${flashReqId === req.id ? 'animate-flash' : ''}
                        ${dragItem?.reqId === req.id ? 'opacity-40' : ''}`}
                      style={{ animationDelay: `${flashReqId === req.id ? 0 : i * 40}ms` }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-mono font-bold shrink-0
                          ${req.method === 'GET' ? 'text-success' : req.method === 'POST' ? 'text-warning' :
                            req.method === 'DELETE' ? 'text-danger' : 'text-accent-light'}`}>
                          {req.method}
                        </span>
                        <span className="text-[12px] truncate flex-1">{req.name}</span>
                        <button onClick={(e) => { e.stopPropagation(); deleteRequest(c.id, req.id) }}
                          className="opacity-0 group-hover/item:opacity-100 p-0.5 rounded hover:bg-red-500/20 text-muted hover:text-red-400 transition-all">
                          <Trash2 size={10} />
                        </button>
                      </div>
                      {req.url && <p className="text-[10px] text-muted truncate mt-0.5">{req.url}</p>}
                    </button>
                  ))}
                  </div>
                </div>
              </div>
            ))
          )}
          </div>

          {/* 历史记录 - 可折叠 */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] text-muted uppercase tracking-wider border-t border-border/5 mt-1 hover:text-foreground transition-colors"
          >
            <span>请求历史{history.length > 0 ? ` (${history.length})` : ''}</span>
            <ChevronDown size={12} className={`transition-transform duration-200 ${showHistory ? 'rotate-180' : ''}`} />
          </button>
          <div
            className="overflow-hidden transition-all duration-300 ease-out"
            style={{ maxHeight: showHistory ? '500px' : '0px', opacity: showHistory ? 1 : 0 }}
          >
            {history.length === 0 ? (
              <p className="px-3 text-xs text-muted">暂无记录</p>
            ) : (
              history.map((h, i) => (
                <button key={i}
                  onClick={() => { setMethod(h.method); setUrl(h.url) }}
                  className="w-full text-left px-3 py-2 hover:bg-hover/5 border-b border-border/5 last:border-0 transition-colors duration-150 animate-fade-in"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-mono font-bold px-1 rounded
                      ${h.method === 'GET' ? 'text-success' : h.method === 'POST' ? 'text-warning' :
                        h.method === 'DELETE' ? 'text-danger' : 'text-accent-light'}`}>
                      {h.method}
                    </span>
                    <span className={`text-[10px] font-mono font-bold ml-auto
                      ${h.status && h.status < 300 ? 'text-success' : h.status && h.status < 400 ? 'text-warning' : 'text-danger'}`}>
                      {h.status || 'ERR'}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted truncate mt-0.5">{h.url}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted">{h.time}</span>
                    {h.duration != null && <span className="text-[10px] text-muted">{h.duration}ms</span>}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>
      </div>

      {/* cURL 导入弹窗 */}
      {showCurlImport && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowCurlImport(false)}>
          <div className="bg-surface-light border border-border/10 rounded-2xl p-6 w-[520px] shadow-2xl animate-zoom-in"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <Code2 size={18} className="text-accent-light" />
              <h3 className="text-sm font-semibold">导入 cURL</h3>
            </div>
            <textarea
              autoFocus
              placeholder={`粘贴 cURL 命令，例如：
curl -X POST https://api.example.com/users -H "Content-Type: application/json" -d '{"name":"test"}'`}
              className="w-full h-40 bg-surface border border-border/5 rounded-xl p-3 text-xs font-mono outline-none focus:border-accent/50 resize-none"
              id="curl-import-textarea"
            />
            <p className="text-[10px] text-muted mt-2">Chrome DevTools: 右键请求 → Copy → Copy as cURL</p>
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setShowCurlImport(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-hover/5 hover:bg-hover/10 text-muted transition-colors">
                取消
              </button>
              <button onClick={() => {
                const textarea = document.getElementById('curl-import-textarea') as HTMLTextAreaElement
                if (!textarea?.value.trim()) return
                const parsed = parseCurl(textarea.value)
                if (!parsed) { alert('无法解析 cURL 命令'); return }
                setUrl(parsed.url.replace(/^https?:\/\//, ''))
                setMethod(parsed.method)
                const h = parsed.headers.map((h, i) => ({ id: i + 1, key: h.key, value: h.value }))
                if (h.length > 0) updateActiveTab({ headers: h })
                if (parsed.body) updateActiveTab({ body: parsed.body })
                setShowCurlImport(false)
              }}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-accent hover:bg-accent-light text-foreground transition-colors">
                导入
              </button>
            </div>
          </div>
        </div>, document.body)}

      {/* 确认对话框 */}
      {confirmDialog && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={() => setConfirmDialog(null)}>
          <div className="bg-surface-light border border-border/10 rounded-2xl p-6 w-80 shadow-2xl animate-zoom-in"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle size={18} className="text-warning" />
              <h3 className="text-sm font-semibold">确认操作</h3>
            </div>
            <p className="text-sm text-muted mb-6">{confirmDialog.message}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-hover/5 hover:bg-hover/10 text-muted transition-colors">
                取消
              </button>
              <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null) }}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-danger/20 hover:bg-danger/30 text-danger transition-colors">
                删除
              </button>
            </div>
          </div>
        </div>, document.body)}

      {/* 保存飞入动画 */}
      {flyAnim && createPortal(
        <FlyToTarget key={flyAnim.startX + flyAnim.startY} {...flyAnim} />, document.body)}
      {/* 分组选择弹窗 (Ctrl+保存/更新) */}
      {showSavePicker && createPortal(
        <GroupPickerModal
          collections={collections}
          newGroupName={newGroupName}
          onNewGroupNameChange={setNewGroupName}
          onSelect={(collId) => saveToGroup(collId)}
          onClose={() => { setShowSavePicker(false); setNewGroupName('') }}
          persistCollections={persistCollections}
          setCollections={setCollections}
        />, document.body)}
    </div>
  )
}
