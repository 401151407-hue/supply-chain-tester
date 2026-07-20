import React, { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
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
import { useAppStore } from './store'

export default function App() {
  const { activeTab, setTestCases, setReports, loadAIConfig, theme, scriptParams, selectedSubProduct, navKey } = useAppStore()
  const [showAISettings, setShowAISettings] = useState(false)

  // 同步主题 class 到 html 元素
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [theme])

  useEffect(() => {
    loadInitialData()
  }, [])

  // 惰性挂载：只挂载访问过的页面，之后保持挂载
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(() => new Set(['editor']))
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
    transition: 'opacity 0.2s ease-out, transform 0.2s ease-out',
  })

  function renderContent() {
    return (
      <>
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
    <div className="flex h-full">
      <Sidebar onOpenAISettings={() => setShowAISettings(true)} />
      <main className="flex-1 overflow-hidden relative">
        {renderContent()}
      </main>
      {showAISettings && (
        <AISettingsPanel onClose={() => setShowAISettings(false)} />
      )}
    </div>
  )
}
