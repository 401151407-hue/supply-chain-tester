import React, { useState } from 'react'
import { useAppStore } from '../store'
import type { TestCase, ApiTestStep, BusinessFlowStep, HttpMethod } from '@shared/types'
import { TestCaseForm } from '../components/TestCaseForm'
import { ResultPanel } from '../components/ResultPanel'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { toast } from '../lib/toast'
import { TEST_CASE_TEMPLATES, SYSTEM_PROMPT } from '../lib/test-case-prompts'
import {
  Play,
  Square,
  Save,
  Loader2,
  Sparkles,
  ChevronDown,
  Copy,
  Plus,
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
    aiConfig,
  } = useAppStore()

  const [showAiInput, setShowAiInput] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([])

  const api = () => (window as any).supplyChainTester

  // ── 用例生成 ──
  const [genTab, setGenTab] = useState('generate')
  const [genUserPrompt, setGenUserPrompt] = useState('')
  const [genStep, setGenStep] = useState<'input' | 'points' | 'result'>('input') // 三步流程
  const [generating, setGenerating] = useState(false)
  const [genCases, setGenCases] = useState<any[]>([])
  const [funcPoints, setFuncPoints] = useState<string[]>([])  // AI 分析出的功能点
  const [checkedPoints, setCheckedPoints] = useState<Set<number>>(new Set())  // 勾选确认的功能点

  // 4 个可选文档（含路径）
  const [designDoc, setDesignDoc] = useState<{ name: string; path: string; content: string } | null>(null)
  const [reqDoc, setReqDoc] = useState<{ name: string; path: string; content: string } | null>(null)
  const [templateDoc, setTemplateDoc] = useState<{ name: string; path: string; content: string } | null>(null)
  const [planDoc, setPlanDoc] = useState<{ name: string; path: string; content: string } | null>(null)

  async function pickAndSet(setter: (d: { name: string; path: string; content: string }) => void) {
    const res = await api()?.pickFile?.()
    if (res?.ok && res.path && res.content) {
      const name = res.path.split(/[/\\]/).pop() || res.path
      setter({ name, path: res.path, content: res.content })
      toast.success(`已导入: ${name}`)
    } else if (!res?.canceled) {
      toast.error(res?.error || '导入失败')
    }
  }

  /** 处理拖入文件 */
  async function handleDrop(e: React.DragEvent, setter: (d: { name: string; path: string; content: string }) => void) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    // Electron 环境下，file.path 提供绝对路径
    const filePath = (file as any).path || file.name
    const name = file.name
    try {
      const text = await file.text()
      setter({ name, path: filePath, content: text.slice(0, 50000) })
      toast.success(`已导入: ${name}`)
    } catch {
      toast.error('读取文件失败')
    }
  }

  function extractJSON(text: string): string {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (match) return match[1].trim()
    const start = text.indexOf('[')
    const start2 = text.indexOf('{')
    const idx = start === -1 ? start2 : (start2 === -1 ? start : Math.min(start, start2))
    if (idx === -1) throw new Error('响应中没有找到 JSON')
    return text.slice(idx)
  }

  /** 提取列表文本（支持 - xxx 和 1. xxx 格式） */
  function extractList(text: string): string[] {
    const lines = text.split('\n')
    const items: string[] = []
    for (const line of lines) {
      const trimmed = line.replace(/^[\s•\-\*\d]+[\.\、\)\s]*/, '').trim()
      if (trimmed && trimmed.length > 2) items.push(trimmed)
    }
    return items.slice(0, 30)
  }

  /** 第一步：分析功能点 */
  async function handleAnalyzePoints() {
    setGenerating(true)
    setFuncPoints([])
    setCheckedPoints(new Set())
    try {
      const parts: string[] = []
      parts.push('你是供应链金融测试专家。请根据以下资料，列出所有需要测试的功能点。')
      parts.push('')
      if (designDoc) parts.push(`## 设计文档\n${designDoc.content}`)
      if (reqDoc) parts.push(`## 需求文档\n${reqDoc.content}`)
      if (templateDoc) parts.push(`## 测试用例模板\n${templateDoc.content}`)
      if (planDoc) parts.push(`## 测试计划\n${planDoc.content}`)
      if (genUserPrompt.trim()) parts.push(`## 用户补充说明\n${genUserPrompt.trim()}`)
      parts.push('')
      parts.push('## 输出要求')
      parts.push('请用简洁的列表格式列出所有功能点，每行一个，格式如下：')
      parts.push('- 功能点名称：简要说明（如：企业授信申请 - 正常提交流程）')
      parts.push('- 功能点名称：简要说明')
      parts.push('不要编号，用 - 开头。列出 10-20 个功能点。')

      const messages = [
        { role: 'system', content: '你是供应链金融测试专家。只输出功能点列表，每行一个，用 - 开头。' },
        { role: 'user', content: parts.join('\n') },
      ]
      const reply = await api()?.aiChat?.(messages)
      if (!reply) { toast.error('AI 服务不可用'); return }
      const points = extractList(reply)
      if (points.length === 0) { toast.error('未能提取功能点，请重试'); return }
      setFuncPoints(points)
      setCheckedPoints(new Set(points.map((_, i) => i))) // 默认全选
      setGenStep('points')
      toast.success(`已分析出 ${points.length} 个功能点`)
    } catch (err: any) {
      toast.error(`分析失败: ${err.message || '请重试'}`)
    } finally { setGenerating(false) }
  }

  /** 第二步：确认功能点后生成用例 */
  async function handleConfirmGenerate() {
    const selectedPoints = funcPoints.filter((_, i) => checkedPoints.has(i))
    if (selectedPoints.length === 0) { toast.error('请至少勾选一个功能点'); return }
    setGenerating(true)
    setGenCases([])
    try {
      const parts: string[] = []
      parts.push('你是供应链金融测试专家。请根据以下功能点生成测试用例。')
      if (designDoc) parts.push(`## 参考设计文档\n${designDoc.content}`)
      if (reqDoc) parts.push(`## 参考需求文档\n${reqDoc.content}`)
      parts.push('')
      parts.push('## 需要覆盖的功能点')
      selectedPoints.forEach((p, i) => parts.push(`${i + 1}. ${p}`))
      if (genUserPrompt.trim()) parts.push(`\n## 用户补充要求\n${genUserPrompt.trim()}`)
      parts.push('')
      parts.push('## 输出要求')
      parts.push(`基于以上 ${selectedPoints.length} 个功能点，生成测试用例 JSON 数组。每个用例: id, name, type(正向/异常/边界), priority(P0/P1/P2), precondition, steps(数组), expectedResult, testData(对象)。每个功能点至少 1 个用例。严格 JSON 格式。`)

      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: parts.join('\n') },
      ]
      const reply = await api()?.aiChat?.(messages)
      if (!reply) { toast.error('AI 服务不可用'); return }
      const jsonStr = extractJSON(reply)
      const parsed = JSON.parse(jsonStr)
      const caseList: any[] = Array.isArray(parsed) ? parsed : (parsed.cases || [parsed])
      const withIds = caseList.map((c: any, i: number) => ({ ...c, id: c.id || `TC-${String(i + 1).padStart(3, '0')}` }))
      setGenCases(withIds)
      setGenStep('result')
      setGenTab('result')
      toast.success(`已生成 ${withIds.length} 个用例`)
    } catch (err: any) {
      toast.error(`生成失败: ${err.message || '请重试'}`)
    } finally { setGenerating(false) }
  }

  function handleImportGenerated() {
    const { testCases, setTestCases, setCurrentCase, navigateTo } = useAppStore.getState()
    const newCases: TestCase[] = genCases.map(c => ({
      id: c.id,
      type: 'api' as const,
      name: c.name,
      description: `${c.precondition}\n预期: ${c.expectedResult}`,
      tags: [c.type, c.priority, 'AI生成'],
      steps: c.steps.map((s: string, i: number) => ({
        id: `${c.id}-S${i + 1}`,
        name: s,
        method: 'GET' as const,
        url: '',
        headers: {},
        expectedStatus: 200,
        timeout: 10000,
      })),
      variables: c.testData || {},
      status: 'draft' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }))
    setTestCases([...testCases, ...newCases])
    setCurrentCase(newCases[0])
    navigateTo('editor')
    toast.success(`已导入 ${newCases.length} 个用例`)
  }

  if (!currentCase) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-border/[0.03]">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Sparkles size={16} className="text-purple-400" />
            AI 生成测试用例
          </h2>
          <p className="text-[11px] text-muted mt-0.5">
            导入文档或输入需求，AI 自动生成标准化测试用例
            <span className="ml-2 text-[10px] bg-accent/10 text-accent-light px-1.5 py-0.5 rounded">
              模型: {aiConfig?.analysisModel || 'llm-pro'}
            </span>
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <Tabs value={genTab} onValueChange={setGenTab} className="h-full flex flex-col">
            <TabsList className="mx-5 mt-3">
              <TabsTrigger value="generate">输入资料</TabsTrigger>
              <TabsTrigger value="result" disabled={genCases.length === 0}>生成结果 ({genCases.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="generate" className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* 4 个文档导入按钮 */}
              <div>
                <label className="text-xs text-muted mb-2 block">导入参考文档（均选填）</label>
                <div className="grid grid-cols-4 gap-2">
                  <DocImporter icon="📐" label="设计文档" doc={designDoc}
                    onImport={() => pickAndSet(setDesignDoc)} onRemove={() => setDesignDoc(null)}
                    onDrop={e => handleDrop(e, setDesignDoc)} />
                  <DocImporter icon="📋" label="需求文档" doc={reqDoc}
                    onImport={() => pickAndSet(setReqDoc)} onRemove={() => setReqDoc(null)}
                    onDrop={e => handleDrop(e, setReqDoc)} />
                  <DocImporter icon="📝" label="用例模板" doc={templateDoc}
                    onImport={() => pickAndSet(setTemplateDoc)} onRemove={() => setTemplateDoc(null)}
                    onDrop={e => handleDrop(e, setTemplateDoc)} />
                  <DocImporter icon="📊" label="测试计划" doc={planDoc}
                    onImport={() => pickAndSet(setPlanDoc)} onRemove={() => setPlanDoc(null)}
                    onDrop={e => handleDrop(e, setPlanDoc)} />
                </div>
              </div>

              {/* 文本输入 */}
              <div>
                <label className="text-xs text-muted mb-1 block">
                  补充说明 / 提示词
                  <span className="text-muted/50 ml-1">（选填）</span>
                </label>
                <textarea value={genUserPrompt} onChange={e => setGenUserPrompt(e.target.value)}
                  placeholder="例如：重点覆盖异常场景，特别是额度超限和重复提交的情况..."
                  className="w-full h-24 rounded-lg px-3 py-2 text-sm bg-surface border border-border/5 focus:border-accent/50 resize-none outline-none placeholder:text-muted/40"
                />
              </div>

              {/* 步骤 1：分析功能点 或 步骤 2：确认功能点 */}
              {genStep === 'input' && (
                <Button onClick={handleAnalyzePoints} disabled={generating} className="w-full" size="lg">
                  {generating ? <><Loader2 size={14} className="animate-spin" /> AI 正在分析功能点...</> : <><Sparkles size={14} /> 分析功能点</>}
                </Button>
              )}

              {genStep === 'points' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">AI 分析出的功能点（可取消勾选不需要的）</span>
                    <button onClick={() => setCheckedPoints(new Set(funcPoints.map((_, i) => checkedPoints.size === funcPoints.length ? i : funcPoints.length === 0 ? 0 : i)))} className="text-[10px] text-accent hover:underline">
                      {checkedPoints.size === funcPoints.length ? '取消全选' : '全选'}
                    </button>
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {funcPoints.map((point, i) => (
                      <label key={i} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${checkedPoints.has(i) ? 'bg-accent/5' : 'bg-surface opacity-50'}`}>
                        <input type="checkbox" checked={checkedPoints.has(i)}
                          onChange={() => {
                            const next = new Set(checkedPoints)
                            if (next.has(i)) next.delete(i); else next.add(i)
                            setCheckedPoints(next)
                          }}
                          className="rounded accent-accent" />
                        <span className="text-xs">{point}</span>
                      </label>
                    ))}
                  </div>
                  <Button onClick={handleConfirmGenerate} disabled={generating} className="w-full" size="lg">
                    {generating ? <><Loader2 size={14} className="animate-spin" /> 正在生成测试用例...</> : <>✅ 确认功能点，生成测试用例（{checkedPoints.size} 个）</>}
                  </Button>
                  <button onClick={() => setGenStep('input')} className="w-full text-[10px] text-muted hover:text-foreground">← 返回重新分析</button>
                </div>
              )}

              {genStep === 'input' && (
                <p className="text-[10px] text-muted/50 text-center">AI 将先分析功能点，你确认后再生成用例</p>
              )}
            </TabsContent>
            <TabsContent value="result" className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={handleImportGenerated}><Plus size={12} /> 全部导入</Button>
              </div>
              {genCases.map((c: any, i: number) => (
                <Card key={c.id || i}>
                  <CardHeader className="pb-2 flex flex-row items-start justify-between">
                    <div>
                      <CardTitle className="text-sm">{c.id} {c.name}</CardTitle>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Badge variant={c.type === '正向' ? 'success' : c.type === '异常' ? 'destructive' : 'warning'} className="text-[10px]">{c.type}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{c.priority}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="text-xs space-y-1">
                    <p className="text-muted">前置: {c.precondition}</p>
                    <ol className="ml-4 list-decimal space-y-0.5">{c.steps.map((s: string, j: number) => <li key={j}>{s}</li>)}</ol>
                    <p className="text-muted">预期: {c.expectedResult}</p>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    )
  }

  /** 文档导入按钮组件 — 支持点击导入 + 拖入 + hover 高亮 */
  function DocImporter({ icon, label, doc, onImport, onRemove, onDrop }: {
    icon: string; label: string
    doc: { name: string; path: string; content: string } | null
    onImport: () => void; onRemove: () => void
    onDrop: (e: React.DragEvent) => void
  }) {
    const [dragOver, setDragOver] = useState(false)
    return (
      <div
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }}
        onDragLeave={e => { e.preventDefault(); setDragOver(false) }}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragOver(false); onDrop(e) }}
        onClick={onImport}
        className={`flex items-center gap-1.5 px-3 py-4 rounded-lg border transition-all cursor-pointer ${
          doc ? 'border-accent/30 bg-accent/5' : 'border-dashed border-border/20 bg-surface hover:border-accent/40 hover:bg-accent/5'
        } ${dragOver ? 'border-accent !border-accent-light ring-2 ring-accent/40 shadow-lg shadow-accent/20 scale-[1.02]' : ''}`}
      >
        <span className="text-sm shrink-0 pointer-events-none">{icon}</span>
        <div className="flex-1 min-w-0 pointer-events-none">
          {doc ? (
            <>
              <p className="text-[10px] font-medium text-accent-light truncate leading-tight" title={doc.path}>{doc.name}</p>
              <p className="text-[8px] text-muted/50 truncate leading-tight" title={doc.path}>{doc.path}</p>
            </>
          ) : (
            <p className="text-[10px] text-muted text-center leading-tight">
              {label}<br /><span className="text-[9px] text-muted/40">点击或拖入</span>
            </p>
          )}
        </div>
        {doc && (
          <button onClick={(e) => { e.stopPropagation(); onRemove() }} className="text-[10px] text-muted hover:text-red-400 shrink-0">✕</button>
        )}
      </div>
    )
  }

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
