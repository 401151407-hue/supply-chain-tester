import React, { useState } from 'react'
import { useAppStore } from '../store'
import type { TestCase, ApiTestStep, BusinessFlowStep, HttpMethod } from '@shared/types'
import { TestCaseForm } from '../components/TestCaseForm'
import { ResultPanel } from '../components/ResultPanel'
import {
  Play,
  Square,
  Save,
  Loader2,
  Sparkles,
  ChevronDown,
} from 'lucide-react'

interface TestEditorProps {
  product?: string
}

const PRODUCT_NAMES: Record<string, string> = {
  xinerong: '信e融',
  dingerong: '订e融',
  huoerong: '货e融',
  zhangerong: '账e融',
  piaoerong: '票e融',
}

export function TestEditor({ product }: TestEditorProps = {}) {
  const {
    currentCase, setCurrentCase, saveCurrentCase,
    isRunning, setIsRunning,
    currentReport, setCurrentReport,
    liveResults, setLiveResults,
    setReports, reports,
    isAiGenerating, setIsAiGenerating,
  } = useAppStore()

  const [showAiInput, setShowAiInput] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([])

  if (!currentCase) {
    return (
      <div className="h-full flex items-center justify-center text-muted">
        <div className="text-center">
          <Sparkles size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg">
            {product ? `${PRODUCT_NAMES[product]} - 选择或新建测试用例` : '选择或新建一个测试用例'}
          </p>
          <p className="text-sm mt-1">从左侧列表选择已有用例，或点击 + 新建</p>
        </div>
      </div>
    )
  }

  const api = () => (window as any).supplyChainTester

  /** 执行测试 */
  async function handleRun() {
    if (!currentCase || isRunning) return
    setIsRunning(true)
    setLiveResults([])
    setCurrentReport(null)

    try {
      const report = await api().runTest(currentCase)
      setCurrentReport(report)
      setLiveResults(report.stepResults)

      const updatedReports = [report, ...reports].slice(0, 200)
      setReports(updatedReports)
    } catch (err: any) {
      console.error('测试执行失败:', err)
    } finally {
      setIsRunning(false)
    }
  }

  /** 新增 API 步骤 */
  function addApiStep() {
    if (!currentCase || currentCase.type !== 'api') return
    const newStep: ApiTestStep = {
      id: crypto.randomUUID(),
      name: `步骤 ${currentCase.steps.length + 1}`,
      method: 'GET',
      url: '',
      headers: { 'Content-Type': 'application/json' },
      expectedStatus: 200,
      timeout: 30000,
    }
    setCurrentCase({
      ...currentCase,
      steps: [...currentCase.steps, newStep],
    } as TestCase)
  }

  /** 新增业务流程步骤 */
  function addFlowStep() {
    if (!currentCase || currentCase.type !== 'business-flow') return
    const newStep: BusinessFlowStep = {
      id: crypto.randomUUID(),
      name: `步骤 ${currentCase.steps.length + 1}`,
      action: '',
      apiCalls: [],
      assertions: [],
      dependsOn: [],
    }
    setCurrentCase({
      ...currentCase,
      steps: [...currentCase.steps, newStep],
    } as TestCase)
  }

  /** 切换用例类型 */
  function toggleType() {
    if (!currentCase) return
    const newType = currentCase.type === 'api' ? 'business-flow' : 'api'
    setCurrentCase({ ...currentCase, type: newType, steps: [], status: 'draft' } as TestCase)
  }

  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
      <header className="h-12 flex items-center gap-3 px-4 border-b border-border/5 bg-surface-light/50 shrink-0 drag-region">
        {/* 用例名称 */}
        <input
          className="flex-1 bg-transparent text-lg font-semibold outline-none
                     placeholder:text-muted/50 min-w-0"
          value={currentCase.name}
          onChange={e => setCurrentCase({ ...currentCase, name: e.target.value })}
          placeholder="测试用例名称"
        />

        {/* 类型切换 */}
        <button
          onClick={toggleType}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs
                     bg-hover/5 hover:bg-hover/10 transition-colors"
        >
          <span className={currentCase.type === 'api' ? 'text-blue-400' : 'text-purple-400'}>
            {currentCase.type === 'api' ? 'API 测试' : '业务流程'}
          </span>
          <ChevronDown size={12} />
        </button>

        {/* AI 生成 */}
        <button
          onClick={() => setShowAiInput(!showAiInput)}
          disabled={isAiGenerating}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                     bg-gradient-to-r from-purple-500/20 to-accent/20
                     hover:from-purple-500/30 hover:to-accent/30
                     text-purple-300 transition-all
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isAiGenerating ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          AI 生成步骤
        </button>

        {/* 操作按钮 */}
        <button
          onClick={saveCurrentCase}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                     bg-hover/5 hover:bg-hover/10 text-muted hover:text-foreground transition-all"
        >
          <Save size={14} />
          保存
        </button>

        <button
          onClick={handleRun}
          disabled={isRunning || currentCase.steps.length === 0}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold
                     bg-accent hover:bg-accent-light text-foreground
                     disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {isRunning ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Play size={14} />
          )}
          {isRunning ? '执行中...' : '运行'}
        </button>
      </header>

      {/* AI 提示输入 */}
      {showAiInput && (
        <div className="px-4 py-3 bg-purple-500/5 border-b border-purple-500/10 animate-fade-in">
          <div className="flex gap-2">
            <input
              className="flex-1 bg-surface-light rounded-lg px-3 py-2 text-sm outline-none
                         border border-border/5 focus:border-accent/50 transition-colors
                         placeholder:text-muted/50"
              placeholder="描述你要测试的供应链场景，如：测试采购订单从创建到入库的完整流程..."
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && aiPrompt.trim()) {
                  handleAiGenerate()
                }
              }}
            />
            <button
              onClick={handleAiGenerate}
              disabled={!aiPrompt.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium
                         bg-accent hover:bg-accent-light text-foreground
                         disabled:opacity-40 transition-all shrink-0"
            >
              生成
            </button>
          </div>
        </div>
      )}

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 测试用例编辑 */}
        <div className="flex-1 overflow-y-auto p-4">
          <TestCaseForm
            testCase={currentCase}
            onChange={setCurrentCase}
            onAddApiStep={addApiStep}
            onAddFlowStep={addFlowStep}
          />
        </div>

        {/* 执行结果面板 */}
        <ResultPanel
          report={currentReport}
          liveResults={liveResults}
          isRunning={isRunning}
          onAnalyze={handleAnalyze}
          isAnalyzing={isAnalyzing}
          aiSuggestions={aiSuggestions}
        />
      </div>
    </div>
  )

  async function handleAiGenerate() {
    if (!aiPrompt.trim() || !currentCase) return
    setIsAiGenerating(true)
    try {
      const generatedSteps = await api().aiGenerateSteps(aiPrompt)

      // 将 AI 生成的步骤转为标准 ApiTestStep
      const newSteps: ApiTestStep[] = generatedSteps.map((s: any) => ({
        id: crypto.randomUUID(),
        name: s.name || '未命名步骤',
        method: (s.method || 'GET') as HttpMethod,
        url: s.url || '',
        headers: s.headers || { 'Content-Type': 'application/json' },
        body: s.body || undefined,
        expectedStatus: s.expectedStatus || 200,
        expectedBody: s.expectedBody || undefined,
        extractVars: s.extractVars || undefined,
        timeout: 30000,
      }))

      // 如果当前是 API 类型用例，直接添加步骤；否则切换到 API 模式
      if (currentCase.type === 'api') {
        setCurrentCase({
          ...currentCase,
          steps: [...currentCase.steps, ...newSteps],
        } as TestCase)
      } else {
        // 业务流程类型：创建新的 API 用例
        const newCase: TestCase = {
          ...currentCase,
          type: 'api',
          steps: newSteps,
        }
        setCurrentCase(newCase)
      }

      setShowAiInput(false)
      setAiPrompt('')
    } catch (err: any) {
      console.error('AI 生成失败:', err)
      alert(`AI 生成失败: ${err.message || String(err)}`)
    } finally {
      setIsAiGenerating(false)
    }
  }

  /** AI 分析当前报告 */
  async function handleAnalyze() {
    if (!currentReport) return
    setIsAnalyzing(true)
    setAiSuggestions([])
    try {
      const reportJson = JSON.stringify(currentReport, null, 2)
      const suggestions = await api().aiAnalyze(reportJson)
      setAiSuggestions(suggestions)
      // 同时更新报告中的 AI 建议
      if (currentReport) {
        setCurrentReport({ ...currentReport, aiSuggestions: suggestions })
      }
    } catch (err: any) {
      setAiSuggestions([`AI 分析失败: ${err.message || String(err)}`])
    } finally {
      setIsAnalyzing(false)
    }
  }
}
