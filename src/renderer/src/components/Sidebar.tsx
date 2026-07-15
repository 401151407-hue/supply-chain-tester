import React, { useState } from 'react'
import { useAppStore } from '../store'
import { UpdateIndicator } from './UpdateIndicator'
import {
  FileEdit,
  BarChart3,
  Package,
  Plus,
  Trash2,
  FolderOpen,
  Sparkles,
  Shield,
  ClipboardList,
  Truck,
  Receipt,
  ScrollText,
  ChevronRight,
  ChevronDown,
  Sun,
  Moon,
  Send,
  RotateCw,
  Bot,
  Wrench,
  Video,
  Wifi,
} from 'lucide-react'

interface SidebarProps {
  onOpenAISettings: () => void
}

export function Sidebar({ onOpenAISettings }: SidebarProps) {
  const {
    activeTab, navigateTo,
    testCases, currentCase, setCurrentCase, deleteCase,
    aiConfig,
    theme, toggleTheme,
    env, setEnv,
    selectedSubProduct,
  } = useAppStore()

  const [xinerongExpanded, setXinerongExpanded] = useState(false)
  const [dingerongExpanded, setDingerongExpanded] = useState(false)
  const [zhangerongExpanded, setZhangerongExpanded] = useState(false)
  const [huoerongExpanded, setHuoerongExpanded] = useState(false)
  const [piaoerongExpanded, setPiaoerongExpanded] = useState(false)
  const [isScanning, setIsScanning] = useState(false)

  const [scannedScripts, setScannedScripts] = useState<Record<string, { subProduct: string; scripts: { name: string; path: string }[] }[]> | null>(null)

  async function handleRefresh() {
    setIsScanning(true)
    setXinerongExpanded(false); setDingerongExpanded(false); setZhangerongExpanded(false)
    setHuoerongExpanded(false); setPiaoerongExpanded(false)
    // 触发页面动画，保留当前子产品选择
    useAppStore.getState().navigateTo(useAppStore.getState().activeTab, useAppStore.getState().selectedSubProduct)
    // 清空所有脚本运行输出
    useAppStore.getState().clearAllScriptRunStates()
    const api = (window as any).supplyChainTester
    if (api?.scanScripts) {
      try { const data = await api.scanScripts(); if (data) setScannedScripts(data) } catch {}
    }
    setIsScanning(false)
  }

  React.useEffect(() => { handleRefresh() }, [])

  const getSubProducts = (key: string) => {
    const entries = scannedScripts?.[key]
    if (!entries || entries.length === 0) return []
    return entries.map(e => e.subProduct)
  }

  const isXinerongActive = activeTab === 'xinerong' || (activeTab === 'script' && useAppStore.getState().scriptParams?.product === 'xinerong')
  const isDingerongActive = activeTab === 'dingerong' || (activeTab === 'script' && useAppStore.getState().scriptParams?.product === 'dingerong')
  const isZhangerongActive = activeTab === 'zhangerong'
  const isHuoerongActive = activeTab === 'huoerong' || (activeTab === 'script' && useAppStore.getState().scriptParams?.product === 'huoerong')
  const isPiaoerongActive = activeTab === 'piaoerong' || (activeTab === 'script' && useAppStore.getState().scriptParams?.product === 'piaoerong')

  React.useEffect(() => { if (isXinerongActive) setXinerongExpanded(true) }, [isXinerongActive])
  React.useEffect(() => { if (isDingerongActive) setDingerongExpanded(true) }, [isDingerongActive])
  React.useEffect(() => { if (isZhangerongActive) setZhangerongExpanded(true) }, [isZhangerongActive])
  React.useEffect(() => { if (isHuoerongActive) setHuoerongExpanded(true) }, [isHuoerongActive])
  React.useEffect(() => { if (isPiaoerongActive) setPiaoerongExpanded(true) }, [isPiaoerongActive])

  return (
    <aside className="w-60 bg-surface-light border-r border-border/5 flex flex-col select-none">
      {/* Logo */}
      <div className="h-12 flex items-center gap-2 px-4 border-b border-border/5 drag-region mt-7">
        <Package size={20} className="text-accent" />
        <span className="font-semibold text-sm tracking-wide flex-1">测易融</span>
        <button onClick={handleRefresh} disabled={isScanning}
          className="no-drag p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-hover/10 transition-colors disabled:opacity-50" title="刷新产品线">
          <RotateCw size={15} className={isScanning ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* 可滚动内容区：导航 + 用例列表 */}
      <div className="flex-1 overflow-y-auto">

      {/* 产品导航 */}
      <div className="px-3 py-3 border-b border-border/5">
        <span className="text-[10px] uppercase tracking-widest text-muted px-2 mb-2 block">
          产品线
        </span>
        <nav className="space-y-0.5">
          {/* 信e融 — 动态子菜单 */}
          {getSubProducts('xinerong').length > 0 ? (<>
            <NavItem icon={<Shield size={18} />} label="信e融"
              active={isXinerongActive}
              onClick={() => setXinerongExpanded(!xinerongExpanded)}
              suffix={xinerongExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            />
            {xinerongExpanded && (
              <div className="ml-4 border-l border-border/10 pl-2 space-y-0.5">
                {getSubProducts('xinerong').map(sub => (
                  <NavItem key={sub} label={sub} active={activeTab === 'xinerong' && selectedSubProduct === sub} onClick={() => navigateTo('xinerong', sub)} compact />
                ))}
              </div>
            )}
          </>) : (
            <NavItem icon={<Shield size={18} />} label="信e融" active={isXinerongActive} onClick={() => navigateTo('xinerong')} />
          )}

          {/* 订e融 — 动态子菜单 */}
          {getSubProducts('dingerong').length > 0 ? (<>
            <NavItem icon={<ClipboardList size={18} />} label="订e融"
              active={isDingerongActive}
              onClick={() => setDingerongExpanded(!dingerongExpanded)}
              suffix={dingerongExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            />
            {dingerongExpanded && (
              <div className="ml-4 border-l border-border/10 pl-2 space-y-0.5">
                {getSubProducts('dingerong').map(sub => (
                  <NavItem key={sub} label={sub} active={activeTab === 'dingerong' && selectedSubProduct === sub} onClick={() => navigateTo('dingerong', sub)} compact />
                ))}
              </div>
            )}
          </>) : (
            <NavItem icon={<ClipboardList size={18} />} label="订e融" active={isDingerongActive} onClick={() => navigateTo('dingerong')} />
          )}

          {/* 货e融 — 动态子菜单 */}
          {getSubProducts('huoerong').length > 0 ? (<>
            <NavItem icon={<Truck size={18} />} label="货e融"
              active={isHuoerongActive}
              onClick={() => setHuoerongExpanded(!huoerongExpanded)}
              suffix={huoerongExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            />
            {huoerongExpanded && (
              <div className="ml-4 border-l border-border/10 pl-2 space-y-0.5">
                {getSubProducts('huoerong').map(sub => (
                  <NavItem key={sub} label={sub} active={activeTab === 'huoerong' && selectedSubProduct === sub} onClick={() => navigateTo('huoerong', sub)} compact />
                ))}
              </div>
            )}
          </>) : (
            <NavItem icon={<Truck size={18} />} label="货e融" active={activeTab === 'huoerong'} onClick={() => navigateTo('huoerong')} />
          )}

          {/* 账e融 — 动态子菜单 */}
          {getSubProducts('zhangerong').length > 0 ? (<>
            <NavItem icon={<Receipt size={18} />} label="账e融"
              active={isZhangerongActive}
              onClick={() => setZhangerongExpanded(!zhangerongExpanded)}
              suffix={zhangerongExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            />
            {zhangerongExpanded && (
              <div className="ml-4 border-l border-border/10 pl-2 space-y-0.5">
                {getSubProducts('zhangerong').map(sub => (
                  <NavItem key={sub} label={sub} active={activeTab === 'zhangerong' && selectedSubProduct === sub} onClick={() => navigateTo('zhangerong', sub)} compact />
                ))}
              </div>
            )}
          </>) : (
            <NavItem icon={<Receipt size={18} />} label="账e融" active={activeTab === 'zhangerong'} onClick={() => navigateTo('zhangerong')} />
          )}

          {/* 票e融 — 动态子菜单 */}
          {getSubProducts('piaoerong').length > 0 ? (<>
            <NavItem icon={<ScrollText size={18} />} label="票e融"
              active={isPiaoerongActive}
              onClick={() => setPiaoerongExpanded(!piaoerongExpanded)}
              suffix={piaoerongExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            />
            {piaoerongExpanded && (
              <div className="ml-4 border-l border-border/10 pl-2 space-y-0.5">
                {getSubProducts('piaoerong').map(sub => (
                  <NavItem key={sub} label={sub} active={activeTab === 'piaoerong' && selectedSubProduct === sub} onClick={() => navigateTo('piaoerong', sub)} compact />
                ))}
              </div>
            )}
          </>) : (
            <NavItem icon={<ScrollText size={18} />} label="票e融" active={activeTab === 'piaoerong'} onClick={() => navigateTo('piaoerong')} />
          )}
        </nav>
      </div>

      {/* 工具导航 */}
      <nav className="px-3 py-3 space-y-0.5">
        <NavItem icon={<Video size={18} />} label="Playwright" active={activeTab === 'recorder'} onClick={() => navigateTo('recorder')} />
        <NavItem icon={<Wifi size={18} />} label="API 录制" active={activeTab === 'apirecorder'} onClick={() => navigateTo('apirecorder')} />
        <NavItem icon={<Wrench size={18} />} label="通用" active={activeTab === 'utils'} onClick={() => navigateTo('utils')} />
        <NavItem icon={<Send size={18} />} label="API 调试" active={activeTab === 'apidebug'} onClick={() => navigateTo('apidebug')} />
        <NavItem icon={<FileEdit size={18} />} label="测试用例" active={activeTab === 'editor'} onClick={() => navigateTo('editor')} />
        <NavItem icon={<BarChart3 size={18} />} label="测试报告" active={activeTab === 'reports'} onClick={() => navigateTo('reports')} />
      </nav>

      {/* 测试用例列表 */}
      <div className="px-3 py-2 border-t border-border/5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted">用例列表</span>
          <button
            onClick={createNewCase}
            className="p-1 rounded hover:bg-hover/10 text-muted hover:text-foreground transition-colors"
            title="新建用例"
          >
            <Plus size={14} />
          </button>
        </div>

        {testCases.length === 0 ? (
          <p className="text-xs text-muted text-center py-6">
            暂无测试用例，点击 + 新建
          </p>
        ) : (
          testCases.map(tc => (
            <div
              key={tc.id}
              onClick={() => {
                setCurrentCase(tc)
                navigateTo('editor')
              }}
              className={`
                group flex items-center gap-2 px-3 py-2 mb-0.5 rounded-md cursor-pointer
                text-sm transition-colors
                ${currentCase?.id === tc.id
                  ? 'bg-accent/20 text-foreground'
                  : 'text-muted hover:bg-hover/5 hover:text-foreground'
                }
              `}
            >
              <span className="truncate flex-1">{tc.name}</span>
              <span className={`
                text-[10px] px-1.5 py-0.5 rounded
                ${tc.type === 'api' ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'}
              `}>
                {tc.type === 'api' ? 'API' : '流程'}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm('确定删除此测试用例？')) {
                    deleteCase(tc.id)
                  }
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/20 text-muted hover:text-red-400 transition-all"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>
      </div>

      {/* 底部 */}
      <div className="px-3 py-3 border-t border-border/5 space-y-1">
        {/* 主题切换 */}
        <button
          onClick={toggleTheme}
          className="relative flex items-center w-full h-8 rounded-lg bg-hover/5 p-0.5
                     hover:bg-hover/10 transition-colors group"
          title={theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式'}
        >
          {/* 滑动高亮块 */}
          <span
            className={`absolute top-0.5 h-7 w-[calc(50%-2px)] rounded-md
                       bg-accent shadow-sm transition-transform duration-300 ease-out
                       ${theme === 'dark' ? 'translate-x-0' : 'translate-x-full'}`}
          />
          {/* 黑夜 */}
          <span className={`relative flex-1 flex items-center justify-center gap-1 text-xs z-10
                           transition-colors duration-300
                           ${theme === 'dark' ? 'text-foreground' : 'text-muted'}`}>
            <Moon size={13} />
            <span className="tracking-wide">黑夜</span>
          </span>
          {/* 白天 */}
          <span className={`relative flex-1 flex items-center justify-center gap-1 text-xs z-10
                           transition-colors duration-300
                           ${theme === 'light' ? 'text-foreground' : 'text-muted'}`}>
            <Sun size={13} />
            <span className="tracking-wide">白天</span>
          </span>
        </button>
        {/* 环境切换 */}
        <div className={`relative flex items-center w-full h-8 rounded-lg bg-hover/5 p-0.5
                         ${activeTab === 'script' ? 'opacity-40 pointer-events-none' : ''}`}>
          <span
            className={`absolute top-0.5 h-7 w-[calc(33.33%-3px)] rounded-md
                       bg-accent shadow-sm transition-transform duration-300 ease-out
                       ${env === 'DEV' ? 'translate-x-0' : env === 'SIT' ? 'translate-x-full' : 'translate-x-[200%]'}`}
          />
          <button onClick={() => setEnv('DEV')}
            className={`relative flex-1 flex items-center justify-center text-xs z-10 transition-colors duration-300
                         ${env === 'DEV' ? 'text-foreground' : 'text-muted hover:text-foreground'}`}>
            <span className="tracking-wide font-mono">DEV</span>
          </button>
          <button onClick={() => setEnv('SIT')}
            className={`relative flex-1 flex items-center justify-center text-xs z-10 transition-colors duration-300
                         ${env === 'SIT' ? 'text-foreground' : 'text-muted hover:text-foreground'}`}>
            <span className="tracking-wide font-mono">SIT</span>
          </button>
          <button onClick={() => setEnv('UAT')}
            className={`relative flex-1 flex items-center justify-center text-xs z-10 transition-colors duration-300
                         ${env === 'UAT' ? 'text-foreground' : 'text-muted hover:text-foreground'}`}>
            <span className="tracking-wide font-mono">UAT</span>
          </button>
        </div>
        <button
          onClick={onOpenAISettings}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs
                     hover:bg-purple-500/10 transition-colors"
        >
          <Sparkles size={14} className={aiConfig?.enabled ? 'text-purple-400' : 'text-muted'} />
          <span className={aiConfig?.enabled ? 'text-purple-300' : 'text-muted'}>
            AI 算力{aiConfig?.enabled ? ' ✓' : ''}
          </span>
        </button>
        <button
          onClick={() => navigateTo('aiassistant')}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs
                     hover:bg-purple-500/10 transition-colors"
        >
          <Bot size={14} className={aiConfig?.enabled ? 'text-purple-400' : 'text-muted'} />
          <span className={aiConfig?.enabled ? 'text-purple-300' : 'text-muted'}>
            AI 助手
          </span>
        </button>
        <button
          onClick={openFolder}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-muted
                     hover:bg-hover/5 hover:text-foreground transition-colors"
        >
          <FolderOpen size={14} />
          打开脚本目录
        </button>

        <div className="border-t border-border/5 pt-1.5 mt-1.5">
          <UpdateIndicator />
        </div>
      </div>
    </aside>
  )
}

function NavItem({ icon, label, active, onClick, suffix, compact }: {
  icon?: React.ReactNode; label: string; active: boolean; onClick: () => void
  suffix?: React.ReactNode; compact?: boolean
}) {
  return (
    <button onClick={onClick} className={`
        flex items-center gap-2 w-full rounded-lg text-sm font-medium transition-colors
        ${active ? 'bg-accent/20 text-accent-light' : 'text-muted hover:bg-hover/5 hover:text-foreground'}
        ${compact ? 'px-2 py-1.5 text-xs' : 'px-3 py-2'}
      `}>
      {icon}<span className="flex-1 text-left">{label}</span>{suffix}
    </button>
  )
}

function createNewCase() {
  const { setCurrentCase, navigateTo } = useAppStore.getState()
  const newCase = {
    id: crypto.randomUUID(),
    type: 'api' as const,
    name: '新建测试用例',
    description: '',
    tags: [],
    steps: [],
    variables: {},
    status: 'draft' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  setCurrentCase(newCase)
  navigateTo('editor')
}

function openFolder() {
  const api = (window as any).supplyChainTester
  if (api?.openScriptsFolder) {
    api.openScriptsFolder().catch(() => {})
  }
}
