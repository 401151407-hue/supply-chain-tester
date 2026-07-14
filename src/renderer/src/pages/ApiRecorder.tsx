import React, { useState, useEffect, useRef } from 'react'
import {
  Play, Square, Trash2, Save, FolderOpen,
  ChevronUp, ChevronDown, Download, X, Wifi,
  Globe, Clock, Camera, ArrowDown,
} from 'lucide-react'

interface RecordStep {
  id: string
  type: string
  selector?: string
  value?: string
  url?: string
  description: string
  timestamp: number
  apiMethod?: string
  apiUrl?: string
  apiHeaders?: Record<string, string>
  apiBody?: string
  apiStatus?: number
  apiResponse?: string
}

interface RecordSession {
  id: string
  name: string
  steps: RecordStep[]
  createdAt: string
  updatedAt: string
}

const HTTP_METHOD_COLORS: Record<string, string> = {
  GET: 'text-green-400', POST: 'text-amber-400', PUT: 'text-blue-400',
  DELETE: 'text-red-400', PATCH: 'text-purple-400',
}

let stepIdCounter = 0
function genId(): string { return `api_${Date.now()}_${++stepIdCounter}` }

export function ApiRecorder() {
  const getApi = () => (window as any).supplyChainTester
  const [isCapturing, setIsCapturing] = useState(false)
  const [steps, setSteps] = useState<RecordStep[]>([])
  const [urlInput, setUrlInput] = useState('https://')
  const [selectedStep, setSelectedStep] = useState<string | null>(null)
  const [sessions, setSessions] = useState<RecordSession[]>([])
  const [sessionName, setSessionName] = useState('')
  const [showSessions, setShowSessions] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [exportProduct, setExportProduct] = useState('common')
  const [exportFilename, setExportFilename] = useState('')
  const [captureMode, setCaptureMode] = useState<'network' | 'console'>('network')
  const [showTraceExport, setShowTraceExport] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [isUndoing, setIsUndoing] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const lastClearedRef = useRef<RecordStep[]>([])
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const api = getApi()
    if (!api?.onApiRecorderEvent) return
    const unsub = api.onApiRecorderEvent((step: any) => {
      if (step.type === 'recording_stopped') {
        setIsCapturing(false)
        setStatusMsg('浏览器已关闭，捕获已停止')
        return
      }
      if (step.type === 'api' && step.apiMethod) {
        const newStep: RecordStep = {
          id: genId(),
          type: 'api',
          description: `${step.apiMethod} ${(step.apiUrl || '').replace(/^https?:\/\/[^\/]+/, '')}`,
          timestamp: Date.now(),
          apiMethod: step.apiMethod,
          apiUrl: step.apiUrl,
          apiHeaders: step.apiHeaders,
          apiBody: step.apiBody,
          apiStatus: step.apiStatus,
          apiResponse: step.apiResponse,
          traceId: step.traceId || undefined,
        }
        setSteps(prev => [...prev, newStep])
      } else if (step.type === 'navigate') {
        setSteps(prev => [...prev, { id: genId(), type: 'navigate', url: step.url, description: step.description || `打开 ${step.url}`, timestamp: Date.now() }])
      }
    })
    return () => { if (unsub) unsub() }
  }, [])

  useEffect(() => { loadSessions() }, [])

  async function loadSessions() {
    const api = getApi()
    if (!api?.recorderLoadSessions) return
    try { const list = await api.recorderLoadSessions(); setSessions(list || []) } catch {}
  }

  async function startCapture() {
    const api = getApi()
    if (!api?.apirecorderStart) { setStatusMsg('API 录制不可用，请重启应用'); return }
    setSteps([])
    setStatusMsg('正在启动浏览器...')
    const result = await api.apirecorderStart(urlInput, captureMode)
    if (result.ok) {
      setIsCapturing(true)
      setStatusMsg(`🟢 捕获中 [${captureMode === 'console' ? 'Console' : 'Network'}]`)
    } else {
      setStatusMsg(`启动失败: ${result.error || '未知错误'}`)
    }
  }

  async function stopCapture() {
    const api = getApi()
    if (api?.apirecorderStop) await api.apirecorderStop()
    setIsCapturing(false)
    setStatusMsg('捕获已停止')
  }

  function deleteStep(id: string) {
    setSteps(prev => prev.filter(s => s.id !== id))
    if (selectedStep === id) setSelectedStep(null)
  }

  function moveStep(id: string, dir: -1 | 1) {
    setSteps(prev => {
      const idx = prev.findIndex(s => s.id === id)
      if (idx < 0) return prev
      const newIdx = idx + dir
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const arr = [...prev]
      ;[arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]]
      return arr
    })
  }

  function clearSteps() {
    if (steps.length === 0) return
    lastClearedRef.current = [...steps]
    setCanUndo(true)
    setIsClearing(true)
    setTimeout(() => {
      setSteps([]); setSelectedStep(null); setIsClearing(false)
    }, 300)
  }

  function undoClear() {
    if (lastClearedRef.current.length === 0) return
    setSteps(lastClearedRef.current)
    lastClearedRef.current = []
    setCanUndo(false)
    setIsUndoing(true)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsUndoing(false)
        setStatusMsg('✅ 已撤销清空')
      })
    })
  }

  async function saveSession() {
    if (steps.length === 0) { setStatusMsg('⚠️ 没有可保存的步骤'); return }
    const api = getApi()
    if (!api?.recorderSaveSession) { setStatusMsg('❌ 保存功能不可用'); return }
    setIsSaving(true)
    try {
      const name = sessionName.trim() || `API会话 ${new Date().toLocaleString('zh-CN')}`
      const session = { id: Date.now().toString(36), name, steps, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      const result = await api.recorderSaveSession(session)
      if (result.ok) { setStatusMsg('✅ 已保存'); setSessionName(''); await loadSessions() }
      else { setStatusMsg(`保存失败: ${result.error}`) }
    } catch (err: any) { setStatusMsg(`保存异常: ${err.message}`) }
    finally { setIsSaving(false) }
  }

  function loadSession(session: RecordSession) {
    setSteps(session.steps); setSessionName(session.name); setShowSessions(false)
    setStatusMsg(`已加载: ${session.name}`)
  }

  async function deleteSession(id: string) {
    const api = getApi()
    if (!api?.recorderDeleteSession) return
    try { await api.recorderDeleteSession(id) } catch {}
    loadSessions()
  }

  function tryFormatJson(raw: string): string {
    try { return JSON.stringify(JSON.parse(raw), null, 2) } catch { return raw }
  }

  function formatPythonDict(obj: any, indent = 0): string {
    if (obj === null || obj === undefined) return 'None'
    if (typeof obj === 'string') return `'${obj.replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`
    if (typeof obj === 'number') return String(obj)
    if (typeof obj === 'boolean') return obj ? 'True' : 'False'
    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]'
      return '[\n' + obj.map((item: any) => ' '.repeat(indent + 4) + formatPythonDict(item, indent + 4)).join(',\n') + '\n' + ' '.repeat(indent) + ']'
    }
    if (typeof obj === 'object') {
      const keys = Object.keys(obj)
      if (keys.length === 0) return '{}'
      return '{\n' + keys.map(k => ' '.repeat(indent + 4) + `'${k}': ${formatPythonDict(obj[k], indent + 4)}`).join(',\n') + '\n' + ' '.repeat(indent) + '}'
    }
    return String(obj)
  }

  function inferEnvConfigKey(url: string): string | null {
    let pathname = ''
    try { pathname = new URL(url).pathname } catch { pathname = url.startsWith('/') ? url.split('?')[0] : '' }
    if (!pathname) return null
    const seg = pathname.split('/').filter(Boolean)[0]?.replace(/-/g, '_') || ''
    const known = ['wxsbank_supplychain_web','wxsbank_scp_small_tool','wxsbank_supplychain_partner','wxsbank_supplychain_cmp','wxsbank_supplychain_adam']
    return known.includes(seg) ? seg : null
  }

  function generatePythonCode(): string {
    const apiSteps = steps.filter(s => s.type === 'api' && s.apiMethod && !['LOG', 'UNKNOWN'].includes(s.apiMethod))
    if (apiSteps.length === 0) return '# 无有效 API 步骤\n'

    let code = '# -*- coding: utf-8 -*-\n'
    code += `# ${exportFilename || 'API 测试脚本'}\n`
    code += `# 录制时间: ${new Date().toLocaleString('zh-CN')}\n`
    code += `# API 调用数: ${apiSteps.length}\n`
    code += `# traceId 数量: ${apiSteps.filter(s => s.traceId).length}\n\n`
    code += 'import sys\nimport time\nimport requests\n'
    code += 'from utils.environment import get_environment\n\n'
    code += 'env = sys.argv[1]\n'
    code += 'print(f\">>> {env}环境\")\n'
    code += 'env_config = get_environment(env)\n\n'
    code += 'step = 0\n\n'

    for (let i = 0; i < apiSteps.length; i++) {
      const s = apiSteps[i]
      const method = (s.apiMethod || 'GET').toUpperCase()
      if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) continue
      const path = (s.apiUrl || '').replace(/^https?:\/\/[^\/]+/, '')
      const envKey = inferEnvConfigKey(s.apiUrl || '')

      code += `# ${path}\n`
      if (s.traceId) {
        code += `# traceId: ${s.traceId}\n`
      }

      // URL
      if (envKey) {
        const prefix = '/' + envKey.replace(/_/g, '-') + '/'
        const rest = path.startsWith(prefix) ? path.slice(prefix.length - 1) : path
        code += `url = env_config.${envKey}+'${rest}'\n`
      } else {
        code += `url = '${(s.apiUrl || '').replace(/'/g, "\\'")}'\n`
      }

      // Body
      if (s.apiBody && method !== 'GET') {
        try {
          const parsed = JSON.parse(s.apiBody)
          if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
            code += `json = ${formatPythonDict(parsed)}\n`
          }
        } catch {}
      }

      // Request
      const m = method.toLowerCase()
      code += `a1 = requests.${m}(url,headers=headers`
      if (s.apiBody && method !== 'GET') {
        try { JSON.parse(s.apiBody); code += ',json=json' } catch {}
      }
      code += ')\n'
      code += 'b1 = a1.json()\n'
      code += `if b1['respCode'] == str(10000):\n`
      code += `    step += 1\n`
      code += `    print(f'[步骤{step}] ${path}成功')\n`
      code += 'else:\n'
      code += `    print('\\n'+'*'*100)\n`
      code += '    print(url)\n'
      code += '    print(b1)\n'
      code += `    print('*'*100+'\\n')\n`
      code += '    sys.exit()\n\n'
    }
    code += 'print(\'✅ 全部接口测试完成\')\n'
    return code
  }

  function openExportDialog() {
    if (steps.length === 0) { setStatusMsg('⚠️ 没有可导出的步骤'); return }
    setExportFilename(`API场景_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`)
    setShowExportDialog(true)
  }

  async function exportAndSave() {
    const api = getApi()
    const filename = (exportFilename.trim() || 'API场景') + '.py'
    const code = generatePythonCode()
    try { await navigator.clipboard.writeText(code) } catch {}
    if (!api?.writeFile) { setStatusMsg('❌ 文件写入功能不可用'); return }
    try {
      const result = await api.writeFile(`test-suites/${exportProduct}/${filename}`, code)
      if (result.ok) {
        setStatusMsg(`✅ 已保存到 test-suites/${exportProduct}/${filename}`)
        setShowExportDialog(false)
        if (api?.scanScripts) setTimeout(() => api.scanScripts(), 500)
      } else { setStatusMsg(`保存失败: ${result.error}`) }
    } catch (err: any) { setStatusMsg(`保存异常: ${err.message}`) }
  }

  const selectedStepData = steps.find(s => s.id === selectedStep)
  const apiSteps = steps.filter(s => s.type === 'api' && s.traceId)

  return (
    <div className="flex h-full">
      <div className="w-80 flex flex-col border-r border-border/10 bg-surface-light/30">
        <div className="p-3 border-b border-border/10 space-y-2">
          <div className="flex gap-1">
            <input type="text" value={urlInput} onChange={e => setUrlInput(e.target.value)}
              placeholder="输入 API 服务地址..."
              className="flex-1 px-2 py-1.5 text-xs bg-background border border-border/20 rounded-md focus:outline-none focus:border-accent/50"
              disabled={isCapturing} />
          </div>
          {/* 监听源切换 */}
          <div className="flex gap-0.5 p-0.5 bg-background rounded-md border border-border/10">
            <button onClick={() => setCaptureMode('network')} disabled={isCapturing}
              className={`flex-1 px-2 py-1 text-[11px] rounded transition-colors ${captureMode === 'network' ? 'bg-accent/20 text-accent font-medium' : 'text-muted hover:text-foreground'}`}>
              🌐 Network
            </button>
            <button onClick={() => setCaptureMode('console')} disabled={isCapturing}
              className={`flex-1 px-2 py-1 text-[11px] rounded transition-colors ${captureMode === 'console' ? 'bg-accent/20 text-accent font-medium' : 'text-muted hover:text-foreground'}`}>
              🖥 Console
            </button>
          </div>
          <div className="flex gap-1">
            {!isCapturing ? (
              <button onClick={startCapture}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-md transition-colors">
                <Wifi size={14} /> 开始捕获
              </button>
            ) : (
              <button onClick={stopCapture}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded-md transition-colors">
                <Square size={14} /> 停止捕获
              </button>
            )}
          </div>
        </div>

        {statusMsg && (
          <div className="px-3 py-1.5 text-xs text-muted border-b border-border/5 bg-hover/5">{statusMsg}</div>
        )}

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[10px] text-muted">API 调用列表 · {apiSteps.length} 个</span>
            <div className="flex items-center gap-0.5">
              <button onClick={undoClear} disabled={!canUndo}
                className="text-[10px] text-muted hover:text-accent disabled:opacity-30 px-1 py-0.5" title="撤销清空">
                ↩ 撤销
              </button>
              <button onClick={clearSteps} disabled={steps.length === 0}
                className="text-[10px] text-muted hover:text-red-400 disabled:opacity-30 px-1 py-0.5">
                🗑 清空
              </button>
            </div>
          </div>
          {steps.length === 0 ? (
            <p className="text-xs text-muted text-center py-8">
              {isCapturing ? '等待 API 请求...' : '输入地址 → 开始捕获 → 在浏览器中操作'}
            </p>
          ) : (
            <div className={`transition-all duration-300 ${isClearing ? 'opacity-0 -translate-y-2 scale-95 pointer-events-none' : isUndoing ? 'opacity-0 translate-y-2 scale-95' : 'opacity-100 translate-y-0 scale-100'}`}>
            {steps.filter(s => s.type === 'api' && s.traceId).map((step, idx) => (
              <div key={step.id}
                onClick={() => setSelectedStep(selectedStep === step.id ? null : step.id)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${selectedStep === step.id ? 'bg-accent/10 text-foreground' : 'text-muted hover:bg-hover/5'}`}>
                <span className="text-[10px] w-5 text-center opacity-50">{idx + 1}</span>
                <span className={`text-[10px] font-mono font-bold ${HTTP_METHOD_COLORS[step.apiMethod || ''] || 'text-muted'}`}>{step.apiMethod}</span>
                <span className="flex-1 truncate">{(step.apiUrl || '').replace(/^https?:\/\/[^\/]+/, '')}</span>
                <span className="text-[10px] text-accent font-mono select-all cursor-pointer" title={step.traceId}>{step.traceId!.slice(0, 16)}…</span>
              </div>
            ))}
            </div>
          )}
        </div>

        <div className="p-2 border-t border-border/10">
          <button onClick={() => setShowTraceExport(true)} disabled={steps.filter(s => s.type === 'api' && s.traceId).length === 0}
            className="w-full py-1.5 text-[11px] bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 rounded-md disabled:opacity-30">
            📤 导出traceId
          </button>
        </div>
      </div>

      {/* 右侧：接口详情 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedStepData ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">接口详情</h3>
              <button onClick={() => setSelectedStep(null)}
                className="p-1 rounded hover:bg-hover/10 text-muted hover:text-foreground">
                <X size={16} />
              </button>
            </div>

            {/* 基本信息 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${selectedStepData.apiMethod === 'POST' ? 'bg-amber-500/10 text-amber-400' : selectedStepData.apiMethod === 'GET' ? 'bg-green-500/10 text-green-400' : 'bg-hover/10 text-muted'}`}>
                  {selectedStepData.apiMethod || 'UNKNOWN'}
                </span>
                <span className="text-xs text-muted break-all">{selectedStepData.apiUrl || '-'}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted">
                <span>traceId:</span>
                <span className="text-accent font-mono select-all">{selectedStepData.traceId || '-'}</span>
              </div>
            </div>

            {/* 请求头 */}
            {selectedStepData.apiHeaders && Object.keys(selectedStepData.apiHeaders).length > 0 && (
              <details className="space-y-1" open>
                <summary className="text-xs font-medium text-muted cursor-pointer hover:text-foreground">请求头</summary>
                <pre className="text-[11px] bg-background border border-border/10 rounded-lg p-3 overflow-x-auto font-mono text-muted leading-relaxed">
                  {JSON.stringify(selectedStepData.apiHeaders, null, 2)}
                </pre>
              </details>
            )}

            {/* 请求体 */}
            {selectedStepData.apiBody && (
              <details className="space-y-1" open>
                <summary className="text-xs font-medium text-muted cursor-pointer hover:text-foreground">请求体</summary>
                <pre className="text-[11px] bg-background border border-border/10 rounded-lg p-3 overflow-x-auto font-mono text-muted leading-relaxed max-h-80 overflow-y-auto whitespace-pre-wrap">
                  {tryFormatJson(selectedStepData.apiBody)}
                </pre>
              </details>
            )}

            {/* 响应状态 */}
            {selectedStepData.apiStatus !== undefined && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted">状态码:</span>
                <span className={selectedStepData.apiStatus === 200 ? 'text-green-400' : 'text-red-400'}>
                  {selectedStepData.apiStatus}
                </span>
              </div>
            )}

            {/* 响应体 */}
            {selectedStepData.apiResponse && (
              <details className="space-y-1" open>
                <summary className="text-xs font-medium text-muted cursor-pointer hover:text-foreground">响应体</summary>
                <pre className="text-[11px] bg-background border border-border/10 rounded-lg p-3 overflow-x-auto font-mono text-muted leading-relaxed max-h-96 overflow-y-auto whitespace-pre-wrap">
                  {tryFormatJson(selectedStepData.apiResponse)}
                </pre>
              </details>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-muted">👈 点击左侧接口查看详情</p>
          </div>
        )}
      </div>

      {/* traceId 导出 */}
    {showTraceExport && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowTraceExport(false)}>
        <div className="bg-surface-light border border-border/20 rounded-xl p-5 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
          <h3 className="text-sm font-medium mb-3">📤 导出 traceId 清单</h3>
          <p className="text-xs text-muted mb-3">将导出 {steps.filter(s => s.type === 'api' && s.traceId).length} 个 traceId</p>
          <div className="flex gap-2">
            <button onClick={() => setShowTraceExport(false)} className="flex-1 px-3 py-2 text-xs border border-border/20 rounded-lg hover:bg-hover/5">取消</button>
            <button onClick={async () => {
              const list = steps.filter(s => s.type === 'api' && s.traceId).map(s => s.traceId!)
              const json = JSON.stringify({ exportedAt: new Date().toLocaleString('zh-CN'), count: list.length, traceIds: list }, null, 2)
              try { await navigator.clipboard.writeText(json) } catch {}
              const api = getApi()
              if (api?.writeFile) {
                const now = new Date(); const fn = `trace_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}.json`
                await api.writeFile(`test-suites/common/${fn}`, json)
                setStatusMsg(`✅ 已保存 common/${fn} (${list.length} 个 traceId)`)
                if (api?.scanScripts) setTimeout(() => api.scanScripts(), 500)
              } else { setStatusMsg('已复制到剪贴板') }
              setShowTraceExport(false)
            }} className="flex-1 px-3 py-2 text-xs bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded-lg font-medium">
              保存 traceId
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
  )
}
