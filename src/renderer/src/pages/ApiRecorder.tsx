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
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const api = getApi()
    if (!api?.onApiRecorderEvent) return
    const unsub = api.onApiRecorderEvent((step: any) => {
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
    const result = await api.apirecorderStart(urlInput)
    if (result.ok) {
      setIsCapturing(true)
      setStatusMsg('🟢 捕获中 — 请在浏览器中操作，API 调用会自动记录')
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
    if (steps.length > 0 && !confirm('确定清空所有步骤？')) return
    setSteps([]); setSelectedStep(null)
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

  function generatePythonCode(): string {
    const apiSteps = steps.filter(s => s.type === 'api')
    let code = '# -*- coding: utf-8 -*-\n'
    code += `# ${exportFilename || 'API 测试脚本'}\n`
    code += `# 录制时间: ${new Date().toLocaleString('zh-CN')}\n`
    code += `# API 调用数: ${apiSteps.length}\n`
    code += 'import requests\n\n'

    for (let i = 0; i < apiSteps.length; i++) {
      const s = apiSteps[i]
      const method = (s.apiMethod || 'GET').toLowerCase()
      const shortUrl = (s.apiUrl || '').replace(/^https?:\/\/[^\/]+/, '')
      code += `# ${i + 1}. ${s.description}\n`

      // headers
      const headers = s.apiHeaders || {}
      const safeHeaders: Record<string, string> = {}
      for (const [k, v] of Object.entries(headers)) {
        if (!['cookie', 'authorization', 'host', 'content-length', 'origin', 'referer'].includes(k.toLowerCase())) {
          safeHeaders[k] = v || ''
        }
      }
      const headersStr = '{\n    ' + Object.entries(safeHeaders).map(([k, v]) => `'${k}': '${v.replace(/'/g, "\\'")}'`).join(',\n    ') + '\n}'

      if (method === 'get' || method === 'delete') {
        code += `resp = requests.${method}('${(s.apiUrl || '').replace(/'/g, "\\'")}', headers=${headersStr})\n`
      } else {
        let jsonParam = ''
        if (s.apiBody) {
          try {
            const parsed = JSON.parse(s.apiBody)
            jsonParam = `json=${JSON.stringify(parsed)}`
          } catch {
            jsonParam = `data='''${(s.apiBody || '').replace(/'/g, "\\'")}'''`
          }
        }
        code += `resp = requests.${method}('${(s.apiUrl || '').replace(/'/g, "\\'")}', headers=${headersStr}${jsonParam ? ', ' + jsonParam : ''})\n`
      }
      code += `print(f'${method.toUpperCase()} ${shortUrl} -> {resp.status_code}')\n`
      if (s.apiStatus && s.apiStatus < 400) {
        code += `assert resp.status_code == ${s.apiStatus}\n`
      }
      code += '\n'
    }
    code += 'print(\'✅ API 测试完成\')\n'
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
  const apiSteps = steps.filter(s => s.type === 'api')

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
            <span className="text-[10px] text-muted">API 调用列表</span>
            <span className="text-[10px] text-muted">{apiSteps.length} 个接口</span>
          </div>
          {steps.length === 0 ? (
            <p className="text-xs text-muted text-center py-8">
              {isCapturing ? '等待 API 请求...' : '输入地址 → 开始捕获 → 在浏览器中操作'}
            </p>
          ) : (
            steps.map((step, idx) => (
              <div key={step.id} onClick={() => setSelectedStep(step.id)}
                className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors
                  ${selectedStep === step.id ? 'bg-accent/20 text-foreground' : 'hover:bg-hover/5 text-muted hover:text-foreground'}`}>
                <span className="text-[10px] w-5 text-center opacity-50">{idx + 1}</span>
                {step.type === 'api' ? (
                  <>
                    <Wifi size={13} className="opacity-60" />
                    {step.apiMethod && (
                      <span className={`text-[10px] font-mono font-bold ${HTTP_METHOD_COLORS[step.apiMethod] || 'text-muted'}`}>{step.apiMethod}</span>
                    )}
                    <span className="flex-1 truncate">{step.description}</span>
                    {step.apiStatus != null && (
                      <span className={`text-[10px] ${step.apiStatus < 400 ? 'text-green-400' : 'text-red-400'}`}>{step.apiStatus}</span>
                    )}
                  </>
                ) : (
                  <>
                    <Globe size={13} className="opacity-60" />
                    <span className="flex-1 truncate">{step.description}</span>
                  </>
                )}
                <div className="hidden group-hover:flex items-center gap-0.5">
                  <button onClick={e => { e.stopPropagation(); moveStep(step.id, -1) }} disabled={idx === 0}
                    className="p-0.5 hover:text-foreground disabled:opacity-20"><ChevronUp size={12} /></button>
                  <button onClick={e => { e.stopPropagation(); moveStep(step.id, 1) }} disabled={idx === steps.length - 1}
                    className="p-0.5 hover:text-foreground disabled:opacity-20"><ChevronDown size={12} /></button>
                  <button onClick={e => { e.stopPropagation(); deleteStep(step.id) }}
                    className="p-0.5 text-red-400 hover:text-red-300"><Trash2 size={12} /></button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-2 border-t border-border/10 flex gap-1">
          <button onClick={saveSession} disabled={steps.length === 0 || isSaving}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-accent/20 text-accent hover:bg-accent/30 rounded-md transition-colors disabled:opacity-30">
            <Save size={13} /> {isSaving ? '...' : '保存'}
          </button>
          <button onClick={() => setShowSessions(!showSessions)}
            className="flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-hover/5 hover:bg-hover/10 text-muted hover:text-foreground rounded-md transition-colors">
            <FolderOpen size={13} />
          </button>
          <button onClick={openExportDialog} disabled={steps.length === 0}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-hover/5 hover:bg-hover/10 text-muted hover:text-foreground rounded-md transition-colors disabled:opacity-30">
            <Download size={13} /> Py
          </button>
          <button onClick={clearSteps}
            className="flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-hover/5 hover:bg-hover/10 text-muted hover:text-red-400 rounded-md transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {showSessions && (
          <div className="border-b border-border/10 p-3 max-h-48 overflow-y-auto">
            <h3 className="text-xs font-medium text-muted mb-2">已保存的会话</h3>
            {sessions.length === 0 ? <p className="text-xs text-muted">暂无</p> : sessions.map(s => (
              <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-hover/5 group">
                <button onClick={() => loadSession(s)} className="flex-1 text-left text-xs truncate text-muted hover:text-foreground">
                  {s.name} <span className="opacity-40">({s.steps.length} 步)</span>
                </button>
                <button onClick={() => deleteSession(s.id)} className="hidden group-hover:block p-0.5 text-red-400 hover:text-red-300"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}

        {selectedStepData?.type === 'api' && selectedStepData.apiMethod && (
          <div className="border-b border-border/10 p-3">
            <h3 className="text-xs font-medium text-muted mb-2">API 详情</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-mono font-bold ${HTTP_METHOD_COLORS[selectedStepData.apiMethod] || ''}`}>{selectedStepData.apiMethod}</span>
                <span className="text-[11px] text-muted truncate">{selectedStepData.apiUrl || ''}</span>
              </div>
              {selectedStepData.apiStatus != null && (
                <div className="text-[11px]">
                  状态: <span className={selectedStepData.apiStatus < 400 ? 'text-green-400' : 'text-red-400'}>{selectedStepData.apiStatus}</span>
                </div>
              )}
              {selectedStepData.apiHeaders && Object.keys(selectedStepData.apiHeaders).length > 0 && (
                <div>
                  <label className="text-[10px] text-muted block">请求头</label>
                  <pre className="text-[10px] bg-background rounded p-1.5 mt-0.5 max-h-24 overflow-y-auto font-mono whitespace-pre-wrap">
                    {Object.entries(selectedStepData.apiHeaders).map(([k, v]) => `${k}: ${v}`).join('\n')}
                  </pre>
                </div>
              )}
              {selectedStepData.apiBody && (
                <div>
                  <label className="text-[10px] text-muted block">请求体</label>
                  <pre className="text-[10px] bg-background rounded p-1.5 mt-0.5 max-h-32 overflow-y-auto font-mono whitespace-pre-wrap">{selectedStepData.apiBody}</pre>
                </div>
              )}
              {selectedStepData.apiResponse && (
                <div>
                  <label className="text-[10px] text-muted block">响应体</label>
                  <pre className="text-[10px] bg-background rounded p-1.5 mt-0.5 max-h-48 overflow-y-auto font-mono whitespace-pre-wrap">{selectedStepData.apiResponse}</pre>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 bg-background flex items-center justify-center p-4 overflow-hidden">
          <div className="text-center text-muted">
            <Wifi size={48} className="mx-auto mb-2 opacity-20" />
            <p className="text-sm">{isCapturing ? '🟢 正在监听 API 请求...' : '开始捕获后在浏览器中操作，API 自动记录'}</p>
          </div>
        </div>
      </div>

      {/* 导出对话框 */}
      {showExportDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowExportDialog(false)}>
          <div className="bg-surface-light border border-border/20 rounded-xl p-5 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium">导出 API 脚本</h3>
              <button onClick={() => setShowExportDialog(false)} className="p-1 hover:bg-hover/10 rounded"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-muted block mb-1">保存到产品线</label>
                <select value={exportProduct} onChange={e => setExportProduct(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-background border border-border/20 rounded-lg">
                  <option value="common">common</option>
                  <option value="信e融">信e融</option>
                  <option value="订e融">订e融</option>
                  <option value="货e融">货e融</option>
                  <option value="账e融">账e融</option>
                  <option value="票e融">票e融</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-muted block mb-1">文件名</label>
                <div className="flex items-center gap-1">
                  <input type="text" value={exportFilename} onChange={e => setExportFilename(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs bg-background border border-border/20 rounded-lg" />
                  <span className="text-xs text-muted">.py</span>
                </div>
              </div>
              <div className="bg-background border border-border/10 rounded-lg p-3 max-h-40 overflow-y-auto">
                <pre className="text-[10px] text-muted font-mono whitespace-pre-wrap">{generatePythonCode().slice(0, 400)}...</pre>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowExportDialog(false)} className="flex-1 px-3 py-2 text-xs border border-border/20 rounded-lg hover:bg-hover/5">取消</button>
              <button onClick={exportAndSave} className="flex-1 px-3 py-2 text-xs bg-accent/20 text-accent hover:bg-accent/30 rounded-lg font-medium">保存脚本</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
