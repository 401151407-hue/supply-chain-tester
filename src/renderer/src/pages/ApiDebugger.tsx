import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Send, Loader2, Clock, Plus, Trash2, Copy, ChevronDown, Save, Bookmark, X, FolderPlus, Folder, ChevronRight, Variable, Search, Sparkles, CheckCircle2, Eye, Code2, FileCode, Upload, Gauge, Zap, AlertCircle } from 'lucide-react'
import { useAppStore } from '../store'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { defaultKeymap } from '@codemirror/commands'

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const
type TabKey = 'params' | 'headers' | 'body'

interface HeaderRow { id: number; key: string; value: string }
interface HistoryItem { method: string; url: string; status?: number; duration?: number; time: string }

interface SavedRequest {
  id: string; name: string; method: string; url: string
  headers: { key: string; value: string }[]; params: { key: string; value: string }[]
  body: string; createdAt: string
}
interface Collection {
  id: string; name: string; items: SavedRequest[]
}

interface VarItem { id: string; key: string; value: string; comment: string }

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

/** 替换字符串中的 {{变量}} */
function interpolate(str: string, vars: VarItem[]): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    const v = vars.find(v => v.key === name)
    return v ? v.value : `{{${name}}}`
  })
}

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

export function ApiDebugger() {
  const { env } = useAppStore()
  const [method, setMethod] = useState<string>('GET')
  const [protocol, setProtocol] = useState<string>('https://')
  const [url, setUrl] = useState('')
  const [headers, setHeaders] = useState<HeaderRow[]>([{ id: 1, key: '', value: '' }])
  const [params, setParams] = useState<HeaderRow[]>([{ id: 1, key: '', value: '' }])
  const [body, setBody] = useState('')
  const bodyContentRef = useRef('')  // 实时同步最新 body，绕过 React 状态延迟
  const [activeTab, setActiveTab] = useState<TabKey>('params')
  const [isSending, setIsSending] = useState(false)

  const [response, setResponse] = useState<{
    status?: number; statusText?: string; headers?: Record<string,string>
    body?: string; duration?: number; error?: string
  } | null>(null)
  const [responseFormatted, setResponseFormatted] = useState(false)
  const [responseTab, setResponseTab] = useState<'body' | 'headers' | 'cookies' | 'request'>('body')
  const [sentRequest, setSentRequest] = useState<{
    method: string; url: string; headers: Record<string, string>; body?: string
  } | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])

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
      const baseWithProtocol = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : protocol + trimmedUrl
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
    setEnvVars(envVars.filter(v => v.id !== id))
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
  const [editingRequest, setEditingRequest] = useState<{ collId: string; reqId: string } | null>(null)
  const [flashReqId, setFlashReqId] = useState<string | null>(null)
  const [saveTargetId, setSaveTargetId] = useState<string>('')
  const [saveName, setSaveName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function handleSend() {
    if (!url.trim() || isSending) return
    setIsSending(true)
    setResponse(null)

    const reqHeaders: Record<string, string> = {}
    for (const h of headers) {
      if (h.key.trim()) reqHeaders[h.key.trim()] = h.value
    }

    try {
      const api = (window as any).supplyChainTester
      const trimmedUrl = url.trim()
      // 构建完整 URL：基础路径 + Query Params（忽略 URL 中已有的 ?query）
      const baseWithProtocol = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : protocol + trimmedUrl
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

  // 保存当前请求到分组（新增或更新）
  function handleSave() {
    if (!url.trim()) return
    const cleanParams = params.filter(p => p.key.trim()).map(p => ({ key: p.key.trim(), value: p.value }))
    const cleanHeaders = headers.filter(h => h.key.trim()).map(h => ({ key: h.key.trim(), value: h.value }))
    if (editingRequest) {
      // 更新已有接口
      const updated = collections.map(c => c.id === editingRequest.collId ? {
        ...c,
        items: c.items.map(i => i.id === editingRequest.reqId ? {
          ...i,
          method, url: url.trim(),
          headers: cleanHeaders, params: cleanParams,
          body,
        } : i),
      } : c)
      setCollections(updated)
      persistCollections(updated)
      // 闪一下被更新的接口
      setFlashReqId(editingRequest.reqId)
      setTimeout(() => setFlashReqId(null), 700)
    } else if (saveName.trim() && saveTargetId) {
      // 新增接口
      const item: SavedRequest = {
        id: Date.now().toString(), name: saveName.trim(),
        method, url: url.trim(),
        headers: cleanHeaders, params: cleanParams,
        body, createdAt: new Date().toISOString(),
      }
      const updated = collections.map(c =>
        c.id === saveTargetId ? { ...c, items: [...c.items, item] } : c
      )
      setCollections(updated)
      persistCollections(updated)
      setSaveName(''); setSaveTargetId('')
      setEditingRequest(null)
    }
    setShowSaveInput(false)
  }

  // 新建请求时清除编辑状态
  function startNewRequest() {
    setEditingRequest(null)
    setMethod('POST')
    setUrl('')
    setParams([{ id: 1, key: '', value: '' }])
    setHeaders([{ id: 1, key: '', value: '' }])
    setBody('')
    setResponse(null)
  }

  function loadRequest(req: SavedRequest, collId: string) {
    setMethod(req.method); setUrl(req.url)
    setParams(req.params && req.params.length > 0
      ? req.params.map((p, i) => ({ id: i + 1, key: p.key, value: p.value }))
      : [{ id: 1, key: '', value: '' }])
    setHeaders(req.headers.length > 0
      ? req.headers.map((h, i) => ({ id: i + 1, key: h.key, value: h.value }))
      : [{ id: 1, key: '', value: '' }])
    setBody(req.body); setResponse(null)
    bodyContentRef.current = req.body  // 立即同步 ref，避免 CodeMirror 异步延迟
    setEditingRequest({ collId, reqId: req.id })
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
      headers: [], params: [], body: '',
      createdAt: new Date().toISOString(),
    }
    const updated = collections.map(c =>
      c.id === collId ? { ...c, items: [...c.items, item] } : c
    )
    setCollections(updated)
    persistCollections(updated)
    setExpandedId(collId)
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

  // 格式化响应体
  const formattedBody = useMemo(() => {
    if (!response?.body) return ''
    if (responseFormatted) {
      try { return JSON.stringify(JSON.parse(response.body), null, 2) } catch { return response.body }
    }
    return response.body
  }, [response?.body, responseFormatted])

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
        <button onClick={openVarsModal}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
            ${showVars || envVars.length > 0 ? 'bg-accent/20 text-accent-light' : 'bg-hover/5 text-muted hover:bg-hover/10 hover:text-foreground'}`}>
          <Variable size={13} />
          变量 ({envVars.length})
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden animate-fade-in" key={editingRequest?.reqId ?? 'new'}>
          {/* 请求栏 */}
          <div className="px-4 py-3 border-b border-border/5 bg-surface-light/20 shrink-0 space-y-2">
        <div className="flex gap-2">
          {/* Method */}
          <div className="relative">
            <select
              value={method}
              onChange={e => setMethod(e.target.value)}
              className={`h-9 rounded-l-lg pl-3 pr-7 text-xs font-bold outline-none
                         border border-border/5 focus:border-accent/50
                         appearance-none cursor-pointer
                         ${method === 'GET' ? 'bg-success/10 text-success' :
                           method === 'POST' ? 'bg-warning/10 text-warning' :
                           method === 'PUT' ? 'bg-blue-500/10 text-blue-400' :
                           method === 'DELETE' ? 'bg-danger/10 text-danger' :
                           'bg-accent/10 text-accent-light'}`}
            >
              {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          </div>
          {/* URL */}
          <div className="relative flex items-center flex-1">
            <select
              value={protocol}
              onChange={e => setProtocol(e.target.value)}
              className="h-9 pl-3 pr-6 text-xs font-mono outline-none
                         bg-surface border-y border-l border-border/5 focus:border-accent/50
                         appearance-none cursor-pointer text-muted shrink-0"
            >
              <option value="https://">https://</option>
              <option value="http://">http://</option>
            </select>
            <ChevronDown size={10} className="absolute left-[76px] top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              onBlur={e => syncUrlToParams(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="api.example.com/endpoint"
              className="flex-1 h-9 rounded-r-lg px-3 text-sm font-mono outline-none
                         bg-surface border border-border/5 focus:border-accent/50 transition-colors
                         placeholder:text-muted/30"
            />
          </div>
          {/* Send */}
          <button
            onClick={handleSend}
            disabled={isSending || !url.trim()}
            className="flex items-center gap-1.5 px-5 h-9 rounded-lg text-sm font-semibold
                       bg-accent hover:bg-accent-light text-foreground
                       disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            发送
          </button>
          {/* Save */}
          {editingRequest ? (
            <button onClick={handleSave}
              className="flex items-center gap-1.5 px-4 h-9 rounded-lg text-sm font-medium
                         bg-success/20 hover:bg-success/30 text-success transition-all active:scale-90">
              <Save size={14} />
              更新
            </button>
          ) : showSaveInput ? (
            <div className="flex items-center gap-1">
              <select
                value={saveTargetId}
                onChange={e => setSaveTargetId(e.target.value)}
                className="h-9 rounded-lg px-2 text-xs outline-none bg-surface border border-border/5 focus:border-accent/50"
              >
                <option value="">选择分组...</option>
                {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setShowSaveInput(false); setSaveName(''); setSaveTargetId('') } }}
                placeholder="接口名称"
                className="w-28 h-9 rounded-lg px-2 text-xs outline-none bg-surface border border-border/5 focus:border-accent/50"
                autoFocus
              />
              <button onClick={handleSave} disabled={!saveName.trim() || !saveTargetId}
                className="p-2 rounded-lg bg-accent/20 hover:bg-accent/30 text-accent-light disabled:opacity-30">
                <Save size={14} />
              </button>
              <button onClick={() => { setShowSaveInput(false); setSaveName(''); setSaveTargetId('') }}
                className="p-2 rounded-lg hover:bg-hover/10 text-muted">
                <X size={14} />
              </button>
            </div>
          ) : (
            <button onClick={() => setShowSaveInput(true)}
              className="flex items-center gap-1.5 px-4 h-9 rounded-lg text-sm font-medium
                         bg-hover/5 hover:bg-hover/10 text-muted hover:text-foreground
                         transition-all">
              <Save size={14} />
              保存
            </button>
          )}
        </div>

        {/* 变量弹窗 */}
        {showVars && (
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
                  <div key={v.id} className="flex items-center gap-2">
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
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-muted hover:text-red-400 shrink-0"><Trash2 size={12} /></button>
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
          </div>
        )}
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

      {/* Tabs: Headers / Body */}
          {/* Tab bar */}
          <div className="flex border-b border-border/5 px-4 bg-surface-light/10">
            {(['params', 'headers', 'body'] as TabKey[]).map(t => (
              <button key={t}
                onClick={() => setActiveTab(t)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors
                  ${activeTab === t ? 'border-accent text-accent-light' : 'border-transparent text-muted hover:text-foreground'}`}
              >
                {t === 'params' ? 'Params' : t === 'headers' ? 'Headers' : 'Body'}
                {t === 'params' && params.filter(p => p.key.trim()).length > 0 && (
                  <span className="ml-1 text-[10px] text-accent-light">({params.filter(p => p.key.trim()).length})</span>
                )}
              </button>
            ))}
          </div>

          {/* Params 编辑 */}
          {activeTab === 'params' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-muted uppercase tracking-wider">Query Params</span>
                <span className="text-[10px] text-muted">URL 自动同步</span>
              </div>
              {params.map(p => (
                <div key={p.id} className="flex gap-1 items-center">
                  <input
                    value={p.key} onChange={e => updateParam(p.id, 'key', e.target.value)}
                    placeholder="Key"
                    className="w-48 rounded px-2 py-1 text-xs font-mono outline-none
                               bg-surface border border-border/5 focus:border-accent/50"
                  />
                  <input
                    value={p.value} onChange={e => updateParam(p.id, 'value', e.target.value)}
                    placeholder="Value"
                    className="flex-1 rounded px-2 py-1 text-xs font-mono outline-none
                               bg-surface border border-border/5 focus:border-accent/50"
                  />
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

          {/* Headers 编辑 */}
          {activeTab === 'headers' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {headers.map(h => (
                <div key={h.id} className="flex gap-1 items-center">
                  <input
                    value={h.key} onChange={e => updateHeader(h.id, 'key', e.target.value)}
                    placeholder="Key"
                    className="w-48 rounded px-2 py-1 text-xs font-mono outline-none
                               bg-surface border border-border/5 focus:border-accent/50"
                  />
                  <input
                    value={h.value} onChange={e => updateHeader(h.id, 'value', e.target.value)}
                    placeholder="Value"
                    className="flex-1 rounded px-2 py-1 text-xs font-mono outline-none
                               bg-surface border border-border/5 focus:border-accent/50"
                  />
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

          {/* Body 编辑 */}
          {activeTab === 'body' && (
            <div className="flex-1 flex flex-col overflow-hidden p-3">
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

          {/* ── 响应区 (Postman 风格) ── */}
          <div className="border-t border-border/5 flex flex-col shrink-0" style={{ height: '42%' }}>
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
                  onClick={() => setResponseTab(t)}
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
              {/* Body 子模式切换 (Pretty / Raw) */}
              {responseTab === 'body' && response?.body && (
                <div className="flex items-center gap-1 ml-auto">
                  <button
                    onClick={() => setResponseFormatted(true)}
                    className={`px-2 py-1 rounded text-[10px] transition-colors
                      ${responseFormatted ? 'bg-accent/20 text-accent-light' : 'text-muted hover:text-foreground hover:bg-hover/10'}`}
                  >
                    Pretty
                  </button>
                  <button
                    onClick={() => setResponseFormatted(false)}
                    className={`px-2 py-1 rounded text-[10px] transition-colors
                      ${!responseFormatted ? 'bg-accent/20 text-accent-light' : 'text-muted hover:text-foreground hover:bg-hover/10'}`}
                  >
                    Raw
                  </button>
                </div>
              )}
            </div>

            {/* 响应内容区 */}
            <div className="flex-1 overflow-hidden">
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

        {/* 右侧：分组 + 历史 */}
        <aside className="w-56 border-l border-border/5 bg-surface-light/10 overflow-y-auto shrink-0">
          {/* 分组 */}
          <div className="px-3 py-2 text-[10px] text-muted uppercase tracking-wider flex items-center justify-between">
            接口分组
            <button onClick={() => setShowNewGroup(true)}
              className="p-0.5 rounded hover:bg-hover/10 text-muted hover:text-foreground transition-all duration-200" title="新建分组">
              <FolderPlus size={12} />
            </button>
          </div>
          {showNewGroup && (
            <div className="px-3 pb-2 flex gap-1 animate-fade-in">
              <input
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createCollection(); if (e.key === 'Escape') setShowNewGroup(false) }}
                placeholder="分组名称"
                className="flex-1 rounded px-2 py-1 text-xs outline-none bg-surface border border-border/5 focus:border-accent/50 transition-all duration-200"
                autoFocus
              />
              <button onClick={createCollection} disabled={!newGroupName.trim()}
                className="p-1 rounded bg-accent/20 text-accent-light disabled:opacity-30 transition-all duration-200">
                <Plus size={12} />
              </button>
            </div>
          )}
          {collections.length === 0 ? (
            <p className="px-3 text-xs text-muted mb-2 animate-fade-in">点击 📁+ 新建分组</p>
          ) : (
            collections.map(c => (
              <div key={c.id} className="border-b border-border/5 last:border-0">
                <button onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-hover/5 text-left group transition-colors duration-150">
                  <span className={`transition-transform duration-200 ${expandedId === c.id ? 'rotate-0' : ''}`}>
                    {expandedId === c.id ? <ChevronDown size={10} className="text-muted" /> : <ChevronRight size={10} className="text-muted" />}
                  </span>
                  <Folder size={12} className="text-warning" />
                  <span className="text-[11px] text-foreground flex-1">{c.name}</span>
                  <span className="text-[10px] text-muted">{c.items.length}</span>
                  <button onClick={(e) => { e.stopPropagation(); addToCollection(c.id) }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-accent/20 text-muted hover:text-accent-light transition-all duration-200" title="新建接口">
                    <Plus size={10} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); if (confirm('删除整个分组？')) deleteCollection(c.id) }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/20 text-muted hover:text-red-400 transition-all duration-200">
                    <Trash2 size={10} />
                  </button>
                </button>
                <div className={`overflow-hidden transition-all duration-300 ease-out ${expandedId === c.id ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
                  {c.items.map((req, i) => (
                    <button key={req.id}
                      onClick={() => loadRequest(req, c.id)}
                      className={`w-full text-left pl-8 pr-2 py-1.5 hover:bg-hover/5 group/item transition-colors duration-150 ${flashReqId === req.id ? 'animate-flash' : ''}`}
                      style={{ animationDelay: `${flashReqId === req.id ? 0 : i * 40}ms` }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-mono font-bold
                          ${req.method === 'GET' ? 'text-success' : req.method === 'POST' ? 'text-warning' :
                            req.method === 'DELETE' ? 'text-danger' : 'text-accent-light'}`}>
                          {req.method}
                        </span>
                        <span className="text-[11px] text-foreground truncate flex-1">{req.name}</span>
                        <button onClick={(e) => { e.stopPropagation(); deleteRequest(c.id, req.id) }}
                          className="opacity-0 group-hover/item:opacity-100 p-0.5 rounded hover:bg-red-500/20 text-muted hover:text-red-400 transition-all duration-200">
                          <Trash2 size={10} />
                        </button>
                      </div>
                      <p className="text-[10px] text-muted truncate">{req.url}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}

          {/* 历史记录 */}
          <div className="px-3 py-2 text-[10px] text-muted uppercase tracking-wider border-t border-border/5 mt-1">请求历史</div>
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
        </aside>
      </div>
    </div>
  )
}
