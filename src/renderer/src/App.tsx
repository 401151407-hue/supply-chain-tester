import React, { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { TestEditor } from './pages/TestEditor'
import { Reports } from './pages/Reports'
import { ProductPage } from './pages/ProductPage'
import { ScriptRunner } from './pages/ScriptRunner'
import { ApiDebugger } from './pages/ApiDebugger'
import { UtilsPage } from './pages/UtilsPage'
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

  function renderContent() {
    switch (activeTab) {
      case 'xinerong':
      case 'dingerong':
      case 'huoerong':
      case 'zhangerong':
      case 'piaoerong':
        return <ProductPage key={navKey} product={activeTab} subProduct={subProduct ?? undefined} />
      case 'script':
        return scriptParams ? (
          <ScriptRunner scriptPath={scriptParams.scriptPath} scriptName={`${scriptParams.subProduct} - ${scriptParams.scriptName}`} vars={scriptParams.vars} />
        ) : <TestEditor />
      case 'editor':
        return <TestEditor />
      case 'reports':
        return <Reports />
      case 'apidebug':
        return <ApiDebugger />
      case 'aiassistant':
        return <AIAssistant />
      case 'utils':
        return <UtilsPage />
    }
  }

  return (
    <div className="flex h-full">
      <Sidebar onOpenAISettings={() => setShowAISettings(true)} />
      <main key={navKey} className="flex-1 overflow-hidden animate-fade-in">
        {renderContent()}
      </main>
      {showAISettings && (
        <AISettingsPanel onClose={() => setShowAISettings(false)} />
      )}
    </div>
  )
}
