import React, { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { HomePage } from './pages/HomePage'
import { TestEditor } from './pages/TestEditor'
import { Reports } from './pages/Reports'
import { ProductPage } from './pages/ProductPage'
import { ScriptRunner } from './pages/ScriptRunner'
import { ApiDebugger } from './pages/ApiDebugger'
import { UtilsPage } from './pages/UtilsPage'
import { VisualRecorder } from './pages/VisualRecorder'
import { ApiRecorder } from './pages/ApiRecorder'
import { AISettingsPanel } from './components/AISettingsPanel'
import { AIAssistant } from './components/AIAssistant'
import { TooltipProvider } from './components/ui/tooltip'
import { Toaster } from './components/ui/sonner'
import { useAppStore } from './store'

export default function App() {
  const { activeTab, setTestCases, setReports, loadAIConfig, theme, toggleTheme, colorTheme, customAccent, bgImage, scriptParams, selectedSubProduct, navKey } = useAppStore()
  const [showAISettings, setShowAISettings] = useState(false)

  // 十六进制 → "r g b" 字符串，供 CSS 变量使用
  function hexToRgbStr(hex: string): string {
    const h = hex.replace('#', '')
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
    const num = parseInt(full, 16)
    if (isNaN(num)) return ''
    const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255
    return `${r} ${g} ${b}`
  }
  // 混合颜色：mix = 0 保留原色；正数向白色混合，负数向黑色混合
  function mixRgbStr(rgb: string, mix: number): string {
    const [r, g, b] = rgb.split(' ').map(Number)
    const t = Math.abs(mix)
    const target = mix > 0 ? 255 : 0
    const m = (v: number) => Math.round(v + (target - v) * t)
    return `${m(r)} ${m(g)} ${m(b)}`
  }

  // 同步主题 class、data-theme 和自定义强调色到 html 元素
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    root.setAttribute('data-theme', colorTheme)
    // 自定义颜色：覆盖 CSS 变量；非自定义时清除内联覆盖（回退到预设）
    if (colorTheme === 'custom' && customAccent) {
      const base = hexToRgbStr(customAccent)
      if (base) {
        root.style.setProperty('--color-accent', base)
        root.style.setProperty('--color-accent-light', mixRgbStr(base, 0.32))
        root.style.setProperty('--color-accent-dark', mixRgbStr(base, -0.25))
      }
    } else {
      root.style.removeProperty('--color-accent')
      root.style.removeProperty('--color-accent-light')
      root.style.removeProperty('--color-accent-dark')
    }
  }, [theme, colorTheme, customAccent])

  useEffect(() => {
    loadInitialData()
  }, [])

  // 惰性挂载：只挂载访问过的页面，之后保持挂载
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(() => new Set(['home']))
  useEffect(() => {
    setMountedTabs(prev => {
      if (prev.has(activeTab)) return prev
      return new Set([...prev, activeTab])
    })
  }, [activeTab])

  // 页面 key：只在同标签刷新时（navKey递增）变化 → 重挂载清空
  const tabKey = (name: string) => `${name}-${navKey}`

  async function loadInitialData() {
    try {
      const api = (window as any).supplyChainTester
      if (!api) return
      const [cases, reports] = await Promise.all([
        api.loadTestCases(),
        api.getReports(),
      ])
      setTestCases(cases || [])
      setReports(reports || [])
      await loadAIConfig()
    } catch (err) {
      console.error('加载数据失败:', err)
    }
  }

  const subProduct = selectedSubProduct
  const productTabs = ['xinerong', 'dingerong', 'huoerong', 'zhangerong', 'piaoerong']
  const isProduct = productTabs.includes(activeTab)

  // 通用层样式：绝对定位叠放，opacity+transform 过渡实现切换动画
  const layerStyle = (name: string): React.CSSProperties => ({
    position: 'absolute',
    inset: 0,
    opacity: activeTab === name ? 1 : 0,
    transform: activeTab === name ? 'translateX(0)' : 'translateX(24px)',
    zIndex: activeTab === name ? 10 : 0,
    pointerEvents: activeTab === name ? 'auto' : 'none',
    transition: 'opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
  })

  function renderContent() {
    return (
      <>
        {/* ===== 首页（空白）===== */}
        {mountedTabs.has('home') && (
          <div key="wrap-home" style={layerStyle('home')}>
            <HomePage key={tabKey('home')} />
          </div>
        )}

        {/* ===== 产品页：条件渲染，切换产品时重挂载获取新数据 ===== */}
        {isProduct && (
          <div style={layerStyle(activeTab)}>
            <ProductPage key={navKey} product={activeTab} subProduct={subProduct ?? undefined} />
          </div>
        )}

        {/* ===== 脚本运行页 ===== */}
        {activeTab === 'script' && (
          <div style={layerStyle('script')}>
            {scriptParams ? (
              <ScriptRunner scriptPath={scriptParams.scriptPath} scriptName={`${scriptParams.subProduct} - ${scriptParams.scriptName}`} vars={scriptParams.vars} />
            ) : (
              <TestEditor key={tabKey('editor')} />
            )}
          </div>
        )}

        {/* ===== 以下页面惰性挂载 + opacity 过渡，切换 tab 不丢状态 ===== */}
        {mountedTabs.has('editor') && activeTab !== 'script' && (
          <div key="wrap-editor" style={layerStyle('editor')}>
            <TestEditor key={tabKey('editor')} />
          </div>
        )}
        {mountedTabs.has('reports') && (
          <div key="wrap-reports" style={layerStyle('reports')}>
            <Reports key={tabKey('reports')} />
          </div>
        )}
        {mountedTabs.has('apidebug') && (
          <div key="wrap-apidebug" style={layerStyle('apidebug')}>
            <ApiDebugger key={tabKey('apidebug')} />
          </div>
        )}
        {mountedTabs.has('aiassistant') && (
          <div key="wrap-aiassistant" style={layerStyle('aiassistant')}>
            <AIAssistant key={tabKey('aiassistant')} />
          </div>
        )}
        {mountedTabs.has('utils') && (
          <div key="wrap-utils" style={layerStyle('utils')}>
            <UtilsPage key={tabKey('utils')} />
          </div>
        )}
        {mountedTabs.has('recorder') && (
          <div key="wrap-recorder" style={layerStyle('recorder')}>
            <VisualRecorder key={tabKey('recorder')} />
          </div>
        )}
        {mountedTabs.has('apirecorder') && (
          <div key="wrap-apirecorder" style={layerStyle('apirecorder')}>
            <ApiRecorder key={tabKey('apirecorder')} />
          </div>
        )}
      </>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="relative flex h-full">
        {/* 自定义背景层 */}
        {bgImage && (
          <div
            className="pointer-events-none fixed inset-0 z-0"
            style={{
              backgroundImage: `url(${bgImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
          />
        )}
        <div className="relative z-10 flex h-full w-full">
          <Sidebar onOpenAISettings={() => setShowAISettings(true)} />
          <main className="flex-1 overflow-hidden relative">
            {renderContent()}
          </main>
          {showAISettings && (
            <AISettingsPanel onClose={() => setShowAISettings(false)} />
          )}
        </div>
      </div>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}
