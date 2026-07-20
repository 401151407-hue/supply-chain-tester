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
  const { activeTab, setTestCases, setReports, loadAIConfig, theme, scriptParams, selectedSubProduct, navKey, transitionKey } = useAppStore()
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

  // 惰性挂载：只挂载访问过的页面，之后保持挂载，用 display 切换可见性
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(() => new Set(['editor']))
  useEffect(() => {
    setMountedTabs(prev => {
      if (prev.has(activeTab)) return prev
      return new Set([...prev, activeTab])
    })
  }, [activeTab])

  // 仅当前活跃标签页的 key 受 navKey 驱动（刷新时重挂载），非活跃页 key 不变保活
  const tabKey = (name: string) => `${name}-${navKey}`
  // wrapper key 每次导航都变，触发 animate-fade-in 动画
  const wrapKey = (name: string) => `wrap-${name}-${transitionKey}`

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

  function renderContent() {
    return (
      <>
        {/* ===== 产品页：按产品切换时重挂载获取新数据 ===== */}
        {isProduct && (
          <ProductPage key={navKey} product={activeTab} subProduct={subProduct ?? undefined} />
        )}

        {/* ===== 脚本运行页 ===== */}
        {activeTab === 'script' && (
          scriptParams ? (
            <ScriptRunner scriptPath={scriptParams.scriptPath} scriptName={`${scriptParams.subProduct} - ${scriptParams.scriptName}`} vars={scriptParams.vars} />
          ) : (
            <TestEditor key={tabKey('editor')} />
          )
        )}

        {/* ===== 以下页面惰性挂载 + display 切换，切换 tab 不丢状态 ===== */}
        {/* wrapper 的 key 每次导航都变 → 重挂载 → animate-fade-in 播放 */}
        {/* 内部页面的 key 只在刷新时变 → 状态保留 */}
        {mountedTabs.has('editor') && activeTab !== 'script' && (
          <div key={wrapKey('editor')} style={{ display: activeTab === 'editor' ? undefined : 'none' }} className="h-full animate-fade-in">
            <TestEditor key={tabKey('editor')} />
          </div>
        )}
        {mountedTabs.has('reports') && (
          <div key={wrapKey('reports')} style={{ display: activeTab === 'reports' ? undefined : 'none' }} className="h-full animate-fade-in">
            <Reports key={tabKey('reports')} />
          </div>
        )}
        {mountedTabs.has('apidebug') && (
          <div key={wrapKey('apidebug')} style={{ display: activeTab === 'apidebug' ? undefined : 'none' }} className="h-full animate-fade-in">
            <ApiDebugger key={tabKey('apidebug')} />
          </div>
        )}
        {mountedTabs.has('aiassistant') && (
          <div key={wrapKey('aiassistant')} style={{ display: activeTab === 'aiassistant' ? undefined : 'none' }} className="h-full animate-fade-in">
            <AIAssistant key={tabKey('aiassistant')} />
          </div>
        )}
        {mountedTabs.has('utils') && (
          <div key={wrapKey('utils')} style={{ display: activeTab === 'utils' ? undefined : 'none' }} className="h-full animate-fade-in">
            <UtilsPage key={tabKey('utils')} />
          </div>
        )}
        {mountedTabs.has('recorder') && (
          <div key={wrapKey('recorder')} style={{ display: activeTab === 'recorder' ? undefined : 'none' }} className="h-full animate-fade-in">
            <VisualRecorder key={tabKey('recorder')} />
          </div>
        )}
        {mountedTabs.has('apirecorder') && (
          <div key={wrapKey('apirecorder')} style={{ display: activeTab === 'apirecorder' ? undefined : 'none' }} className="h-full animate-fade-in">
            <ApiRecorder key={tabKey('apirecorder')} />
          </div>
        )}
      </>
    )
  }

  return (
    <div className="flex h-full">
      <Sidebar onOpenAISettings={() => setShowAISettings(true)} />
      <main className="flex-1 overflow-hidden">
        {renderContent()}
      </main>
      {showAISettings && (
        <AISettingsPanel onClose={() => setShowAISettings(false)} />
      )}
    </div>
  )
}
