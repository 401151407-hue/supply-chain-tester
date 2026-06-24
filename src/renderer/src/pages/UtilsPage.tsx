import React, { useEffect, useState, useRef } from 'react'
import { useAppStore } from '../store'
import { Wrench, Loader2, Play, Square, Terminal, Trash2, Search, Database, Eraser, Download, HelpCircle } from 'lucide-react'

interface ScriptItem {
  name: string
  path: string
}

export function UtilsPage() {
  const { env } = useAppStore()
  const [scripts, setScripts] = useState<ScriptItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeScript, setActiveScript] = useState<ScriptItem | null>(null)
  const [output, setOutput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const outputRef = useRef('')
  const outputContainerRef = useRef<HTMLDivElement>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  // 变量输入
  const [projectId, setProjectId] = useState('')
  const [certNo, setCertNo] = useState('')
  const [amount, setAmount] = useState('')
  const [multiFunc, setMultiFunc] = useState('')

  // 查询结果全局变量（持久化，供下游脚本复用）
  const [globalVars, setGlobalVars] = useState<Record<string, string>>({})

  // 清空动画
  const [clearingOutput, setClearingOutput] = useState(false)

  // 发起方式弹窗
  const [showSubmitterDialog, setShowSubmitterDialog] = useState(false)
  const [pendingScript, setPendingScript] = useState<ScriptItem | null>(null)

  // Playwright 安装状态
  const [installingPW, setInstallingPW] = useState(false)
  const [pwOutput, setPwOutput] = useState('')
  const [pwInstalled, setPwInstalled] = useState(false)  // playwright 模块已安装
  const [pwHasBrowser, setPwHasBrowser] = useState(false) // Chromium 浏览器已下载

  useEffect(() => {
    loadScripts()
    checkPlaywright()
    return () => { unsubRef.current?.() }
  }, [])

  // 输出内容变化时自动滚动到底部
  useEffect(() => {
    if (outputContainerRef.current) {
      outputContainerRef.current.scrollTop = outputContainerRef.current.scrollHeight
    }
  }, [output])

  async function loadScripts() {
    setLoading(true)
    try {
      const api = (window as any).supplyChainTester
      if (api?.listDir) {
        const res = await api.listDir('test-suites/common')
        if (res.ok && res.items) {
          const pyFiles = res.items
            .filter((item: any) => !item.isDir && item.name.endsWith('.py') && !['查询项目信息.py', '查询客户信息.py'].includes(item.name))
            .map((item: any) => ({
              name: item.name.replace(/\.py$/, ''),
              path: `test-suites/common/${item.name}`,
            }))
          setScripts(pyFiles)
        }
      }
    } catch {} finally {
      setLoading(false)
    }
  }

  function handleRunScript(script: ScriptItem) {
    // 授信回捞/特殊提额类脚本需要选择发起方式
    if (script.name.includes('授信回捞') || script.name.includes('特殊提额')) {
      setPendingScript(script)
      setShowSubmitterDialog(true)
      return
    }
    runUtilityScript(script.path, script.name)
  }

  async function handleRunWithSubmitterType(submitterType: string) {
    setShowSubmitterDialog(false)
    const script = pendingScript
    if (!script) return
    setPendingScript(null)
    runUtilityScript(script.path, script.name, submitterType)
  }

  async function checkPlaywright() {
    const api = (window as any).supplyChainTester
    try {
      const result = await api?.checkPlaywright?.()
      setPwInstalled(result?.playwright === true)
      setPwHasBrowser(result?.chromium === true)
    } catch { setPwInstalled(false); setPwHasBrowser(false) }
  }

  async function handleInstallPlaywright() {
    if (installingPW || pwInstalled) return
    setInstallingPW(true)
    setPwOutput('')
    const api = (window as any).supplyChainTester

    // 监听安装输出
    const unsub = api?.onScriptOutput?.((chunk: string) => {
      setPwOutput(prev => {
        const next = prev + chunk
        // 同步到主输出框
        outputRef.current += chunk
        setOutput(outputRef.current)
        return next
      })
    })

    try {
      const result = await api?.installPlaywright?.()
      if (result?.ok) {
        setPwInstalled(true)
        setPwHasBrowser(true)
      } else {
        setPwOutput(prev => prev + `\n安装失败: ${result?.error || '未知错误'}`)
      }
    } catch (err: any) {
      setPwOutput(prev => prev + `\n安装出错: ${err.message}`)
    } finally {
      unsub?.()
      setInstallingPW(false)
    }
  }

  async function handleStop() {
    const api = (window as any).supplyChainTester
    if (api?.stopScript) {
      await api.stopScript()
      outputRef.current += '\n已停止'
      setOutput(outputRef.current)
    }
    setIsRunning(false)
  }

  function handleClearOutput() {
    setClearingOutput(true)
    setTimeout(() => {
      outputRef.current = ''
      setOutput('')
      setClearingOutput(false)
    }, 220)
  }

  function handleClearVars() {
    setProjectId('')
    setCertNo('')
    setAmount('')
    setMultiFunc('')
  }

  async function runUtilityScript(scriptPath: string, label: string, submitterType?: string) {
    if (isRunning) return
    setActiveScript({ name: label, path: scriptPath })
    setIsRunning(true)
    const separator = `\n${'─'.repeat(40)}\n  ▶ ${label}  ${new Date().toLocaleTimeString()}\n${'─'.repeat(40)}\n`
    outputRef.current += separator
    setOutput(outputRef.current)

    const api = (window as any).supplyChainTester
    if (!api) { setOutput('后端未连接'); setIsRunning(false); return }

    if (api.onScriptOutput) {
      unsubRef.current?.()
      unsubRef.current = api.onScriptOutput((chunk: string) => {
        outputRef.current += chunk
        setOutput(outputRef.current)
      })
    }

    try {
      // 查询脚本用输入框的值，其他脚本只用查询结果（全局变量）
      const isQuery = label.includes('查询项目信息') || label.includes('查询客户信息')
      const resolvedMultiFunc = multiFunc || globalVars.platform_id || globalVars.multi_func || ''
      const vars: Record<string, string> = {
        env,
        ...globalVars,
        project_id: isQuery ? (projectId || globalVars.project_id || '') : (globalVars.project_id || ''),
        cert_no: isQuery ? (certNo || globalVars.cert_no || '') : (globalVars.cert_no || ''),
        amount: amount || globalVars.amount || '',
        multi_func: resolvedMultiFunc,
      }
      if (submitterType) {
        vars.submitter_type = submitterType
      }
      await api.runScript(scriptPath, vars)

      // 解析输出，存入全局变量 + 自动填入输入框
      parseAndStoreQueryResult()
    } catch (err: any) {
      outputRef.current += `\n错误: ${err.message || String(err)}`
      setOutput(outputRef.current)
    } finally {
      setIsRunning(false)
    }
  }

  /** 从输出中解析查询结果，存入全局变量并自动填充输入框 */
  function parseAndStoreQueryResult() {
    // 只搜索最后一段输出（分隔线之后），避免旧查询结果干扰
    const fullText = outputRef.current
    const lastSep = fullText.lastIndexOf('─'.repeat(40))
    const text = lastSep >= 0 ? fullText.slice(lastSep) : fullText
    const newVars: Record<string, string> = {}
    const skipValues = ['未输入', '默认300万', 'default', '无']

    const fieldMap: Record<string, string> = {
      '项目ID': 'project_id',
      '项目名称': 'project_name',
      '平台ID': 'platform_id',
      '平台名称': 'platform_name',
      '产品类型': 'product_type',
      '融资比例': 'financing_percent',
      '企业名称': 'enterprise_name',
      '企业证件号': 'cert_no',
      '证件号': 'cert_no',
      '手机号': 'phone',
      '法人姓名': 'legal_person_name',
      '法人证件号': 'legal_person_id',
    }

    for (const [label, key] of Object.entries(fieldMap)) {
      // 取最后一次匹配（从末尾开始搜）
      const regex = new RegExp(`${label}[：:]\\s*(\\S+)`, 'g')
      let match: RegExpExecArray | null
      let lastVal: string | null = null
      while ((match = regex.exec(text)) !== null) {
        lastVal = match[1]
      }
      if (lastVal && !skipValues.includes(lastVal)) {
        newVars[key] = lastVal
      }
    }

    if (Object.keys(newVars).length > 0) {
      setGlobalVars(prev => ({ ...prev, ...newVars }))
      if (newVars.project_id) setProjectId(newVars.project_id)
      if (newVars.cert_no) setCertNo(newVars.cert_no)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 头部 + 变量栏 */}
      <div className="shrink-0 border-b border-border/5 bg-surface-light/50">
        <div className="flex items-center gap-3 px-4 h-12">
          <Wrench size={18} className="text-accent" />
          <h2 className="text-lg font-semibold">通用工具脚本</h2>
        </div>
        <div className="flex items-center justify-center gap-3 px-4 pb-3 flex-wrap">
          <div className="flex items-center gap-2 bg-surface border border-border/5 rounded-xl px-3 py-2">
            <label className="text-[11px] font-semibold text-accent-light whitespace-nowrap">项目ID</label>
            <input
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              placeholder="请输入项目ID"
              className="w-36 rounded-lg px-3 py-2 text-sm font-mono outline-none bg-transparent placeholder:text-muted/30"
            />
          </div>
          <div className="flex items-center gap-2 bg-surface border border-border/5 rounded-xl px-3 py-2">
            <label className="text-[11px] font-semibold text-accent-light whitespace-nowrap">证件号</label>
            <input
              value={certNo}
              onChange={e => setCertNo(e.target.value)}
              placeholder="请输入证件号"
              className="w-44 rounded-lg px-3 py-2 text-sm font-mono outline-none bg-transparent placeholder:text-muted/30"
            />
          </div>
          <div className="flex items-center gap-2 bg-surface border border-border/5 rounded-xl px-3 py-2">
            <label className="text-[11px] font-semibold text-accent-light whitespace-nowrap">金额</label>
            <input
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="请输入金额"
              className="w-32 rounded-lg px-3 py-2 text-sm font-mono outline-none bg-transparent placeholder:text-muted/30"
            />
          </div>
          <div className="flex items-center gap-2 bg-surface border border-border/5 rounded-xl px-3 py-2">
            <label className="text-[11px] font-semibold text-accent-light whitespace-nowrap">多功能</label>
            <div className="relative flex-1">
              <input
                value={multiFunc}
                onChange={e => setMultiFunc(e.target.value)}
                placeholder="多功能参数"
                className="w-full rounded-lg px-3 py-2 pr-7 text-sm font-mono outline-none bg-transparent placeholder:text-muted/30"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 group">
                <HelpCircle size={13} className="text-muted cursor-help" />
                <span className="pointer-events-none absolute bottom-full right-0 mb-2 px-3 py-2 bg-foreground text-surface rounded-lg text-[10px] leading-relaxed whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                  此处填入的值会注入为变量<br />multi_func 供下游脚本使用
                </span>
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center gap-3 px-4 pb-3">
          <button onClick={() => runUtilityScript('test-suites/common/查询项目信息.py', '查询项目信息')}
            onMouseDown={e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); (window as any).supplyChainTester?.openPath?.('test-suites/common/查询项目信息.py') } }}
            disabled={isRunning}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border border-blue-500/20 transition-all disabled:opacity-50 active:scale-95"
            title="点击运行 · Ctrl+点击打开文件">
            <Database size={15} />
            查询项目信息
          </button>
          <button onClick={() => runUtilityScript('test-suites/common/查询客户信息.py', '查询客户信息')}
            onMouseDown={e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); (window as any).supplyChainTester?.openPath?.('test-suites/common/查询客户信息.py') } }}
            disabled={isRunning}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-purple-500/15 hover:bg-purple-500/25 text-purple-400 border border-purple-500/20 transition-all disabled:opacity-50 active:scale-95"
            title="点击运行 · Ctrl+点击打开文件">
            <Search size={15} />
            查询客户信息
          </button>
          <button onClick={handleClearVars}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-hover/5 hover:bg-hover/10 text-muted hover:text-foreground border border-border/10 transition-all active:scale-95">
            <Eraser size={15} />
            清空
          </button>
          {isRunning && (
            <button onClick={handleStop}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/20 transition-all active:scale-95">
              <Square size={15} />
              停止运行
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">        {/* Playwright 安装提示 */}
        <div className={`shrink-0 px-6 py-3 border-b border-border/5 ${pwHasBrowser ? 'bg-green-500/5' : 'bg-amber-500/5'}`}>
          <div className="flex items-center gap-3">
            <Download size={16} className={pwHasBrowser ? 'text-green-400' : 'text-amber-400'} />
            <span className="text-xs text-foreground flex-1">
              {pwHasBrowser
                ? '✅ Playwright + Chromium 已安装，脚本中的浏览器功能可用'
                : pwInstalled
                  ? '⚠️ Playwright 已安装但 Chromium 未下载，点击一键安装下载浏览器'
                  : '部分脚本需要 Playwright + Chromium 浏览器，点击安装（约 150MB，仅需一次）'}
            </span>
            <button
              onClick={handleInstallPlaywright}
              disabled={installingPW || pwHasBrowser}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all disabled:opacity-50
                ${pwHasBrowser
                  ? 'bg-green-500/15 text-green-400 border-green-500/20 cursor-default'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border-amber-500/20'}`}
            >
              {installingPW ? (
                <><Loader2 size={12} className="animate-spin" /> 安装中...</>
              ) : pwHasBrowser ? (
                '已安装'
              ) : (
                '一键安装'
              )}
            </button>
          </div>
          {installingPW && pwOutput && (
            <pre className="mt-2 text-[11px] text-muted max-h-32 overflow-y-auto bg-surface rounded p-2">{pwOutput}</pre>
          )}
        </div>        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={24} className="animate-spin text-muted" />
            </div>
          ) : scripts.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted">
                <Wrench size={32} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm">暂无通用脚本</p>
                <p className="text-xs mt-1">请将 .py 脚本放入 test-suites/common 目录</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {scripts.map(script => (
                <button
                  key={script.path}
                  onClick={e => {
                    if (e.ctrlKey || e.metaKey) return
                    handleRunScript(script)
                  }}
                  onMouseDown={e => {
                    if (e.ctrlKey || e.metaKey) {
                      e.preventDefault()
                      e.stopPropagation()
                      const api = (window as any).supplyChainTester
                      api?.openPath?.(script.path)
                    }
                  }}
                  disabled={isRunning}
                  className={`flex items-center gap-3 p-4 rounded-xl bg-surface border border-border/5
                             hover:border-accent/30 hover:bg-accent/5 transition-all text-left group cursor-pointer
                             ${activeScript?.path === script.path ? 'border-accent/50 bg-accent/5' : ''}
                             disabled:opacity-50 disabled:cursor-not-allowed`}
                  title="点击运行 · Ctrl+点击打开文件"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors
                                ${activeScript?.path === script.path && isRunning
                                  ? 'bg-green-500/20' : 'bg-green-500/10 group-hover:bg-green-500/20'}`}>
                    {activeScript?.path === script.path && isRunning ? (
                      <Loader2 size={20} className="text-green-400 animate-spin" />
                    ) : (
                      <Play size={20} className="text-green-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{script.name}</p>
                    <p className="text-[11px] text-muted truncate mt-0.5">{script.path}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border/5 bg-surface-light/10 flex flex-col shrink-0" style={{ height: '45%' }}>
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border/5 bg-surface-light/20 shrink-0">
              <Terminal size={14} className="text-muted" />
              <span className="text-xs font-medium text-foreground truncate flex-1">执行结果</span>
              {isRunning && (
                <span className="text-[10px] text-warning flex items-center gap-1">
                  <Loader2 size={10} className="animate-spin" /> 运行中
                </span>
              )}
              {!isRunning && output && <span className="text-[10px] text-muted">已完成</span>}
              <div className="flex gap-1">
                {isRunning && (
                  <button onClick={handleStop} className="p-1.5 rounded-lg hover:bg-red-500/20 text-muted hover:text-red-400 transition-colors" title="停止">
                    <Square size={12} />
                  </button>
                )}
                <button onClick={handleClearOutput} className="p-1.5 rounded-lg hover:bg-hover/10 text-muted hover:text-foreground transition-colors" title="清空输出">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
            <div ref={outputContainerRef} className={`flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-muted ${clearingOutput ? 'animate-particle-out' : ''}`}>
              {output || (isRunning ? '等待输出...' : '无输出')}
            </div>
          </div>
      </div>

      {/* 发起方式选择弹窗 */}
      {showSubmitterDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowSubmitterDialog(false)}>
          <div className="bg-surface border border-border/10 rounded-2xl p-6 w-80 shadow-2xl animate-zoom-in" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-foreground mb-1">选择发起方式</h3>
            <p className="text-xs text-muted mb-5">{pendingScript?.name}</p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleRunWithSubmitterType('02')}
                className="flex items-center gap-3 p-4 rounded-xl bg-accent/10 hover:bg-accent/20 border border-accent/20 hover:border-accent/40 transition-all text-left">
                <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">客户经理发起</p>
                  <p className="text-[11px] text-muted">submitterType = 02</p>
                </div>
              </button>
              <button
                onClick={() => handleRunWithSubmitterType('01')}
                className="flex items-center gap-3 p-4 rounded-xl bg-green-500/5 hover:bg-green-500/15 border border-green-500/15 hover:border-green-500/30 transition-all text-left">
                <div className="w-10 h-10 rounded-lg bg-green-500/15 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">客户自主发起</p>
                  <p className="text-[11px] text-muted">submitterType = 01</p>
                </div>
              </button>
            </div>
            <button
              onClick={() => setShowSubmitterDialog(false)}
              className="w-full mt-4 py-2.5 rounded-xl text-sm text-muted hover:text-foreground hover:bg-hover/5 transition-colors">
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
