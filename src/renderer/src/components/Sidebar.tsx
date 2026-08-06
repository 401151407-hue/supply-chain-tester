import React, { useState, useEffect } from 'react'
import { useAppStore } from '../store'
import { UpdateIndicator } from './UpdateIndicator'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { Tip } from '../lib/Tip'
import {
  FileEdit,
  BarChart3,
  Package,
  FolderOpen,
  ShieldCheck,
  X,
  CheckCircle,
  XCircle,
  Loader2,
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
  Palette,
} from 'lucide-react'

interface SidebarProps {
  onOpenAISettings: () => void
}

// 主题色预设
const COLOR_PRESETS: { id: string; name: string; color: string }[] = [
  { id: 'blue', name: '电光蓝', color: '#3b82f6' },
  { id: 'emerald', name: '翡翠绿', color: '#10b981' },
  { id: 'rose', name: '玫红', color: '#e11d48' },
  { id: 'amber', name: '琥珀', color: '#d97706' },
  { id: 'teal', name: '青碧', color: '#0d9488' },
  { id: 'orange', name: '暖橙', color: '#ea580c' },
  { id: 'gold', name: '黑金', color: '#b4913c' },
  { id: 'slate', name: '石墨', color: '#64748b' },
]

export function Sidebar({ onOpenAISettings }: SidebarProps) {
  const {
    activeTab, navigateTo,
    aiConfig,
    theme, toggleTheme,
    env, setEnv,
    selectedSubProduct,
    colorTheme, setColorTheme,
    customAccent, setCustomAccent,
    bgImage,
  } = useAppStore()

  const [showColorMenu, setShowColorMenu] = useState(false)
  const [colorInput, setColorInput] = useState(customAccent || '#59a7f6')

  const [xinerongExpanded, setXinerongExpanded] = useState(false)
  const [dingerongExpanded, setDingerongExpanded] = useState(false)
  const [zhangerongExpanded, setZhangerongExpanded] = useState(false)
  const [huoerongExpanded, setHuoerongExpanded] = useState(false)
  const [piaoerongExpanded, setPiaoerongExpanded] = useState(false)
  const [isScanning, setIsScanning] = useState(false)

  const [scannedScripts, setScannedScripts] = useState<Record<string, { subProduct: string; scripts: { name: string; path: string }[] }[]> | null>(null)

  // 环境检测
  const [showDetect, setShowDetect] = useState(false)
  const [closingDetect, setClosingDetect] = useState(false)
  const [detectResults, setDetectResults] = useState<{ label: string; ok: boolean; detail: string }[]>([])
  const [detecting, setDetecting] = useState(false)

  const closeDetect = () => {
    setClosingDetect(true)
    setTimeout(() => {
      setShowDetect(false)
      setClosingDetect(false)
    }, 150)
  }

  // ESC 关闭检测弹窗
  useEffect(() => {
    if (!showDetect) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDetect()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showDetect])

  // 点击空白处关闭主题色菜单
  useEffect(() => {
    if (!showColorMenu) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('[data-dropdown]')) setShowColorMenu(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [showColorMenu])

  async function handleDetect() {
    setDetecting(true)
    setShowDetect(true)
    try {
      const api = (window as any).supplyChainTester
      const result = await api?.detectEnvironment?.()
      setDetectResults(result?.results || [])
    } catch {
      setDetectResults([{ label: '检测失败', ok: false, detail: '请稍后重试' }])
    } finally {
      setDetecting(false)
    }
  }

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
    <aside className={`w-60 border-r border-border/5 flex flex-col select-none ${
      bgImage
        ? theme === 'dark'
          ? 'bg-black/25 backdrop-blur-[2px]'
          : 'bg-white/10 backdrop-blur-[2px]'
        : 'bg-surface-light'
    }`}>
      {/* Logo */}
      <div className="h-12 flex items-center gap-2 px-4 border-b border-border/5 drag-region mt-7">
        <Package size={20} className="text-accent" />
        <span className="font-semibold text-sm tracking-wide flex-1">测易融</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isScanning}
              className="no-drag h-8 w-8">
              <RotateCw size={15} className={isScanning ? 'animate-spin' : ''} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>刷新产品线</TooltipContent>
        </Tooltip>
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
      </div>

      {/* 底部 */}
      <div className="px-3 py-3 border-t border-border/5 space-y-1">
        {/* 主题切换 */}
        <Tip label={theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式'}>
          <button
            onClick={toggleTheme}
            className="relative flex items-center w-full h-8 rounded-lg bg-hover/5 p-0.5
                       hover:bg-hover/10 transition-colors group"
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
        </Tip>
        {/* 主题色切换 */}
        <div className="relative">
          <Tip label="主题色">
            <button
              onClick={() => setShowColorMenu(!showColorMenu)}
              className="relative flex items-center gap-2 w-full h-8 rounded-lg bg-hover/5 px-3 hover:bg-hover/10 transition-colors"
            >
              <Palette size={14} className="text-accent-light" />
              <span className="text-xs text-muted flex-1 text-left">主题色</span>
              <span
                className="w-4 h-4 rounded-full border border-border/20 shadow-sm"
                style={{
                  background:
                    colorTheme === 'custom' && customAccent
                      ? customAccent
                      : (COLOR_PRESETS.find(p => p.id === colorTheme)?.color || '#3b82f6'),
                }}
              />
            </button>
          </Tip>
          {showColorMenu && (
            <div data-dropdown className="absolute bottom-full left-0 mb-1 w-72 bg-surface-light border border-border/10 rounded-xl shadow-xl z-50 p-3.5 animate-fade-in"
                 onClick={e => e.stopPropagation()}>
              <span className="text-[10px] uppercase tracking-widest text-muted mb-2 block">预设主题色</span>
              <div className="flex flex-wrap items-center gap-2.5">
                {COLOR_PRESETS.map(p => (
                  <button key={p.id} onClick={() => setColorTheme(p.id)} title={p.name}
                    className={`w-7 h-7 rounded-full transition-all duration-150 active:scale-90
                      ${colorTheme === p.id ? 'ring-2 ring-offset-2 ring-accent scale-110' : 'hover:scale-110'}`}
                    style={{ background: p.color }} />
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-border/10">
                <span className="text-[10px] uppercase tracking-widest text-muted mb-2 block">自定义颜色</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(colorInput) ? colorInput : '#3b82f6'}
                    onChange={e => { setColorInput(e.target.value); setCustomAccent(e.target.value); setColorTheme('custom') }}
                    className="w-8 h-8 rounded cursor-pointer border border-border/20 bg-transparent shrink-0" />
                  <input
                    value={colorInput}
                    onChange={e => {
                      setColorInput(e.target.value)
                      if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(e.target.value)) {
                        setCustomAccent(e.target.value)
                        setColorTheme('custom')
                      }
                    }}
                    onBlur={() => { if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(colorInput)) setCustomAccent(colorInput) }}
                    className="flex-1 text-[11px] font-mono bg-surface rounded px-2 py-1.5 border border-border/10 outline-none focus:border-accent/50"
                    placeholder="#3b82f6" />
                </div>
              </div>
            </div>
          )}
        </div>
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
                     hover:bg-accent/10 transition-colors"
        >
          <Sparkles size={14} className={aiConfig?.enabled ? 'text-accent-light' : 'text-muted'} />
          <span className={aiConfig?.enabled ? 'text-accent-light' : 'text-muted'}>
            模型配置{aiConfig?.enabled ? ' ✓' : ''}
          </span>
        </button>
        <button
          onClick={() => navigateTo('aiassistant')}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs
                     hover:bg-accent/10 transition-colors"
        >
          <Bot size={14} className={aiConfig?.enabled ? 'text-accent-light' : 'text-muted'} />
          <span className={aiConfig?.enabled ? 'text-accent-light' : 'text-muted'}>
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

        <div className="border-t border-border/5 pt-1.5 mt-1.5 flex items-center">
          <div className="flex-1 min-w-0">
            <UpdateIndicator />
          </div>
          <Tip label="环境检测">
            <button
              onClick={handleDetect}
              disabled={detecting}
              className="p-1 rounded text-muted hover:text-foreground hover:bg-hover/10 transition-colors disabled:opacity-50 mr-1"
            >
              <ShieldCheck size={15} className={detecting ? 'animate-pulse' : ''} />
            </button>
          </Tip>
        </div>

        {/* 检测结果弹窗 */}
        {showDetect && (
          <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 transition-opacity duration-150 ${closingDetect ? 'opacity-0' : 'opacity-100'}`}>
            <div className="bg-surface border border-border rounded-xl shadow-2xl w-[420px] max-h-[80vh] overflow-hidden animate-zoom-in"
                 onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-border/10">
                <span className="font-semibold text-sm">环境检测</span>
                <button onClick={closeDetect}
                  className="p-1 rounded hover:bg-hover/10 text-muted hover:text-foreground">
                  <X size={18} />
                </button>
              </div>
              <div className="px-5 py-4 space-y-2 overflow-y-auto max-h-[60vh]">
                {detecting ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={24} className="animate-spin text-accent" />
                  </div>
                ) : (
                  detectResults.map((r, i) => (
                    <div key={i} className={`flex items-start gap-2 p-2 rounded-lg text-xs
                      ${r.ok ? 'bg-green-500/5' : 'bg-red-500/5'}`}>
                      {r.ok
                        ? <CheckCircle size={14} className="text-green-400 mt-0.5 shrink-0" />
                        : <XCircle size={14} className="text-red-400 mt-0.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className={r.ok ? 'text-green-300' : 'text-red-300'}>{r.label}</div>
                        <div className="text-muted truncate">{r.detail}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

function NavItem({ icon, label, active, onClick, suffix, compact }: {
  icon?: React.ReactNode; label: string; active: boolean; onClick: () => void
  suffix?: React.ReactNode; compact?: boolean
}) {
  return (
    <Button
      variant="ghost"
      size={compact ? 'sm' : 'default'}
      onClick={onClick}
      className={`w-full justify-start transition-all duration-150 active:scale-[0.98] ${
        active
          ? '!bg-accent/10 !text-accent-light hover:!bg-accent/15 hover:!text-accent-light'
          : 'text-muted hover:!bg-hover/5 hover:!text-foreground'
      } ${compact ? 'pl-6 text-xs' : 'gap-3'}`}
    >
      {icon}<span className="flex-1 text-left truncate">{label}</span>{suffix}
    </Button>
  )
}

function openFolder() {
  const api = (window as any).supplyChainTester
  if (api?.openScriptsFolder) {
    api.openScriptsFolder().catch(() => {})
  }
}
