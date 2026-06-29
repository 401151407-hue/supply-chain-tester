import React, { useEffect, useState, useRef } from 'react'
import { flushSync } from 'react-dom'
import { Play, Loader2, Terminal, FileCode, AlertTriangle, ExternalLink, CheckCircle2, ArrowLeft, Square } from 'lucide-react'
import { useAppStore } from '../store'
import { highlightOutput } from '../utils/highlight'

/** 从脚本输出中提取 !!key: value 和 !!-key: value 格式的变量 */
function extractScpVars(output: string): Record<string, string> {
  const vars: Record<string, string> = {}
  const lines = output.split('\n')
  for (const line of lines) {
    const m = line.match(/^[!！]{2}-?\s*([^\s:：]+)\s*[：:]\s*(.+)$/)
    if (m) {
      vars[m[1].trim()] = m[2].trim()
    }
  }
  return vars
}

interface ScriptRunnerProps {
  scriptPath: string
  scriptName: string
  vars?: Record<string, string>
}

export function ScriptRunner({ scriptPath, scriptName, vars }: ScriptRunnerProps) {
  const { scriptParams, env, scriptRunStates, setScriptRunState, clearScriptRunState } = useAppStore()
  const runState = scriptRunStates[scriptPath] || { output: '', isRunning: false, hasRun: false }
  const output = runState.output
  const isRunning = runState.isRunning
  const hasRun = runState.hasRun
  const [pythonStatus, setPythonStatus] = useState<'checking' | 'available' | 'unavailable'>('checking')
  const [pythonVersion, setPythonVersion] = useState<string>('')
  const [pythonHint, setPythonHint] = useState<string>('')
  const [basePath, setBasePath] = useState<string>('')
  const [clearing, setClearing] = useState(false)
  const [knownKeys, setKnownKeys] = useState<string[]>([])
  const outputRef = useRef('')
  const sep = (window as any).supplyChainTester?.pathSep ?? '\\'

  // 解析当前脚本的可配置变量名，用于输出高亮
  useEffect(() => {
    const api = (window as any).supplyChainTester
    if (api?.parseScriptVars) {
      api.parseScriptVars(scriptPath).then((parsed: any[]) => {
        if (Array.isArray(parsed)) {
          const keys = parsed
            .filter((v: any) => v.key && v.key !== 'current_env')
            .map((v: any) => v.key as string)
          setKnownKeys(keys)
        }
      }).catch(() => {})
    }
  }, [scriptPath])

  // 对输出做高亮处理
  const varValues = Object.entries(vars || {})
    .filter(([k]) => k !== 'env' && k !== 'current_env')
    .map(([, v]) => v)
    .filter(Boolean) as string[]
  const highlightedHtml = output ? highlightOutput(output, knownKeys, varValues) : ''

  useEffect(() => {
    checkPython()
    const api = (window as any).supplyChainTester
    if (api?.getScriptsPath) {
      api.getScriptsPath().then((p: string) => setBasePath(p))
    }
  }, [])

  function handleBack() {
    if (scriptParams?.product) {
      useAppStore.getState().navigateTo(scriptParams.product as any, scriptParams.subProduct || null)
    } else {
      useAppStore.getState().navigateTo('editor')
    }
  }

  useEffect(() => {
    checkPython()
  }, [])

  async function checkPython() {
    setPythonStatus('checking')
    try {
      const api = (window as any).supplyChainTester
      if (!api) {
        setPythonStatus('unavailable')
        setPythonHint('无法连接到后端服务')
        return
      }
      const result = await api.checkPython()
      if (result.available) {
        setPythonStatus('available')
        setPythonVersion(result.version || '')
      } else {
        setPythonStatus('unavailable')
        setPythonHint(result.hint || '未检测到 Python')
      }
    } catch {
      setPythonStatus('unavailable')
      setPythonHint('检测失败，请确认 Python 已安装')
    }
  }

  async function handleRun() {
    if (isRunning) return

    const api = (window as any).supplyChainTester
    if (!api) {
      setScriptRunState(scriptPath, { output: '❌ 无法连接到后端服务', hasRun: true })
      return
    }

    // 获取当前脚本需要的变量列表，只检查这些变量
    let requiredKeys: string[] = []
    const varComments: Record<string, string> = {}
    if (api.parseScriptVars) {
      try {
        const parsed = await api.parseScriptVars(scriptPath)
        if (Array.isArray(parsed)) {
          for (const v of parsed) {
            if (v.key === 'current_env') continue
            requiredKeys.push(v.key)
            // 取注释第一个逗号前的内容作为显示名
            if (v.comment) {
              const cnIdx = v.comment.indexOf('，')
              const enIdx = v.comment.indexOf(',')
              const sepIdx = cnIdx === -1 ? enIdx : (enIdx === -1 ? cnIdx : Math.min(cnIdx, enIdx))
              varComments[v.key] = sepIdx !== -1 ? v.comment.slice(0, sepIdx).trim() : v.comment.trim()
            }
          }
        }
      } catch { /* ignore parse errors */ }
    }

    // 检查必填变量
    if (requiredKeys.length > 0) {
      const emptyVars: string[] = []
      for (const k of requiredKeys) {
        const val = vars?.[k]
        if (!val || val.trim() === '') emptyVars.push(k)
      }
      if (emptyVars.length > 0) {
        const lines = emptyVars.map(v => {
          const label = varComments[v] || v
          return label === v ? `  • ${v}` : `  • ${v} (${label})`
        })
        setScriptRunState(scriptPath, { output: `❌ 以下变量未填写，请先配置：\n${lines.join('\n')}`, hasRun: true })
        return
      }
    }

    setScriptRunState(scriptPath, { isRunning: true, output: output ? output + '\n' + '─'.repeat(60) + '\n' : '', hasRun: true })
    outputRef.current = output ? output + '\n' + '─'.repeat(60) + '\n' : ''

    // 注册流式输出监听
    const unsubOutput = api.onScriptOutput?.((chunk: string) => {
      outputRef.current += chunk
      const displayText = outputRef.current.split('\n').filter(l => !l.match(/^[!！]{2}/)).join('\n')
      flushSync(() => {
        setScriptRunState(scriptPath, { output: displayText })
      })
    })
    const unsubDone = api.onScriptDone?.((result: { ok: boolean }) => {
      if (!result.ok) {
        outputRef.current += '\n❌ 脚本执行失败'
        setScriptRunState(scriptPath, { output: outputRef.current, isRunning: false })
      } else {
        // 从输出中提取 !!key: value 变量
        const extracted = extractScpVars(outputRef.current)
        if (Object.keys(extracted).length > 0) {
          useAppStore.getState().mergeScpExtractedVars(extracted)
        }
        setScriptRunState(scriptPath, { isRunning: false })
      }
      unsubOutput?.()
      unsubDone?.()
    })

    try {
      await api.runScript(scriptPath, { ...vars, current_env: env, env })
    } catch (err: any) {
      outputRef.current += `\n❌ 执行出错: ${err.message || err}`
      setScriptRunState(scriptPath, { output: outputRef.current, isRunning: false })
      unsubOutput?.()
      unsubDone?.()
    }
  }

  async function handleStop() {
    const api = (window as any).supplyChainTester
    if (api?.stopScript) {
      await api.stopScript()
    }
    setScriptRunState(scriptPath, { isRunning: false, output: output + '\n⏹ 脚本已被用户停止' })
  }

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <header className="h-12 flex items-center gap-3 px-4 border-b border-border/5 bg-surface-light/50 shrink-0 drag-region">
        <button
          onClick={handleBack}
          className="no-drag p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-hover/10 transition-colors"
          title="返回脚本列表"
        >
          <ArrowLeft size={18} />
        </button>
        <FileCode size={18} className="text-accent" />
        <h2 className="text-lg font-semibold">{scriptName}</h2>
        <span className="text-xs text-muted font-mono ml-auto truncate" title={basePath ? `${basePath}${sep}${scriptPath}` : scriptPath}>
          {basePath ? `${basePath}${sep}${scriptPath}` : scriptPath}
        </span>
      </header>

      {/* 变量信息 */}
      {vars && Object.keys(vars).length > 0 && (
        <div className="px-4 py-2 border-b border-border/5 bg-surface-light/10 flex flex-wrap gap-x-4 gap-y-1">
          {Object.entries({ ...vars, current_env: env }).filter(([k]) => k !== 'env').map(([k, v]) => (
            <span key={k} className="text-xs">
              <span className="text-muted">{k === 'env' || k === 'current_env' ? '当前环境' : k}: </span>
              <span className="text-foreground font-mono">{k === 'current_env' ? env : v}</span>
            </span>
          ))}
        </div>
      )}

      {/* 操作栏 */}
      <div className="px-4 py-3 border-b border-border/5 bg-surface-light/20 flex items-center gap-3">
        <button
          onClick={handleRun}
          disabled={isRunning || pythonStatus !== 'available'}
          className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold
                     bg-accent hover:bg-accent-light text-foreground active:scale-95
                     disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
        >
          {isRunning ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              执行中...
            </>
          ) : (
            <>
              <Play size={16} />
              运行脚本
            </>
          )}
        </button>
        {isRunning && (
          <button onClick={handleStop}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold
                       bg-danger/20 hover:bg-danger/30 text-danger active:scale-95 transition-all duration-150"
          >
            <Square size={14} />
            停止运行
          </button>
        )}

        {/* Python 状态 */}
        {pythonStatus === 'checking' && (
          <span className="flex items-center gap-1 text-xs text-muted">
            <Loader2 size={12} className="animate-spin" /> 检测 Python...
          </span>
        )}
        {pythonStatus === 'available' && (
          <span className="flex items-center gap-1 text-xs text-success">
            <CheckCircle2 size={12} /> {pythonVersion}
          </span>
        )}
        {pythonStatus === 'unavailable' && (
          <span className="flex items-center gap-1 text-xs text-danger">
            <AlertTriangle size={12} /> Python 不可用
          </span>
        )}
      </div>

      {/* Python 不可用时显示安装引导 */}
      {pythonStatus === 'unavailable' && (
        <div className="px-4 py-4 border-b border-border/5 bg-danger/5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-danger shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-danger">未检测到 Python 环境</p>
              <p className="text-xs text-muted">{pythonHint}</p>
              <p className="text-[11px] text-muted leading-relaxed">
                💡 方式一：安装系统 Python — 前往官网下载，勾选「Add Python to PATH」
              </p>
              <p className="text-[11px] text-muted leading-relaxed">
                📦 方式二：使用内置便携版（无需安装）— 在项目目录运行：
                <code className="block mt-1 px-2 py-1 bg-surface rounded text-xs font-mono">
                  npm run setup-python
                </code>
              </p>
              <a
                href="https://www.python.org/downloads/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-accent-light hover:text-accent transition-colors"
              >
                <ExternalLink size={12} />
                前往 Python 官网下载安装 →
              </a>
              <p className="text-[11px] text-muted leading-relaxed">
                💡 安装时请务必勾选 <strong>「Add Python to PATH」</strong>，安装完成后重启本应用即可。
              </p>
              <button
                onClick={checkPython}
                className="text-xs text-accent-light hover:text-accent transition-colors"
              >
                重新检测
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 输出区 */}
      <div className="flex-1 flex flex-col overflow-hidden p-4">
        {!hasRun ? (
          <div className="flex items-center justify-center h-full text-muted">
            <div className="text-center">
              <Terminal size={48} className="mx-auto mb-4 opacity-20" />
              <p className="text-sm">点击"运行脚本"开始执行</p>
              <p className="text-xs mt-1">Python 脚本输出将显示在下方</p>
            </div>
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-border/5 overflow-hidden flex flex-col">
            <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border/5 bg-surface-light/50">
              <Terminal size={14} className="text-muted" />
              <span className="text-xs text-muted font-mono flex-1">
                {isRunning ? '正在执行...' : '执行输出'}
              </span>
              <button
                onClick={async () => {
                  if (isRunning) {
                    const api = (window as any).supplyChainTester
                    await api?.stopScript?.()
                  }
                  setClearing(true)
                  setTimeout(() => { clearScriptRunState(scriptPath); setClearing(false) }, 220)
                }}
                className="text-[10px] text-muted hover:text-foreground transition-colors"
                title="清空输出"
              >
                清空
              </button>
            </div>
            <pre
              className={`flex-1 overflow-y-auto p-4 text-sm font-mono text-foreground whitespace-pre-wrap break-all overflow-x-auto ${clearing ? 'animate-particle-out' : ''}`}
              dangerouslySetInnerHTML={{
                __html: highlightedHtml || (isRunning ? '<span style="color:rgba(255,255,255,0.4)">等待输出...</span>' : '')
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
