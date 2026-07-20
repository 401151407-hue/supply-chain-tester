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

  // 惰性挂载：只挂载访问过的页面，之后保持挂载，用 display 切换可见性
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(() => new Set(['editor']))
  useEffect(() => {
    setMountedTabs(prev => {
      if (prev.has(activeTab)) return prev
      return new Set([...prev, activeTab])
    })
  }, [activeTab])

  // navKey 只在同标签刷新时递增，所以这里用固定格式即可：
  // 切换标签时 navKey 不变 → key 不变 → 不重挂载
  // 同标签刷新时 navKey 递增 → key 变化 → 重挂载清空
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
        {mountedTabs.has('editor') && activeTab !== 'script' && (
          <div style={{ display: activeTab === 'editor' ? 'flex' : 'none' }} className="flex-1 h-full">
            <TestEditor key={tabKey('editor')} />
          </div>
        )}
        {mountedTabs.has('reports') && (
          <div style={{ display: activeTab === 'reports' ? 'flex' : 'none' }} className="flex-1 h-full">
            <Reports key={tabKey('reports')} />
          </div>
        )}
        {mountedTabs.has('apidebug') && (
          <div style={{ display: activeTab === 'apidebug' ? 'flex' : 'none' }} className="flex-1 h-full">
            <ApiDebugger key={tabKey('apidebug')} />
          </div>
        )}
        {mountedTabs.has('aiassistant') && (
          <div style={{ display: activeTab === 'aiassistant' ? 'flex' : 'none' }} className="flex-1 h-full">
            <AIAssistant key={tabKey('aiassistant')} />
          </div>
        )}
        {mountedTabs.has('utils') && (
          <div style={{ display: activeTab === 'utils' ? 'flex' : 'none' }} className="flex-1 h-full">
            <UtilsPage key={tabKey('utils')} />
          </div>
        )}
        {mountedTabs.has('recorder') && (
          <div style={{ display: activeTab === 'recorder' ? 'flex' : 'none' }} className="flex-1 h-full">
            <VisualRecorder key={tabKey('recorder')} />
          </div>
        )}
        {mountedTabs.has('apirecorder') && (
          <div style={{ display: activeTab === 'apirecorder' ? 'flex' : 'none' }} className="flex-1 h-full">
            <ApiRecorder key={tabKey('apirecorder')} />
          </div>
        )}
      </>
    )
  }

  return (
    <div className="flex h-full">
      <Sidebar onOpenAISettings={() => setShowAISettings(true)} />
      <main className="flex-1 overflow-hidden animate-fade-in">
        {renderContent()}
      </main>
      {showAISettings && (
        <AISettingsPanel onClose={() => setShowAISettings(false)} />
      )}
    </div>
  )
}
