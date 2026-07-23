import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useAppStore } from '../store'
import { Play, Package, Shield, ClipboardList, Truck, Receipt, ScrollText, Settings, ChevronDown, Trash2, X, RotateCcw, Edit2 } from 'lucide-react'
import {
  DndContext,
  rectIntersection,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
  useDroppable,
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

  // ———————————— 脚本分组 ————————————
  interface Group { id: string; name: string }
  const GROUP_STORAGE_KEY = `script-groups-${product}-${subProduct || ''}`
  const [groups, setGroups] = useState<Group[]>(() => {
    try {
      const saved = localStorage.getItem(GROUP_STORAGE_KEY)
      if (saved) return JSON.parse(saved)
    } catch {}
    return [{ id: 'default', name: '默认分组' }]
  })
  const [scriptGroupMap, setScriptGroupMap] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(GROUP_STORAGE_KEY + '-map')
      if (saved) return JSON.parse(saved)
    } catch {}
    return {}
  })
  const [editGroupName, setEditGroupName] = useState('')

  // 持久化分组
  const persistGroups = useCallback((g: Group[], m: Record<string, string>) => {
    setGroups(g)
    setScriptGroupMap(m)
    localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(g))
    localStorage.setItem(GROUP_STORAGE_KEY + '-map', JSON.stringify(m))
  }, [GROUP_STORAGE_KEY])

  // 给新脚本自动分配分组
  const ensureScriptGroup = useCallback((scriptPath: string, currentMap: Record<string, string>, currentGroups: Group[]) => {
    if (currentMap[scriptPath]) return currentMap
    const defaultGroup = currentGroups[0]?.id || 'default'
    return { ...currentMap, [scriptPath]: defaultGroup }
  }, [])

  // 当脚本列表变化时，确保所有脚本都有分组
  const allFlatScripts = scripts.flatMap(s => s.scripts.map(sc => ({ ...sc, subProduct: s.subProduct })))
  useEffect(() => {
    let map = { ...scriptGroupMap }
    let changed = false
    for (const s of allFlatScripts) {
      if (!map[s.path]) {
        map[s.path] = groups[0]?.id || 'default'
        changed = true
      }
    }
    if (changed) persistGroups(groups, map)
  }, [allFlatScripts.length])

  // ———————————— dnd-kit 跨组拖拽 ————————————
  const [activeId, setActiveId] = useState<string | null>(null)
  const activeGroupRef = useRef<string>('default')
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  function handleDndDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as string)
    activeGroupRef.current = scriptGroupMap[e.active.id as string] || 'default'
  }

  function handleDndDragOver(e: DragOverEvent) {
    const { active, over } = e
    if (!over) return
    const srcGroup = activeGroupRef.current
    const overId = over.id as string
    if (overId.startsWith('group-')) {
      const dstGroup = overId.replace('group-', '')
      if (srcGroup !== dstGroup) {
        const newMap = { ...scriptGroupMap, [active.id as string]: dstGroup }
        setScriptGroupMap(newMap)
        activeGroupRef.current = dstGroup
      }
    }
  }

  function handleDndDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over) return

    const overId = over.id as string

    // 跨组移动：已在 onDragOver 中处理，此处仅持久化
    if (overId.startsWith('group-')) {
      localStorage.setItem(GROUP_STORAGE_KEY + '-map', JSON.stringify(scriptGroupMap))
      return
    }

    // 同组内排序（目前 ProductPage 不需要脚本级别的排序，仅做占位）
  }

  function handleAddGroup() {
    const newId = `group-${Date.now()}`
    const newGroup: Group = { id: newId, name: `新分组 ${groups.length + 1}` }
    persistGroups([...groups, newGroup], scriptGroupMap)
  }

  function startRename(groupId: string, currentName: string) {
    setEditingGroupId(groupId)
    setEditGroupName(currentName)
  }

  function finishRename(groupId: string) {
    if (editGroupName.trim()) {
      const newGroups = groups.map(g => g.id === groupId ? { ...g, name: editGroupName.trim() } : g)
      persistGroups(newGroups, scriptGroupMap)
    }
    setEditingGroupId(null)
    setEditGroupName('')
  }

  function handleDeleteGroup(groupId: string) {
    if (groups.length <= 1) return
    const defaultId = groups[0].id === groupId ? groups[1]?.id || 'default' : groups[0].id
    const newMap = { ...scriptGroupMap }
    for (const key of Object.keys(newMap)) {
      if (newMap[key] === groupId) newMap[key] = defaultId
    }
    const newGroups = groups.filter(g => g.id !== groupId)
    persistGroups(newGroups, newMap)
  }

  // 分组下的脚本（按 scripts 原始顺序排列）
  function getGroupScripts(groupId: string) {
    return allFlatScripts.filter(s => (scriptGroupMap[s.path] || groups[0]?.id) === groupId)
  }

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
            <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragStart={handleDndDragStart} onDragOver={handleDndDragOver} onDragEnd={handleDndDragEnd}>
            <div className="flex-1 overflow-y-auto p-6">
              {/* 分组列表 */}
              {groups.map(group => {
                const groupScripts = getGroupScripts(group.id)
                const groupPaths = groupScripts.map(s => s.path)
                return (
                  <GroupContainer key={group.id} groupId={group.id} className="mb-6">
                    {/* 分组头 — 浅浅的分隔线 + 可编辑名称 */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex-1 h-px bg-border/20" />
                      {editingGroupId === group.id ? (
                        <input
                          autoFocus
                          value={editGroupName}
                          onChange={e => setEditGroupName(e.target.value)}
                          onBlur={() => finishRename(group.id)}
                          onKeyDown={e => { if (e.key === 'Enter') finishRename(group.id); if (e.key === 'Escape') setEditingGroupId(null) }}
                          className="text-xs font-medium text-muted bg-transparent border-b border-accent/50 outline-none px-1 text-center min-w-[80px]"
                        />
                      ) : (
                        <span className="group/name flex items-center gap-1">
                          <span
                            className="text-xs font-medium text-muted cursor-pointer hover:text-foreground transition-colors select-none whitespace-nowrap"
                            onDoubleClick={() => startRename(group.id, group.name)}
                            title="双击修改分组名称"
                          >
                            {group.name}
                          </span>
                          {groups.length > 1 && group.id !== groups[0].id && (
                            <button
                              onClick={() => handleDeleteGroup(group.id)}
                              className="text-muted/40 hover:text-red-400 transition-opacity opacity-0 group-hover/name:opacity-100"
                              title="删除分组，脚本移回默认分组"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </span>
                      )}
                      <div className="flex-1 h-px bg-border/20" />
                    </div>

                    {/* 分组内脚本 */}
                    <SortableContext items={groupPaths} strategy={verticalListSortingStrategy}>
                      {groupScripts.length === 0 && groups.length === 1 ? (
                        <div className="text-center text-muted/40 text-xs py-4">暂无脚本</div>
                      ) : groupScripts.length === 0 ? (
                        <p className="text-center text-muted/40 text-xs py-4">拖入脚本</p>
                      ) : (
                        groupScripts.map((s, i) => (
                          <SortableScriptCard
                            key={s.path}
                            script={s}
                            index={i}
                            isLast={i === groupScripts.length - 1}
                            onRun={handleRun}
                          />
                        ))
                      )}
                    </SortableContext>
                  </GroupContainer>
                )
              })}
              <div className="flex justify-center mt-4">
                <button
                  onClick={handleAddGroup}
                  className="text-xs text-muted hover:text-foreground transition-colors flex items-center gap-1 py-1 px-3 rounded hover:bg-surface-light"
                >
                  + 添加分组
                </button>
              </div>
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

// 可拖放分组容器
function GroupContainer({ groupId, children, className }: { groupId: string; children: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `group-${groupId}` })
  return (
    <div ref={setNodeRef} className={`${className || ''} ${isOver ? 'ring-2 ring-accent/30 rounded-lg' : ''}`}>
      {children}
    </div>
  )
}
