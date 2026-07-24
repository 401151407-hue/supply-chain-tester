import React, { useEffect, useState, useRef } from 'react'
import { useAppStore } from '../store'
import { Play, Package, Shield, ClipboardList, Truck, Receipt, ScrollText, Trash2, X, RotateCcw, Edit2 } from 'lucide-react'
import {
  DndContext,
  rectIntersection,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface ScriptVar {
  key: string
  value: string
  comment: string
}

const PRODUCT_NAMES: Record<string, string> = {
  xinerong: '信e融',
  dingerong: '订e融',
  huoerong: '货e融',
  zhangerong: '账e融',
  piaoerong: '票e融',
}

const PRODUCT_ICONS: Record<string, React.ReactNode> = {
  xinerong: <Shield size={20} />,
  dingerong: <ClipboardList size={20} />,
  huoerong: <Truck size={20} />,
  zhangerong: <Receipt size={20} />,
  piaoerong: <ScrollText size={20} />,
}

interface ProductPageProps {
  product: string
  subProduct?: string
}

export function ProductPage({ product, subProduct }: ProductPageProps) {
  const { openScript, env, productVarValues, setProductVarValues, scpExtractedVars } = useAppStore()
  const pageKey = `${product}:${subProduct || ''}`

  // 动态扫描数据
  const [scannedScripts, setScannedScripts] = useState<Record<string, { subProduct: string; scripts: { name: string; path: string }[] }[]> | null>(null)

  useEffect(() => {
    const api = (window as any).supplyChainTester
    if (api?.scanScripts) {
      api.scanScripts().then((data: any) => { if (data) setScannedScripts(data) }).catch(() => {})
    }
  }, [product])

  const allScripts = scannedScripts?.[product] ?? []
  const scripts = subProduct
    ? allScripts.filter(s => s.subProduct === subProduct)
    : allScripts
  const productName = subProduct
    ? `${PRODUCT_NAMES[product] || product} - ${subProduct}`
    : (PRODUCT_NAMES[product] || product)

  // 动态加载变量
  const [scriptVars, setScriptVars] = useState<ScriptVar[]>([])
  const [varValues, setVarValues] = useState<Record<string, string>>({})
  const [clearing, setClearing] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [envSwitchingIn, setEnvSwitchingIn] = useState(false)
  const [deletingVar, setDeletingVar] = useState<string | null>(null)
  // 标记变量是否已从 store 恢复过（避免覆盖用户正在编辑的值）
  const restoredRef = useRef(false)
  // 记录上一次 effect 执行时的 env，用于检测环境变化
  const prevEnvRef = useRef(env)
  // 跟踪动画定时器，避免快速切换导致动画卡住
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ———————————— dnd-kit 排序 ————————————
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  function handleDndDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as string)
  }

  function handleDndDragEnd(e: DragEndEvent) {
    setActiveId(null)
  }

  // 所有脚本扁平列表
  const allFlatScripts = scripts.flatMap(s => s.scripts.map(sc => ({ ...sc, subProduct: s.subProduct })))

  useEffect(() => {
    // 在当前 effect 中同步检测 env 变化（即使上次被取消也能正确检测）
    const envChanged = prevEnvRef.current !== env
    prevEnvRef.current = env

    let cancelled = false
    async function loadVars() {
      const subs = scripts
      if (subs.length === 0) {
        setScriptVars([])
        return
      }

      const api = (window as any).supplyChainTester
      if (!api || typeof api.parseScriptVars !== 'function') {
        setScriptVars([{ key: 'test_key', value: 'test_value', comment: 'API未就绪' }])
        return
      }

      if (envChanged) {
        restoredRef.current = true
        // 清除上一次还没跑完的动画定时器，重置动画状态
        if (animTimerRef.current) {
          clearTimeout(animTimerRef.current)
          animTimerRef.current = null
        }
        setEnvSwitchingIn(false)
      }

      // 解析所有子产品下的所有脚本，合并变量（同名只保留第一个）
      const allVars: ScriptVar[] = []
      const seenKeys = new Set<string>()
      for (const sub of subs) {
        for (const script of sub.scripts) {
        if (cancelled) return
        try {
          const vars: any[] = await api.parseScriptVars(script.path, env)
          if (Array.isArray(vars)) {
            for (const v of vars) {
              if (v.key === 'current_env') continue
              if (seenKeys.has(v.key)) continue
              seenKeys.add(v.key)
              allVars.push(v)
            }
          }
        } catch { /* skip */ }
      }
      }
      if (cancelled) return

      // 优先从 store 恢复用户之前填写的值，否则用脚本默认值
      if (!restoredRef.current) {
        setScriptVars(allVars)
        const saved = productVarValues[pageKey]
        if (saved && Object.keys(saved).length > 0) {
          const restored: Record<string, string> = {}
          for (const v of allVars) {
            restored[v.key] = saved[v.key] ?? v.value
          }
          setVarValues(restored)
        } else {
          const initial: Record<string, string> = {}
          for (const v of allVars) initial[v.key] = v.value
          setVarValues(initial)
        }
        restoredRef.current = true
      } else if (envChanged) {
        // 环境切换：新内容从右推入
        const initial: Record<string, string> = {}
        for (const v of allVars) initial[v.key] = v.value
        setScriptVars(allVars)
        setVarValues(initial)
        setEnvSwitchingIn(true)
        const staggerIn = (allVars.length - 1) * 40 + 250
        animTimerRef.current = setTimeout(() => {
          setEnvSwitchingIn(false)
          animTimerRef.current = null
        }, staggerIn)
      }
    }
    loadVars()
    return () => {
      cancelled = true
      if (animTimerRef.current) {
        clearTimeout(animTimerRef.current)
        animTimerRef.current = null
      }
    }
  }, [subProduct, product, scannedScripts, env])

  // varValues 变化时同步到 store
  useEffect(() => {
    if (restoredRef.current && Object.keys(varValues).length > 0) {
      setProductVarValues(pageKey, varValues)
    }
  }, [varValues, pageKey])

  // 页面 key 变化时重置恢复标记
  useEffect(() => {
    restoredRef.current = false
  }, [pageKey])

  function handleDeleteVar(key: string) {
    setDeletingVar(key)
    setTimeout(() => {
      setScriptVars(prev => prev.filter(v => v.key !== key))
      setVarValues(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      setDeletingVar(null)
    }, 200)
  }

  async function handleRun(scriptName: string, scriptPath: string) {
    let scriptVals = { ...varValues }
    const api = (window as any).supplyChainTester
    if (api?.parseScriptVars) {
      try {
        const parsed = await api.parseScriptVars(scriptPath, env)
        if (Array.isArray(parsed)) {
          const keys = new Set(parsed.map((v: any) => v.key))
          const filtered: Record<string, string> = {}
          for (const k of keys) {
            if (k === 'current_env') {
              filtered[k] = env  // 用侧边栏选择的环境覆盖
            } else if (varValues[k]) {
              filtered[k] = varValues[k]
            }
          }
          scriptVals = filtered
        }
      } catch { /* fallback */ }
    }
    openScript(product, subProduct || '', scriptName, scriptPath, { ...scpExtractedVars, ...scriptVals, env })
  }

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <header className="h-12 flex items-center gap-3 px-4 border-b border-border/5 bg-surface-light/50 shrink-0 drag-region">
        <span className="text-accent">{PRODUCT_ICONS[product] || <Package size={20} />}</span>
        <h2 className="text-lg font-semibold">{productName}</h2>
        <span className="text-xs text-muted">
          {scripts.reduce((sum, s) => sum + s.scripts.length, 0)} 个脚本
        </span>
      </header>

      {/* 脚本列表 - 统一流程管线布局 */}
      <div className="flex-1 overflow-hidden">
        {scripts.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted">
            <div className="text-center">
              <Package size={48} className="mx-auto mb-4 opacity-20" />
              <p className="text-lg">{productName}</p>
              <p className="text-sm mt-1">{subProduct ? '暂无测试脚本' : '暂未添加测试脚本'}</p>
            </div>
          </div>
        ) : (
          <div className="flex h-full overflow-hidden animate-fade-in">
            <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragStart={handleDndDragStart} onDragEnd={handleDndDragEnd}>
            <div className="flex-1 overflow-y-auto p-6">
              <SortableContext items={allFlatScripts.map(s => s.path)} strategy={verticalListSortingStrategy}>
                {allFlatScripts.length === 0 ? (
                  <div className="text-center text-muted/40 text-xs py-4">暂无脚本</div>
                ) : (
                  allFlatScripts.map((s, i) => (
                    <SortableScriptCard
                      key={s.path}
                      script={s}
                      index={i}
                      isLast={i === allFlatScripts.length - 1}
                      onRun={handleRun}
                    />
                  ))
                )}
              </SortableContext>
            </div>
            <DragOverlay>
              {activeId ? (
                <div className="flex items-center gap-4 p-4 rounded-xl bg-surface border border-accent/30 shadow-xl opacity-90">
                  <span className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent-light text-xs font-bold">
                    1
                  </span>
                  <span className="text-sm font-medium text-foreground">{allFlatScripts.find(s => s.path === activeId)?.name || ''}</span>
                  <Play size={16} className="text-muted" />
                </div>
              ) : null}
            </DragOverlay>
            </DndContext>

            {/* 右侧变量面板 */}
            {scriptVars.length > 0 && (
              <aside className="w-64 border-l border-border/5 bg-surface-light/30 p-4 overflow-y-auto shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-medium text-muted uppercase tracking-wider">变量配置</h3>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        // 清除旧的动画定时器
                        if (animTimerRef.current) {
                          clearTimeout(animTimerRef.current)
                          animTimerRef.current = null
                        }
                        const defaults: Record<string, string> = {}
                        for (const v of scriptVars) defaults[v.key] = v.value || ''
                        setVarValues(defaults)
                        setEnvSwitchingIn(true)
                        const staggerIn = (scriptVars.length - 1) * 40 + 250
                        animTimerRef.current = setTimeout(() => {
                          setEnvSwitchingIn(false)
                          animTimerRef.current = null
                        }, staggerIn)
                        setProductVarValues(pageKey, defaults)
                      }}
                      className="text-[10px] text-muted hover:text-foreground transition-colors flex items-center gap-1"
                      title="恢复为脚本中的默认值"
                    >
                      <RotateCcw size={12} /> 默认
                    </button>
                    <button
                      onClick={() => {
                        setClearing(true)
                        const empty: Record<string, string> = {}
                        for (const v of scriptVars) empty[v.key] = ''
                        setTimeout(() => setVarValues(empty), 100)
                        setTimeout(() => {
                          setClearing(false)
                          setProductVarValues(pageKey, empty)
                        }, 220)
                      }}
                      className="text-[10px] text-muted hover:text-foreground transition-colors flex items-center gap-1"
                      title="清空所有变量"
                    >
                      <Trash2 size={12} /> 清空
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  {scriptVars.map((v, idx) => {
                    // 取注释中第一个逗号（中文或英文）前后部分
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
                    <div
                      key={v.key}
                      className={
                        'group/var relative ' +
                        (deletingVar === v.key ? 'animate-swipe-out' : '') +
                        (clearing || restoring ? ' animate-swipe-out' : '') +
                        (envSwitchingIn ? ' animate-curtain-in' : '')
                      }
                      style={envSwitchingIn ? { animationDelay: `${idx * 40}ms` } : undefined}
                    >
                      <label className="text-[10px] text-muted block mb-0.5">{label}</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={varValues[v.key] || ''}
                          onChange={e => setVarValues(prev => ({ ...prev, [v.key]: e.target.value }))}
                          placeholder={placeholder || `请输入${v.key}的值`}
                          className="w-full bg-surface rounded-lg px-2 py-1.5 pr-6 text-xs font-mono outline-none
                                     border border-border/5 focus:border-accent/50 transition-colors
                                     placeholder:text-muted/30"
                        />
                        <button
                          onClick={() => {
                            setDeletingVar(v.key)
                            setVarValues(prev => ({ ...prev, [v.key]: '' }))
                            setTimeout(() => setDeletingVar(null), 250)
                          }}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted/40 hover:text-muted
                                     transition-colors opacity-0 group-hover/var:opacity-100"
                          title="清空此变量"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                    )
                  })}
                </div>
              </aside>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ———————————— 可排序脚本卡片（dnd-kit） ————————————
function SortableScriptCard({ script, index, isLast, onRun }: {
  script: { name: string; path: string; subProduct?: string }
  index: number
  isLast: boolean
  onRun: (name: string, path: string) => void
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
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
    position: isDragging ? 'relative' : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="relative flex items-start">
      {!isLast && (
        <div className="absolute left-5 top-12 bottom-0 w-0.5 bg-accent/30" />
      )}
      <button
        onClick={e => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            const api = (window as any).supplyChainTester
            api?.openPath?.(script.path)
            return
          }
          onRun(script.name, script.path)
        }}
        className={`relative z-10 flex items-center gap-4 w-full mb-3 p-4 rounded-xl
                   border border-border/5 bg-surface-light
                   hover:bg-accent/10 hover:border-accent/30
                   transition-all text-left group cursor-grab active:cursor-grabbing
                   ${isDragging ? 'shadow-xl border-accent/30' : ''}`}
        title="点击运行 · Ctrl+点击打开文件 · 拖拽排序"
      >
        <span className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center
                         text-accent-light text-xs font-bold shrink-0
                         group-hover:bg-accent group-hover:text-foreground transition-colors">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-foreground group-hover:text-accent-light transition-colors">
            {script.name}
          </span>
        </div>
        <Play size={16} className="text-muted group-hover:text-accent-light transition-colors shrink-0" />
      </button>
    </div>
  )
}
