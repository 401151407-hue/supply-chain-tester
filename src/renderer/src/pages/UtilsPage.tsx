import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useAppStore } from '../store'
import { Wrench, Loader2, Play, Square, Terminal, Trash2, Search, Database, Eraser, HelpCircle } from 'lucide-react'
import { highlightOutput } from '../utils/highlight'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface ScriptItem {
  name: string
  path: string
  wip?: boolean
}

const ORDER_STORAGE_KEY = 'utils-script-order'

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
  const [clearingVars, setClearingVars] = useState(false)

  // 清空注入变量提示横幅
  const [showClearedToast, setShowClearedToast] = useState(false)

  // 输出高亮
  const highlightedHtml = useMemo(() => {
    if (!output) return ''
    // 收集工具页用户可能填的变量值
    const vals = [projectId, certNo, amount, multiFunc, ...Object.values(globalVars)].filter(v => v && v.length >= 2)
    return highlightOutput(output)
  }, [output, projectId, certNo, amount, multiFunc, globalVars])

  // 发起方式弹窗 → 改为通用的脚本变量选择弹窗
  const [showVarDialog, setShowVarDialog] = useState(false)
  const [closingVarDialog, setClosingVarDialog] = useState(false)
  const [pendingRun, setPendingRun] = useState<{ script: ScriptItem; vars: { key: string; value: string; comment: string; options?: { label: string; value: string }[] | null }[] } | null>(null)
  // 弹窗中用户选中的值
  const [dialogValues, setDialogValues] = useState<Record<string, string>>({})

  // 关闭弹窗（带动画）
  const closeVarDialog = () => {
    setClosingVarDialog(true)
    setTimeout(() => {
      setShowVarDialog(false)
      setClosingVarDialog(false)
    }, 150)
  }

  useEffect(() => {
    loadScripts()
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
      if (api?.scanScripts) {
        const data = await api.scanScripts()
        if (data?.common && Array.isArray(data.common)) {
          const allScripts: ScriptItem[] = []
          for (const group of data.common) {
            if (group.scripts && Array.isArray(group.scripts)) {
              for (const s of group.scripts) {
                if (!['查询项目信息', '查询客户信息'].includes(s.name)) {
                  allScripts.push(s)
                }
              }
            }
          }
          // 读取本地存储的排序
          try {
            const saved = localStorage.getItem(ORDER_STORAGE_KEY)
            if (saved) {
              const order: string[] = JSON.parse(saved)
              const orderMap = new Map(order.map((p, i) => [p, i]))
              allScripts.sort((a, b) => {
                const ai = orderMap.get(a.path) ?? 9999
                const bi = orderMap.get(b.path) ?? 9999
                return ai - bi
              })
            }
          } catch {}
          setScripts(allScripts)
        }
      }
    } catch {} finally {
      setLoading(false)
    }
  }

  // 拖拽排序（dnd-kit）
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setScripts(prev => {
        const oldIndex = prev.findIndex(s => s.path === active.id)
        const newIndex = prev.findIndex(s => s.path === over.id)
        const next = arrayMove(prev, oldIndex, newIndex)
        localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(next.map(s => s.path)))
        return next
      })
    }
  }, [])

  async function handleRunScript(script: ScriptItem) {
    const api = (window as any).supplyChainTester
    try {
      const parsed = await api?.parseScriptVars?.(script.path, env)
      console.log('[handleRunScript] parsed:', parsed)
      if (Array.isArray(parsed) && parsed.length > 0) {
        // 只要有可配置变量就弹窗（不论是否有选项）
        const defaults: Record<string, string> = {}
        for (const v of parsed) {
          defaults[v.key] = v.value
        }
        setDialogValues(defaults)
        setPendingRun({ script, vars: parsed })
        setShowVarDialog(true)
        return
      }
    } catch (e) { console.error('[handleRunScript] error:', e) }
    runUtilityScript(script.path, script.name)
  }

  function handleVarDialogConfirm() {
    closeVarDialog()
    setTimeout(() => {
      if (!pendingRun) return
      const { script } = pendingRun
      runUtilityScript(script.path, script.name, dialogValues)
      setPendingRun(null)
    }, 150)
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

  function handleClearVars(e?: React.MouseEvent) {
    // Ctrl+点击：仅清空已注入的全局变量
    if (e?.ctrlKey || e?.metaKey) {
      setGlobalVars({})
      setShowClearedToast(true)
      setTimeout(() => setShowClearedToast(false), 2500)
      return
    }
    // 普通点击：清空输入框
    setClearingVars(true)
    setTimeout(() => {
      setProjectId('')
      setCertNo('')
      setAmount('')
      setMultiFunc('')
      setClearingVars(false)
    }, 350)
  }

  async function runUtilityScript(scriptPath: string, label: string, extraVars?: Record<string, string>) {
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
    // 监听 stderr 变量注入
    let unsubVars: (() => void) | null = null
    if (api.onScriptVars) {
      unsubVars = api.onScriptVars((vars: Record<string, string>) => {
        setGlobalVars(prev => ({ ...prev, ...vars }))
      })
    }

    try {
      // 全局变量（stderr注入） + 输入框值，输入框优先
      const vars: Record<string, string> = {
        ...globalVars,
        env,
        projectId: projectId || globalVars.projectId || '',
        certNo: certNo || globalVars.certNo || '',
        amount: amount || globalVars.amount || '',
        multiFunc: multiFunc || globalVars.multiFunc || '',
      }
      if (extraVars) {
        Object.assign(vars, extraVars)
      }
      await api.runScript(scriptPath, vars)

      // 不再自动解析输出注入变量，由脚本 stderr 控制
      // parseAndStoreQueryResult()
    } catch (err: any) {
      outputRef.current += `\n错误: ${err.message || String(err)}`
      setOutput(outputRef.current)
    } finally {
      setIsRunning(false)
      unsubVars?.()
      unsubRef.current?.()
    }
  }

  /** 从输出中解析查询结果，存入全局变量（不自动回填输入框） */
  function parseAndStoreQueryResult() {
    // 只搜索最后一段输出（分隔线之后），避免旧查询结果干扰
    const fullText = outputRef.current
    const lastSep = fullText.lastIndexOf('─'.repeat(40))
    const text = lastSep >= 0 ? fullText.slice(lastSep) : fullText
    const newVars: Record<string, string> = {}
    const skipValues = ['未输入', '默认300万', 'default', '无']

    const fieldMap: Record<string, string> = {
      '项目ID': 'projectId',
      '项目名称': 'projectName',
      '平台ID': 'partnerPlatformId',
      '平台名称': 'partnerPlatformName',
      '产品类型': 'productType',
      '融资比例': 'financingPercent',
      '企业名称': 'enterpriseName',
      '企业证件号': 'certNo',
      '证件号': 'certNo',
      '手机号': 'phone',
      '法人姓名': 'legalPersonName',
      '法人证件号': 'legalPersonId',
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

    // 同时解析 !!key: value 和 !!-key: value 格式（脚本注入的变量）
    const bangRegex = /^[!！]{2}-?\s*(\w+)\s*[：:]\s*(.+)$/gm
    let bangMatch: RegExpExecArray | null
    while ((bangMatch = bangRegex.exec(text)) !== null) {
      const k = bangMatch[1]
      const v = bangMatch[2].trim()
      if (v && !skipValues.includes(v)) {
        newVars[k] = v
      }
    }

    if (Object.keys(newVars).length > 0) {
      setGlobalVars(prev => ({ ...prev, ...newVars }))
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 清空注入变量提示横幅 — 页面中间从左向右快速划过 */}
      {showClearedToast && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
          <div className="px-10 py-5 rounded-2xl bg-accent/90 text-white text-xl font-bold shadow-2xl animate-slide-right-fast whitespace-nowrap italic -rotate-3">
            ✅ APP 已注入变量已被清空
          </div>
        </div>
      )}
      {/* 头部 + 变量栏 */}
      <div className="shrink-0 border-b border-border/5 bg-surface-light/50">
        <div className="flex items-center gap-3 px-4 h-12">
          <Wrench size={18} className="text-accent" />
          <h2 className="text-lg font-semibold">通用工具脚本</h2>
        </div>
        <div className="flex items-center justify-center gap-3 px-4 pb-3 flex-wrap">
          <div className="flex items-center gap-2 bg-surface border border-border/5 rounded-xl px-3 py-2">
            <label className="text-[11px] font-semibold text-accent-light whitespace-nowrap">项目ID</label>
            <div className="relative">
              <input
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                placeholder="请输入项目ID"
                className={`w-36 rounded-lg px-3 py-2 pr-7 text-sm font-mono outline-none bg-transparent placeholder:text-muted/30 ${clearingVars ? 'animate-particle-out' : ''}`}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 group">
                <HelpCircle size={13} className="text-muted cursor-help" />
                <span className="pointer-events-none absolute top-full right-0 mt-2 px-3 py-2 bg-foreground text-surface rounded-lg text-[10px] leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg" style={{ width: '200px' }}>
                  查询之后注入APP的变量：<br />
                  projectId = 项目ID<br />
                  projectName = 项目名称<br />
                  partnerPlatformId = 平台ID<br />
                  partnerPlatformName = 平台名称<br />
                  financingPercent = 融资比例<br />
                  productType = 产品类型<br />                  
                </span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-surface border border-border/5 rounded-xl px-3 py-2">
            <label className="text-[11px] font-semibold text-accent-light whitespace-nowrap">证件号</label>
            <div className="relative">
              <input
                value={certNo}
                onChange={e => setCertNo(e.target.value)}
                placeholder="请输入证件号"
                className={`w-44 rounded-lg px-3 py-2 pr-7 text-sm font-mono outline-none bg-transparent placeholder:text-muted/30 ${clearingVars ? 'animate-particle-out' : ''}`}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 group">
                <HelpCircle size={13} className="text-muted cursor-help" />
                <span className="pointer-events-none absolute top-full right-0 mt-2 px-3 py-2 bg-foreground text-surface rounded-lg text-[10px] leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg" style={{ width: '200px' }}>                  
                  企业客户注入APP变量:<br />
                  projectId = 项目ID<br />
                  projectName = 项目名称<br />
                  partnerPlatformId = 平台ID<br />
                  partnerPlatformName = 平台名称<br />
                  enterpriseName = 企业名称<br />
                  socialCreditCode = 企业证件号<br />
                  legalPersonName = 法人名称<br />
                  legalPersonIdCard = 法人证件号<br />
                  phone = 法人手机号<br /><br />
                  个人客户注入APP变量:<br />
                  projectId = 项目ID<br />
                  userName = 个人姓名<br />
                  idCardNo = 个人证件号码<br />
                  phone = 手机号<br />
                  borrowerId = 借款人关联ID<br />
                </span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-surface border border-border/5 rounded-xl px-3 py-2">
            <label className="text-[11px] font-semibold text-accent-light whitespace-nowrap">金额</label>
            <div className="relative">
              <input
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="请输入金额"
                className={`w-32 rounded-lg px-3 py-2 pr-7 text-sm font-mono outline-none bg-transparent placeholder:text-muted/30 ${clearingVars ? 'animate-particle-out' : ''}`}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 group">
                <HelpCircle size={13} className="text-muted cursor-help" />
                <span className="pointer-events-none absolute top-full right-0 mt-2 px-3 py-2 bg-foreground text-surface rounded-lg text-[10px] leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg" style={{ width: '200px' }}>
                  金额(分) = amount<br />
                  给钱包充值时单位则为(元)<br />
                  下游脚本可通过 amount 引用
                </span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-surface border border-border/5 rounded-xl px-3 py-2">
            <label className="text-[11px] font-semibold text-accent-light whitespace-nowrap">多功能</label>
            <div className="relative">
              <input
                value={multiFunc}
                onChange={e => setMultiFunc(e.target.value)}
                placeholder="多功能参数"
                className={`w-32 rounded-lg px-3 py-2 pr-7 text-sm font-mono outline-none bg-transparent placeholder:text-muted/30 ${clearingVars ? 'animate-particle-out' : ''}`}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 group">
                <HelpCircle size={13} className="text-muted cursor-help" />
                <span className="pointer-events-none absolute top-full right-0 mt-2 px-3 py-2 bg-foreground text-surface rounded-lg text-[10px] leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg" style={{ width: '220px' }}>
                  多功能 = multiFunc<br />
                  指定利率 = 本次添加预授信白名单指定标识为是<br />
                  资料采集、停 = 发起企业授信时流程会停止在资料采集环节<br />
                  非无锡 = 发起授信时新建的企业mock地址非无锡，否则就是无锡<br />
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
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-hover/5 hover:bg-hover/10 text-muted hover:text-foreground border border-border/10 transition-all active:scale-95"
            title="清空输入框 · Ctrl+点击清空已注入变量">
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

      <div className="flex-1 flex flex-col overflow-hidden">        <div className="flex-1 overflow-y-auto p-6">
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
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={scripts.map(s => s.path)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-3 gap-3">
                  {scripts.map(script => (
                    <SortableScriptCard
                      key={script.path}
                      script={script}
                      isActive={activeScript?.path === script.path}
                      isRunning={isRunning}
                      onRun={handleRunScript}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* 已注入变量展示 */}
        {Object.keys(globalVars).length > 0 && (
          <div className="shrink-0 px-4 py-2 border-b border-border/5 bg-surface-light/10 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-muted shrink-0">已注入:</span>
            {Object.entries(globalVars).map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 text-[10px]">
                <span className="text-accent font-mono">{k}</span>
                <span className="text-muted">=</span>
                <span className="text-foreground font-mono max-w-[120px] truncate" title={v}>{v || '(空)'}</span>
              </span>
            ))}
          </div>
        )}

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
            <div
              ref={outputContainerRef}
              className={`flex-1 overflow-y-auto p-4 font-mono text-xs text-foreground leading-relaxed whitespace-pre-wrap break-all ${clearingOutput ? 'animate-particle-out' : ''}`}
              dangerouslySetInnerHTML={{
                __html: highlightedHtml || (isRunning ? '<span style="color:rgba(255,255,255,0.4)">等待输出...</span>' : '<span style="color:rgba(255,255,255,0.4)">无输出</span>')
              }}
            />
          </div>
      </div>

      {/* 脚本变量选择弹窗 */}
      {showVarDialog && pendingRun && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center ${closingVarDialog ? 'animate-fade-out' : 'animate-fade-in'}`} style={{ background: 'rgba(0,0,0,0.5)' }}
             onKeyDown={e => { if (e.key === 'Escape') closeVarDialog() }}
             tabIndex={-1} ref={el => el?.focus()}>
          <div className={`bg-surface border border-border/10 rounded-2xl p-6 w-80 shadow-2xl ${closingVarDialog ? 'animate-zoom-out' : 'animate-zoom-in'}`} onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold text-foreground mb-4">{pendingRun.script.name}</p>
            <div className="flex flex-col gap-3">
              {pendingRun.vars
                .filter((v: any) => v.options && v.options.length > 0)
                .map((v: any) => (
                <div key={v.key} className="flex gap-2">
                  {v.options.map((opt: any) => (
                    <button
                      key={opt.value}
                      onClick={() => setDialogValues(prev => ({ ...prev, [v.key]: opt.value }))}
                      className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-medium border transition-all
                        ${dialogValues[v.key] === opt.value
                          ? 'bg-accent/20 border-accent/40 text-foreground'
                          : 'bg-surface-light border-border/10 text-muted hover:border-border/30 hover:text-foreground'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ))}
              {/* 无选项的变量 → 文本输入框 */}
              {pendingRun.vars
                .filter((v: any) => !v.options || v.options.length === 0)
                .map((v: any) => {
                  // 按产品线规则解析注释：逗号前=标签，逗号后=placeholder
                  const cnIdx = v.comment ? v.comment.indexOf('，') : -1
                  const enIdx = v.comment ? v.comment.indexOf(',') : -1
                  const sepIdx = cnIdx === -1 ? enIdx : (enIdx === -1 ? cnIdx : Math.min(cnIdx, enIdx))
                  const commentText = v.comment?.trim() || ''
                  const label = sepIdx !== -1
                    ? commentText.slice(0, sepIdx).trim()
                    : (commentText || v.key)
                  const placeholder = sepIdx !== -1
                    ? commentText.slice(sepIdx + 1).trim()
                    : (commentText ? `请输入${commentText}` : undefined)
                  return (
                <div key={v.key} className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-accent-light">{label}</label>
                  <input
                    value={dialogValues[v.key] ?? v.value}
                    onChange={e => setDialogValues(prev => ({ ...prev, [v.key]: e.target.value }))}
                    placeholder={placeholder || `请输入${v.key}的值`}
                    className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none bg-surface border border-border/5 focus:border-accent/50 placeholder:text-muted/30"
                  />
                </div>
                  )
                })}
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={closeVarDialog}
                className="flex-1 py-1 rounded-lg text-xs text-muted hover:text-foreground hover:bg-hover/5 transition-colors">
                取消
              </button>
              <button
                onClick={handleVarDialogConfirm}
                disabled={pendingRun.vars.some((v: any) =>
                  (!v.options || v.options.length === 0) && !(dialogValues[v.key] ?? v.value)?.trim()
                )}
                className="flex-1 py-1 rounded-lg text-xs font-semibold bg-accent hover:bg-accent/90 text-foreground transition-all
                           disabled:opacity-40 disabled:cursor-not-allowed">
                确认运行
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** 可拖拽排序的脚本卡片 */
function SortableScriptCard({ script, isActive, isRunning, onRun }: {
  script: ScriptItem
  isActive: boolean
  isRunning: boolean
  onRun: (s: ScriptItem) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: script.path })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : transition,
    opacity: isDragging ? 0.85 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={e => {
        if (e.ctrlKey || e.metaKey) return
        onRun(script)
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
                 hover:border-accent/30 hover:bg-accent/5 transition-all text-left group cursor-grab active:cursor-grabbing
                 ${isDragging ? 'shadow-xl border-accent/30' : ''}
                 ${isActive ? 'border-accent/50 bg-accent/5' : ''}
                 disabled:opacity-50 disabled:cursor-not-allowed`}
      title="点击运行 · Ctrl+点击打开文件 · 拖拽排序"
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors
                    ${script.wip
                      ? 'bg-amber-500/10 group-hover:bg-amber-500/20'
                      : isActive && isRunning
                        ? 'bg-green-500/20' : 'bg-green-500/10 group-hover:bg-green-500/20'}`}>
        {isActive && isRunning ? (
          <Loader2 size={20} className={script.wip ? 'text-amber-400 animate-spin' : 'text-green-400 animate-spin'} />
        ) : (
          <Play size={20} className={script.wip ? 'text-amber-400' : 'text-green-400'} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{script.name}</p>
        <p className="text-[11px] text-muted truncate mt-0.5">{script.path}</p>
      </div>
    </button>
  )
}
