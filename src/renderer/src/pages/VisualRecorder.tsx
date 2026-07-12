import React, { useState, useEffect, useRef } from 'react'
import {
  Play, Square, Video, Trash2, Save, FolderOpen,
  ChevronUp, ChevronDown, Globe, MousePointer, Type,
  Clock, Camera, ArrowDown, Hand, List, Download, X,
  Wifi,
} from 'lucide-react'

interface RecordStep {
  id: string
  type: string
  selector?: string
  selectorLabel?: string
  value?: string
  url?: string
  description: string
  timestamp: number
  // API 捕获
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

const STEP_TYPE_ICONS: Record<string, React.ReactNode> = {
  navigate: <Globe size={14} />,
  click: <MousePointer size={14} />,
  type: <Type size={14} />,
  select: <List size={14} />,
  wait: <Clock size={14} />,
  screenshot: <Camera size={14} />,
  scroll: <ArrowDown size={14} />,
  hover: <Hand size={14} />,
  api: <Wifi size={14} />,
}

const STEP_TYPE_LABELS: Record<string, string> = {
  navigate: '导航',
  click: '点击',
  type: '输入',
  select: '选择',
  wait: '等待',
  screenshot: '截图',
  scroll: '滚动',
  hover: '悬停',
  api: 'API',
}

const HTTP_METHOD_COLORS: Record<string, string> = {
  GET: 'text-green-400', POST: 'text-amber-400', PUT: 'text-blue-400',
  DELETE: 'text-red-400', PATCH: 'text-purple-400',
}

let stepIdCounter = 0
function genId(): string {
  return `step_${Date.now()}_${++stepIdCounter}`
}

export function VisualRecorder() {
  const getApi = () => (window as any).supplyChainTester
  const [isRecording, setIsRecording] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [steps, setSteps] = useState<RecordStep[]>([])
  const [urlInput, setUrlInput] = useState('https://')
  const [screenshot, setScreenshot] = useState<string | null>(null)
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

  // 监听录制事件
  useEffect(() => {
    const api = getApi()
    if (!api?.onRecorderEvent) return
    const unsub = api.onRecorderEvent((step: any) => {
      const newStep: RecordStep = {
        id: genId(),
        type: step.type || 'click',
        selector: step.selector,
        selectorLabel: step.selectorLabel,
        value: step.value,
        url: step.url,
        description: step.description || step.type,
        timestamp: Date.now(),
      }
      setSteps(prev => [...prev, newStep])
    })
    return () => { if (unsub) unsub() }
  }, [])

  // 加载已保存会话
  useEffect(() => {
    loadSessions()
  }, [])

  async function loadSessions() {
    const api = getApi()
    if (!api?.recorderLoadSessions) return
    try {
      const list = await api.recorderLoadSessions()
      setSessions(list || [])
    } catch (err) {
      console.error('[Recorder] Load sessions error:', err)
    }
  }

  // 开始录制
  async function startRecording() {
    const api = getApi()
    if (!api?.recorderStart) {
      setStatusMsg('录制功能不可用，请重启应用')
      return
    }
    setSteps([])
    setStatusMsg('正在启动浏览器...')
    const result = await api.recorderStart(urlInput)
    if (result.ok) {
      setIsRecording(true)
      setStatusMsg('🔴 录制中 — 请在浏览器中操作')
      refreshScreenshot()
    } else {
      setStatusMsg(`启动失败: ${result.error || '未知错误'}`)
    }
  }

  // 停止录制
  async function stopRecording() {
    const api = getApi()
    if (api?.recorderStop) {
      await api.recorderStop()
    }
    setIsRecording(false)
    setStatusMsg('录制已停止')
    refreshScreenshot()
  }

  // 回放步骤
  async function playSteps() {
    const api = getApi()
    if (!api?.recorderPlay || steps.length === 0) return
    setIsPlaying(true)
    setStatusMsg('▶ 正在回放...')
    try {
      const result = await api.recorderPlay(steps)
      setIsPlaying(false)
      if (result.ok) {
        setStatusMsg('✅ 回放完成')
      } else {
        const failedStep = result.results?.find((r: any) => !r.ok)
        setStatusMsg(`❌ 第 ${(failedStep?.index ?? 0) + 1} 步失败: ${failedStep?.message}`)
      }
    } catch (err: any) {
      setIsPlaying(false)
      setStatusMsg(`回放异常: ${err.message || String(err)}`)
    }
    refreshScreenshot()
  }

  // 刷新截图
  async function refreshScreenshot() {
    const api = getApi()
    if (!api?.recorderScreenshot) return
    try {
      const result = await api.recorderScreenshot()
      if (result.ok) setScreenshot(result.dataUrl)
    } catch {}
  }

  // 手动添加步骤
  function addStep(type: string) {
    const step: RecordStep = {
      id: genId(),
      type,
      description: STEP_TYPE_LABELS[type] || type,
      timestamp: Date.now(),
    }
    setSteps(prev => [...prev, step])
  }

  // 删除步骤
  function deleteStep(id: string) {
    setSteps(prev => prev.filter(s => s.id !== id))
    if (selectedStep === id) setSelectedStep(null)
  }

  // 移动步骤
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

  // 更新选中步骤
  function updateSelectedStep(field: string, value: string) {
    if (!selectedStep) return
    setSteps(prev => prev.map(s => s.id === selectedStep ? { ...s, [field]: value, description: buildDescription(s.type, field === 'selector' ? value : s.selector, field === 'value' ? value : s.value, field === 'url' ? value : s.url) } : s))
  }

  function buildDescription(type: string, selector?: string, value?: string, url?: string): string {
    const label = selector || ''
    switch (type) {
      case 'navigate': return `打开 ${url || ''}`
      case 'click': return `点击 ${label}`
      case 'type': return `在 ${label} 输入 "${value || ''}"`
      case 'select': return `选择 ${value || ''}`
      case 'wait': return '等待 1 秒'
      case 'screenshot': return '截图'
      case 'scroll': return `滚动到 ${label}`
      case 'hover': return `悬停 ${label}`
      default: return type
    }
  }

  // 保存会话
  async function saveSession() {
    if (steps.length === 0) {
      setStatusMsg('⚠️ 没有可保存的步骤')
      return
    }
    const api = getApi()
    if (!api?.recorderSaveSession) {
      setStatusMsg('❌ 保存功能不可用，请重启应用')
      return
    }
    setIsSaving(true)
    setStatusMsg('保存中...')
    try {
      const name = sessionName.trim() || `会话 ${new Date().toLocaleString('zh-CN')}`
      const session: RecordSession = {
        id: Date.now().toString(36),
        name,
        steps,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      console.log('[Recorder] Saving session:', session.name, session.steps.length, 'steps')
      const result = await api.recorderSaveSession(session)
      console.log('[Recorder] Save result:', result)
      if (result.ok) {
        setStatusMsg('✅ 已保存')
        setSessionName('')
        await loadSessions()
      } else {
        setStatusMsg(`保存失败: ${result.error || '未知错误'}`)
      }
    } catch (err: any) {
      console.error('[Recorder] Save error:', err)
      setStatusMsg(`保存异常: ${err.message || String(err)}`)
    } finally {
      setIsSaving(false)
    }
  }

  // 加载会话
  function loadSession(session: RecordSession) {
    setSteps(session.steps)
    setSessionName(session.name)
    setShowSessions(false)
    setStatusMsg(`已加载: ${session.name}`)
  }

  // 删除会话
  async function deleteSession(id: string) {
    const api = getApi()
    if (!api?.recorderDeleteSession) return
    try {
      await api.recorderDeleteSession(id)
    } catch {}
    loadSessions()
  }

  // 清空步骤
  function clearSteps() {
    if (steps.length > 0 && !confirm('确定清空所有步骤？')) return
    setSteps([])
    setSelectedStep(null)
  }

  // 生成 Python 脚本代码
  function generatePythonCode(): string {
    const hasApiSteps = steps.some(s => s.type === 'api')
    const hasBrowserSteps = steps.some(s => s.type !== 'api')

    let code = '# -*- coding: utf-8 -*-\n'
    code += `# ${exportFilename || '录制的业务场景'}\n`
    code += `# 录制时间: ${new Date().toLocaleString('zh-CN')}\n`
    code += `# 步骤数: ${steps.length} (UI: ${steps.filter(s => s.type !== 'api').length}, API: ${steps.filter(s => s.type === 'api').length})\n`

    const imports = new Set<string>()
    if (hasApiSteps) imports.add('import requests')
    if (hasBrowserSteps) imports.add('from playwright.sync_api import sync_playwright')

    code += [...imports].join('\n') + '\n\n'

    // 浏览器步骤
    if (hasBrowserSteps) {
      code += 'with sync_playwright() as p:\n'
      code += '    browser = p.chromium.launch(headless=False)\n'
      code += '    page = browser.new_page()\n'
      code += '    page.set_viewport_size({"width": 1440, "height": 900})\n\n'
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      code += `    # ${i + 1}. ${step.description}\n`

      if (step.type === 'api') {
        // 生成 requests 库调用
        const method = (step.apiMethod || 'GET').toLowerCase()
        const url = step.apiUrl || ''
        const headers = step.apiHeaders || {}
        const body = step.apiBody || ''

        // 构造 headers dict
        const headerEntries = Object.entries(headers)
          .filter(([k]) => !['cookie', 'authorization', 'host', 'content-length', 'origin', 'referer'].includes(k.toLowerCase()))
        const headersStr = headerEntries.length > 0
          ? '{\n        ' + headerEntries.map(([k, v]) => `'${k}': '${(v || '').replace(/'/g, "\\'")}'`).join(',\n        ') + '\n    }'
          : '{}'

        if (method === 'get' || method === 'delete') {
          code += `    resp = requests.${method}('${url.replace(/'/g, "\\'")}', headers=${headersStr})\n`
        } else {
          const bodyStr = body
            ? `json=${JSON.stringify(body).substring(0, 200)}` + (JSON.stringify(body).length > 200 ? '  # ...' : '')
            : ''
          // Try to use json parameter if body is valid JSON
          let jsonParam = ''
          try {
            JSON.parse(body)
            jsonParam = `json=${JSON.stringify(body)}`
          } catch {
            jsonParam = body ? `data='''${body.replace(/'/g, "\\'")}'''` : ''
          }
          code += `    resp = requests.${method}('${url.replace(/'/g, "\\'")}', headers=${headersStr}, ${jsonParam})\n`
        }
        code += `    print(f'${step.apiMethod} {url.replace(/^https?:\/\/[^\/]+/, '')} → {resp.status_code}')\n`
      } else {
        // 浏览器步骤
        switch (step.type) {
          case 'navigate':
            code += `    page.goto('${(step.url || '').replace(/'/g, "\\'")}', wait_until='domcontentloaded')\n`
            break
          case 'click':
            code += `    page.click('${(step.selector || '').replace(/'/g, "\\'")}')\n`
            code += '    page.wait_for_load_state(\'domcontentloaded\')\n'
            break
          case 'type':
            code += `    page.fill('${(step.selector || '').replace(/'/g, "\\'")}', '${(step.value || '').replace(/'/g, "\\'")}')\n`
            break
          case 'select':
            code += `    page.select_option('${(step.selector || '').replace(/'/g, "\\'")}', '${(step.value || '').replace(/'/g, "\\'")}')\n`
            break
          case 'wait':
            code += '    page.wait_for_timeout(1000)\n'
            break
          case 'screenshot':
            code += '    page.screenshot(path=\'screenshot.png\', full_page=True)\n'
            break
          case 'scroll':
            code += `    page.locator('${(step.selector || '').replace(/'/g, "\\'")}').scroll_into_view_if_needed()\n`
            break
          case 'hover':
            code += `    page.hover('${(step.selector || '').replace(/'/g, "\\'")}')\n`
            break
        }
      }
    }

    if (hasBrowserSteps) {
      code += '\n    print(\'✅ 场景执行完成\')\n'
      code += '    browser.close()\n'
    } else {
      code += '\nprint(\'✅ 场景执行完成\')\n'
    }
    return code
  }

  // 打开导出对话框
  function openExportDialog() {
    if (steps.length === 0) {
      setStatusMsg('⚠️ 没有可导出的步骤')
      return
    }
    setExportFilename(`录制的场景_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`)
    setShowExportDialog(true)
  }

  // 导出并保存为 .py 文件
  async function exportAndSave() {
    const api = getApi()
    const filename = (exportFilename.trim() || '录制的场景') + '.py'
    const code = generatePythonCode()

    // 同时复制到剪贴板
    try {
      await navigator.clipboard.writeText(code)
    } catch {}

    if (!api?.writeFile) {
      setStatusMsg('❌ 文件写入功能不可用')
      return
    }

    setStatusMsg('正在保存脚本...')
    try {
      // 保存到 test-suites/{product}/{filename}
      const savePath = `test-suites/${exportProduct}/${filename}`
      const result = await api.writeFile(savePath, code)
      if (result.ok) {
        setStatusMsg(`✅ 已保存到 test-suites/${exportProduct}/${filename}`)
        setShowExportDialog(false)
        // 刷新侧边栏产品线
        if (api?.scanScripts) {
          setTimeout(() => api.scanScripts(), 500)
        }
      } else {
        setStatusMsg(`保存失败: ${result.error || '未知错误'}`)
      }
    } catch (err: any) {
      setStatusMsg(`保存异常: ${err.message || String(err)}`)
    }
  }

  const selectedStepData = steps.find(s => s.id === selectedStep)

  return (
    <div className="flex h-full">
      {/* 左侧：步骤列表 */}
      <div className="w-80 flex flex-col border-r border-border/10 bg-surface-light/30">
        {/* 工具栏 */}
        <div className="p-3 border-b border-border/10 space-y-2">
          {/* URL 输入 */}
          <div className="flex gap-1">
            <input
              type="text"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="输入网址..."
              className="flex-1 px-2 py-1.5 text-xs bg-background border border-border/20 rounded-md focus:outline-none focus:border-accent/50"
              disabled={isRecording}
            />
          </div>

          {/* 录制/回放按钮 */}
          <div className="flex gap-1">
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-md transition-colors"
              >
                <Video size={14} /> 录制
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded-md transition-colors"
              >
                <Square size={14} /> 停止
              </button>
            )}
            <button
              onClick={playSteps}
              disabled={isRecording || isPlaying || steps.length === 0}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-md transition-colors disabled:opacity-30"
            >
              <Play size={14} /> 回放
            </button>
          </div>

          {/* 添加步骤 */}
          <div className="flex gap-1 flex-wrap">
            {(['navigate', 'click', 'type', 'wait', 'screenshot', 'scroll'] as const).map(t => (
              <button
                key={t}
                onClick={() => addStep(t)}
                disabled={isRecording}
                className="flex items-center gap-0.5 px-1.5 py-1 text-[10px] bg-hover/5 hover:bg-hover/10 text-muted hover:text-foreground rounded transition-colors disabled:opacity-30"
                title={STEP_TYPE_LABELS[t]}
              >
                {STEP_TYPE_ICONS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* 状态提示 */}
        {statusMsg && (
          <div className="px-3 py-1.5 text-xs text-muted border-b border-border/5 bg-hover/5">
            {statusMsg}
          </div>
        )}

        {/* 步骤列表 */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {steps.length === 0 ? (
            <p className="text-xs text-muted text-center py-8">
              {isRecording ? '等待操作...' : '点击「录制」开始捕获浏览器操作'}
            </p>
          ) : (
            steps.map((step, idx) => (
              <div
                key={step.id}
                onClick={() => setSelectedStep(step.id)}
                className={`
                  group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors
                  ${selectedStep === step.id
                    ? 'bg-accent/20 text-foreground'
                    : 'hover:bg-hover/5 text-muted hover:text-foreground'
                  }
                `}
              >
                <span className="text-[10px] w-5 text-center opacity-50">{idx + 1}</span>
                <span className="opacity-60">{STEP_TYPE_ICONS[step.type]}</span>
                {step.type === 'api' && step.apiMethod ? (
                  <span className={`text-[10px] font-mono font-bold ${HTTP_METHOD_COLORS[step.apiMethod] || 'text-muted'}`}>{step.apiMethod}</span>
                ) : null}
                <span className="flex-1 truncate">{step.description}</span>
                {step.type === 'api' && step.apiStatus ? (
                  <span className={`text-[10px] ${step.apiStatus < 400 ? 'text-green-400' : 'text-red-400'}`}>{step.apiStatus}</span>
                ) : null}
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

        {/* 底部操作 */}
        <div className="p-2 border-t border-border/10 flex gap-1">
          <button onClick={saveSession} disabled={steps.length === 0 || isSaving}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-accent/20 text-accent hover:bg-accent/30 rounded-md transition-colors disabled:opacity-30">
            <Save size={13} /> {isSaving ? '保存中...' : '保存'}
          </button>
          <button onClick={() => setShowSessions(!showSessions)}
            className="flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-hover/5 hover:bg-hover/10 text-muted hover:text-foreground rounded-md transition-colors">
            <FolderOpen size={13} />
          </button>
          <button onClick={openExportDialog} disabled={steps.length === 0}
            className="flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-hover/5 hover:bg-hover/10 text-muted hover:text-foreground rounded-md transition-colors disabled:opacity-30"
            title="导出为 Python 脚本">
            <Download size={13} /> Py
          </button>
          <button onClick={clearSteps}
            className="flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-hover/5 hover:bg-hover/10 text-muted hover:text-red-400 rounded-md transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* 右侧：详情面板 / 截图 */}
      <div className="flex-1 flex flex-col">
        {/* 已保存会话列表 */}
        {showSessions && (
          <div className="border-b border-border/10 p-3 max-h-48 overflow-y-auto">
            <h3 className="text-xs font-medium text-muted mb-2">已保存的会话</h3>
            {sessions.length === 0 ? (
              <p className="text-xs text-muted">暂无保存的会话</p>
            ) : (
              <div className="space-y-1">
                {sessions.map(s => (
                  <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-hover/5 group">
                    <button onClick={() => loadSession(s)} className="flex-1 text-left text-xs truncate text-muted hover:text-foreground">
                      {s.name} <span className="opacity-40">({s.steps.length} 步)</span>
                    </button>
                    <button onClick={() => deleteSession(s.id)}
                      className="hidden group-hover:block p-0.5 text-red-400 hover:text-red-300"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 步骤编辑面板 */}
        {selectedStepData && (
          <div className="border-b border-border/10 p-3">
            <h3 className="text-xs font-medium text-muted mb-2">编辑步骤</h3>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-muted block mb-0.5">类型</label>
                <select
                  value={selectedStepData.type}
                  onChange={e => updateSelectedStep('type', e.target.value)}
                  className="w-full px-2 py-1 text-xs bg-background border border-border/20 rounded-md"
                >
                  {Object.entries(STEP_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              {(selectedStepData.type === 'navigate') && (
                <div>
                  <label className="text-[10px] text-muted block mb-0.5">URL</label>
                  <input
                    type="text"
                    value={selectedStepData.url || ''}
                    onChange={e => updateSelectedStep('url', e.target.value)}
                    className="w-full px-2 py-1 text-xs bg-background border border-border/20 rounded-md"
                    placeholder="https://..."
                  />
                </div>
              )}
              {(selectedStepData.type === 'click' || selectedStepData.type === 'type' || selectedStepData.type === 'select' || selectedStepData.type === 'scroll' || selectedStepData.type === 'hover') && (
                <div>
                  <label className="text-[10px] text-muted block mb-0.5">CSS 选择器</label>
                  <input
                    type="text"
                    value={selectedStepData.selector || ''}
                    onChange={e => updateSelectedStep('selector', e.target.value)}
                    className="w-full px-2 py-1 text-xs bg-background border border-border/20 rounded-md font-mono"
                    placeholder="#id, .class, [name=...]"
                  />
                </div>
              )}
              {(selectedStepData.type === 'type' || selectedStepData.type === 'select') && (
                <div>
                  <label className="text-[10px] text-muted block mb-0.5">
                    {selectedStepData.type === 'select' ? '选项值' : '输入内容'}
                  </label>
                  <input
                    type="text"
                    value={selectedStepData.value || ''}
                    onChange={e => updateSelectedStep('value', e.target.value)}
                    className="w-full px-2 py-1 text-xs bg-background border border-border/20 rounded-md"
                    placeholder="值..."
                  />
                </div>
              )}
              {/* API 步骤详情（只读） */}
              {selectedStepData.type === 'api' && selectedStepData.apiMethod && (
                <div className="space-y-1.5 border-t border-border/10 pt-2 mt-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-bold ${HTTP_METHOD_COLORS[selectedStepData.apiMethod] || ''}`}>
                      {selectedStepData.apiMethod}
                    </span>
                    <span className="text-[10px] text-muted truncate">{selectedStepData.apiUrl || ''}</span>
                  </div>
                  {selectedStepData.apiStatus && (
                    <div className="text-[10px]">
                      状态: <span className={selectedStepData.apiStatus < 400 ? 'text-green-400' : 'text-red-400'}>{selectedStepData.apiStatus}</span>
                    </div>
                  )}
                  {selectedStepData.apiBody && (
                    <div>
                      <label className="text-[10px] text-muted block">请求体</label>
                      <pre className="text-[10px] bg-background rounded p-1.5 mt-0.5 max-h-24 overflow-y-auto font-mono whitespace-pre-wrap">{selectedStepData.apiBody}</pre>
                    </div>
                  )}
                  {selectedStepData.apiResponse && (
                    <div>
                      <label className="text-[10px] text-muted block">响应体</label>
                      <pre className="text-[10px] bg-background rounded p-1.5 mt-0.5 max-h-32 overflow-y-auto font-mono whitespace-pre-wrap">{selectedStepData.apiResponse}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 截图预览区 */}
        <div className="flex-1 bg-background flex items-center justify-center p-4 overflow-hidden">
          {screenshot ? (
            <img
              src={screenshot}
              alt="浏览器截图"
              className="max-w-full max-h-full object-contain rounded-lg border border-border/10 shadow-lg"
            />
          ) : (
            <div className="text-center text-muted">
              <Camera size={48} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm">开始录制后显示浏览器截图</p>
              {!isRecording && (
                <button onClick={refreshScreenshot} className="mt-2 px-3 py-1 text-xs bg-hover/5 hover:bg-hover/10 rounded-md transition-colors">
                  手动刷新
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 导出对话框 */}
      {showExportDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowExportDialog(false)}>
          <div className="bg-surface-light border border-border/20 rounded-xl p-5 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium">导出 Python 脚本</h3>
              <button onClick={() => setShowExportDialog(false)} className="p-1 hover:bg-hover/10 rounded">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-muted block mb-1">保存到产品线</label>
                <select
                  value={exportProduct}
                  onChange={e => setExportProduct(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-background border border-border/20 rounded-lg focus:outline-none focus:border-accent/50"
                >
                  <option value="common">common（通用脚本）</option>
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
                  <input
                    type="text"
                    value={exportFilename}
                    onChange={e => setExportFilename(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs bg-background border border-border/20 rounded-lg focus:outline-none focus:border-accent/50"
                    placeholder="输入文件名..."
                  />
                  <span className="text-xs text-muted">.py</span>
                </div>
              </div>

              <div className="bg-background border border-border/10 rounded-lg p-3 max-h-40 overflow-y-auto">
                <pre className="text-[10px] text-muted font-mono whitespace-pre-wrap">{generatePythonCode().slice(0, 500)}{steps.length > 3 ? '\n...' : ''}</pre>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowExportDialog(false)}
                className="flex-1 px-3 py-2 text-xs border border-border/20 rounded-lg hover:bg-hover/5 transition-colors">
                取消
              </button>
              <button onClick={exportAndSave}
                className="flex-1 px-3 py-2 text-xs bg-accent/20 text-accent hover:bg-accent/30 rounded-lg transition-colors font-medium">
                保存脚本
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
