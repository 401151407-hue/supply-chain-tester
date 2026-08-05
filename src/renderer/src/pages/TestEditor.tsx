import React, { useState, useEffect } from 'react'
import { useAppStore } from '../store'
import type { TestCase, ApiTestStep, BusinessFlowStep, HttpMethod } from '@shared/types'
import { TestCaseForm } from '../components/TestCaseForm'
import { ResultPanel } from '../components/ResultPanel'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { toast } from '../lib/toast'
import { TEST_CASE_TEMPLATES, SYSTEM_PROMPT, TEST_CASE_TEMPLATE_BASE64 } from '../lib/test-case-prompts'
import {
  Play,
  Square,
  Save,
  Loader2,
  Sparkles,
  ChevronDown,
  Copy,
  Plus,
  Download,
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

const AI_MODELS = [
  { value: 'llm-pro', label: 'llm-pro（内部算力）' },
  { value: 'llm-plus', label: 'llm-plus（内部算力）' },
  { value: 'llm-flash', label: 'llm-flash（内部算力·快）' },
  { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { value: 'qwen-max', label: '通义千问 Max' },
  { value: 'qwen-plus', label: '通义千问 Plus' },
  { value: 'qwen-turbo', label: '通义千问 Turbo' },
  { value: 'hy3', label: '腾讯混元 hy3' },
]

export function TestEditor({ product }: TestEditorProps = {}) {
  const {
    currentCase, setCurrentCase, saveCurrentCase,
    isRunning, setIsRunning,
    currentReport, setCurrentReport,
    liveResults, setLiveResults,
    setReports, reports,
    isAiGenerating, setIsAiGenerating,
    aiConfig, saveAIConfig,
  } = useAppStore()

  const [showAiInput, setShowAiInput] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([])

  const api = () => (window as any).supplyChainTester

  // ── 用例生成 ──
  const [genTab, setGenTab] = useState('generate')
  const [genUserPrompt, setGenUserPrompt] = useState('')
  const [genStep, setGenStep] = useState<'input' | 'tasks' | 'points' | 'result'>('input') // 四步流程
  const [generating, setGenerating] = useState(false)
  const [genCases, setGenCases] = useState<any[]>([])
  const [funcPoints, setFuncPoints] = useState<string[]>([])  // AI 分析出的功能点
  const [checkedPoints, setCheckedPoints] = useState<Set<number>>(new Set())  // 勾选确认的功能点
  const [taskMatches, setTaskMatches] = useState<{ task: string; docName: string; section: string }[]>([])  // 任务与需求文档匹配
  const [checkedTasks, setCheckedTasks] = useState<Set<number>>(new Set())  // 勾选确认的任务

  // 自定义提示词（持久化到 localStorage）
  const [customSysPrompt, setCustomSysPrompt] = useState(() => localStorage.getItem('tc-sys-prompt') || SYSTEM_PROMPT)
  const [customAnalysisPrompt, setCustomAnalysisPrompt] = useState(() => localStorage.getItem('tc-analysis-prompt') || '')
  const [showPromptConfig, setShowPromptConfig] = useState(false)

  // 4 个可选文档（含路径）
  const [designDoc, setDesignDoc] = useState<{ name: string; path: string; content: string } | null>(null)
  const [reqDocs, setReqDocs] = useState<{ name: string; path: string; content: string }[]>([])
  const [templateDoc, setTemplateDoc] = useState<{ name: string; path: string; content: string } | null>(null)
  const [planDoc, setPlanDoc] = useState<{ name: string; path: string; content: string } | null>(null)

  // 内置测试用例模板（13列标准格式），用户无需手动上传
  const BUILTIN_TEMPLATE_DESC = `测试用例模板（13列标准格式）：
A-模块, B-*标题(格式:[工作项编号]_验证[功能点]_预期[期望结果]), C-维护人, D-用例类型(功能测试/手工接口测试/数据类测试/UI测试), E-重要程度(P0/P1/P2), F-关联工作项, G-前置条件, H-步骤描述, I-预期结果, J-备注, K-用例属性(正例/反例), L-所属版本, M-投产日
规则：每条用例只对应一个测试场景，H列步骤与I列预期严格1:1对应，K列必须标注正例或反例`
  useEffect(() => {
    if (!templateDoc) {
      setTemplateDoc({ name: '内置13列标准模板', path: '', content: BUILTIN_TEMPLATE_DESC })
    }
  }, [])

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
    // 尝试提取 ```json ... ``` 代码块
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (match) return match[1].trim()
    // 尝试提取纯 JSON 数组或对象
    const arrayMatch = text.match(/\[[\s\S]*\]/)
    if (arrayMatch) return arrayMatch[0]
    const objMatch = text.match(/\{[\s\S]*\}/)
    if (objMatch) return objMatch[0]
    // 最后的回退
    const start = text.indexOf('[')
    const start2 = text.indexOf('{')
    const idx = start === -1 ? start2 : (start2 === -1 ? start : Math.min(start, start2))
    if (idx === -1) throw new Error('响应中没有找到 JSON，请重试')
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

  /** 第一步：分析任务与需求文档的对应关系 */
  async function handleAnalyzeTasks() {
    if (reqDocs.length === 0) {
      toast.error('请先导入至少一份需求文档')
      return
    }
    if (!planDoc) {
      toast.error('请先导入测试计划')
      return
    }
    if (!aiConfig?.enabled) {
      toast.error('请先在 AI 设置中启用并配置模型')
      return
    }
    setGenerating(true)
    setTaskMatches([])
    setCheckedTasks(new Set())
    try {
      const parts: string[] = []
      parts.push('从测试计划的I列提取所有任务名称，逐一在需求文档中找到对应的内容章节。')
      parts.push('')
      parts.push('输出格式（每行一个，用 | 分隔三列）：')
      parts.push('- 任务名称 | 需求文档文件名 | 对应章节摘要')
      parts.push('示例：')
      parts.push('- 供应商准入 | 供应商管理需求.md | 第3章 准入流程，包括企业信息填写、资质上传、提交审核')
      parts.push('')
      reqDocs.forEach((doc, i) => parts.push(`## 需求文档${reqDocs.length > 1 ? ` ${i + 1}` : ''}（文件名: ${doc.name}）\n${doc.content.slice(0, 8000)}`))
      parts.push(`## 测试计划\n${planDoc.content.slice(0, 8000)}`)
      parts.push('')
      parts.push('每行格式：- 任务名 | 文档文件名 | 章节摘要')
      parts.push('只输出列表，不要其他文字。如果某任务找不到对应需求，章节填"未找到"')

      const messages = [
        { role: 'system', content: '你是一个分析助手。根据测试计划I列提取任务，在需求文档中匹配对应章节。每行输出格式：- 任务名 | 文档文件名 | 章节摘要。只输出列表，不要任何其他内容。' },
        { role: 'user', content: parts.join('\n') },
      ]
      const reply = await api()?.aiChat?.(messages, aiConfig?.analysisModel)
      if (!reply) { toast.error('AI 服务不可用'); return }
      if (reply.startsWith('错误') || reply.startsWith('错误→')) {
        toast.error(reply)
        return
      }
      console.log('[TaskMatch] AI 原始响应(前500字):', reply.slice(0, 500))

      // 解析文本格式：- 任务名 | 文档名 | 章节
      const lines = reply.split('\n')
      const matches: { task: string; docName: string; section: string }[] = []
      for (const line of lines) {
        const trimmed = line.replace(/^[\s\-•*]+/, '').trim()
        if (!trimmed) continue
        const parts2 = trimmed.split('|')
        if (parts2.length >= 3) {
          matches.push({
            task: parts2[0].trim(),
            docName: parts2[1].trim(),
            section: parts2.slice(2).join('|').trim(),
          })
        }
      }

      // 如果管道符解析失败，尝试冒号解析
      if (matches.length === 0) {
        for (const line of lines) {
          const trimmed = line.replace(/^[\s\-•*\d]+[\.\、\)\s]*/, '').trim()
          if (!trimmed || trimmed.length < 3) continue
          const colonIdx = trimmed.indexOf('：') !== -1 ? trimmed.indexOf('：') : trimmed.indexOf(':')
          if (colonIdx > 0) {
            matches.push({
              task: trimmed.slice(0, colonIdx).trim(),
              docName: '',
              section: trimmed.slice(colonIdx + 1).trim(),
            })
          } else {
            matches.push({ task: trimmed, docName: '', section: '' })
          }
        }
      }

      if (matches.length === 0) {
        toast.error('未能解析任务匹配结果，请重试')
        return
      }
      setTaskMatches(matches)
      setCheckedTasks(new Set(matches.map((_, i) => i)))
      setGenStep('tasks')
      toast.success(`已匹配 ${matches.length} 个任务，请确认`)
    } catch (err: any) {
      const msg = err.message || '请重试'
      if (msg.includes('fetch failed') || msg.includes('Failed to fetch') || msg.includes('fetch')) {
        toast.error('无法连接 AI 服务，请检查：\n1. 网络是否正常\n2. AI 设置中的 API 地址和 Key\n3. 尝试切换模型')
      } else {
        toast.error(`分析失败: ${msg}`)
      }
    } finally { setGenerating(false) }
  }

  /** 第二步：根据确认的任务匹配分析功能点 */
  /** 第二步：根据确认的任务匹配分析功能点 */
  async function handleAnalyzePoints() {
    const confirmedTasks = taskMatches.filter((_, i) => checkedTasks.has(i))
    setGenerating(true)
    setFuncPoints([])
    setCheckedPoints(new Set())
    try {
      const parts: string[] = []
      parts.push('你是供应链金融测试专家。请根据以下已确认的任务-需求对应关系，分析每个任务的测试功能点。')
      parts.push('')
      parts.push('## 已确认的任务列表（仅分析这些）')
      confirmedTasks.forEach((t, i) => {
        parts.push(`${i + 1}. 任务: "${t.task}" → 需求: ${t.docName} → 章节: ${t.section}`)
      })
      parts.push('')
      if (designDoc) parts.push(`## 参考设计文档\n${designDoc.content}`)
      parts.push('')
      parts.push('## 需求文档全文（查找详细内容）')
      reqDocs.forEach((doc, i) => parts.push(`## ${doc.name}\n${doc.content.slice(0, 8000)}`))
      if (templateDoc) parts.push(`## 测试用例模板\n${templateDoc.content}`)
      if (genUserPrompt.trim()) parts.push(`## 用户补充说明\n${genUserPrompt.trim()}`)
      parts.push('')
      parts.push('## 输出要求')
      parts.push('用列表格式列出功能点，每行一个：')
      parts.push('- [任务名] 功能点名称：简要说明')
      parts.push('每个任务至少1个功能点，覆盖正向、异常、边界。用 - 开头，不要编号。')

      const messages = [
        { role: 'system', content: customAnalysisPrompt || '你是供应链金融测试专家。请根据用户提供的已确认任务列表和需求文档，为每个任务分析测试功能点。每个功能点一行，用 - 开头，格式：「- [任务名] 功能点名称：简要说明」。覆盖正向流程、异常场景、边界条件。只输出列表。' },
        { role: 'user', content: parts.join('\n') },
      ]
      const reply = await api()?.aiChat?.(messages, aiConfig?.analysisModel)
      if (!reply) { toast.error('AI 服务不可用'); return }
      if (reply.startsWith('错误') || reply.startsWith('错误→')) { toast.error(reply); return }
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
      parts.push('根据以下功能点生成测试用例，每行一个用例。')
      if (designDoc) parts.push(`## 参考设计文档\n${designDoc.content}`)
      reqDocs.forEach((doc, i) => parts.push(`## 参考需求文档${reqDocs.length > 1 ? ` ${i + 1}` : ''}\n${doc.content.slice(0, 8000)}`))
      parts.push('')
      parts.push('## 功能点')
      selectedPoints.forEach((p, i) => parts.push(`${i + 1}. ${p}`))
      if (genUserPrompt.trim()) parts.push(`\n## 补充要求\n${genUserPrompt.trim()}`)
      parts.push('')
      parts.push('## 输出格式（每行一个用例，用 | 分隔6列）')
      parts.push('- 用例名称 | 类型 | 优先级 | 前置条件 | 步骤(用；分隔) | 预期结果')
      parts.push('类型：正向/异常/边界，优先级：P0/P1/P2')
      parts.push('示例：')
      parts.push('- 正常提交授信申请 | 正向 | P0 | 企业已登录 | 1.进入授信页；2.填写信息；3.提交 | 提交成功，状态待审批')
      parts.push('每个功能点至少1个用例。只输出列表，不要其他文字。')

      const messages = [
        { role: 'system', content: '根据功能点生成测试用例。每行格式：- 用例名称 | 类型 | 优先级 | 前置条件 | 步骤(；分隔) | 预期结果。只输出列表。' },
        { role: 'user', content: parts.join('\n') },
      ]
      const reply = await api()?.aiChat?.(messages, aiConfig?.analysisModel)
      if (!reply) { toast.error('AI 服务不可用'); return }
      if (reply.startsWith('错误') || reply.startsWith('错误→')) { toast.error(reply); return }
      console.log('[GenCases] AI 原始响应:', reply.slice(0, 500))

      // 解析文本格式
      const lines = reply.split('\n')
      const caseList: any[] = []
      for (const line of lines) {
        const trimmed = line.replace(/^[\s\-•*]+/, '').trim()
        if (!trimmed) continue
        const parts2 = trimmed.split('|')
        if (parts2.length >= 4) {
          const name = parts2[0].trim()
          const type = parts2[1].trim() || '正向'
          const priority = parts2[2].trim() || 'P1'
          const precondition = parts2[3].trim()
          const stepsRaw = (parts2[4] || '').trim()
          const steps = stepsRaw.split(/[；;]/).map(s => s.trim()).filter(s => s)
          const expected = parts2.slice(5).join('|').trim() || stepsRaw
          if (name) {
            caseList.push({
              name, type, priority, precondition,
              steps: steps.length > 0 ? steps : [stepsRaw],
              expectedResult: expected,
              testData: {},
            })
          }
        }
      }
      if (caseList.length === 0) {
        toast.error('未能解析用例，请重试')
        return
      }
      const withIds = caseList.map((c: any, i: number) => ({ ...c, id: `TC-${String(i + 1).padStart(3, '0')}` }))
      setGenCases(withIds)
      setGenStep('result')
      setGenTab('result')
      toast.success(`已生成 ${withIds.length} 个用例`)
    } catch (err: any) {
      toast.error(`生成失败: ${err.message || '请重试'}`)
    } finally { setGenerating(false) }
  }

  async function handleExportExcel() {
    if (genCases.length === 0) { toast.error('没有可导出的用例'); return }
    try {
      const api = (window as any).supplyChainTester
      const result = await api?.exportTestCases?.(TEST_CASE_TEMPLATE_BASE64, genCases)
      if (result?.ok && result.path) {
        toast.success(`已导出到桌面: ${result.path.split('/').pop()}`)
      } else {
        toast.error(result?.error || '导出失败')
      }
    } catch (err: any) {
      toast.error(`导出失败: ${err.message}`)
    }
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
            <select
              value={aiConfig?.analysisModel || 'llm-pro'}
              onChange={e => {
                const newModel = e.target.value
                if (aiConfig) {
                  saveAIConfig({ ...aiConfig, analysisModel: newModel })
                }
              }}
              className="ml-2 text-[10px] bg-accent/10 text-accent-light px-1.5 py-0.5 rounded border-0 outline-none cursor-pointer hover:bg-accent/20"
            >
              {[...AI_MODELS, ...(aiConfig?.customModels || [])].map(m => (
                <option key={m.value} value={m.value} className="text-foreground bg-surface">{m.label}</option>
              ))}
            </select>
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
                <label className="text-xs text-muted mb-2 block">导入参考文档（需求文档、测试计划必传，其余选填）</label>
                <div className="grid grid-cols-4 gap-2">
                  <DocImporter icon="📐" label="设计文档" doc={designDoc}
                    onImport={() => pickAndSet(setDesignDoc)} onRemove={() => setDesignDoc(null)}
                    onDrop={e => handleDrop(e, setDesignDoc)} />
                  <ReqDocsImporter
                    onImport={async () => {
                      const res = await api()?.pickFile?.()
                      if (res?.ok && res.path && res.content) {
                        const name = res.path.split(/[/\\]/).pop() || res.path
                        setReqDocs(prev => [...prev, { name, path: res.path, content: res.content }])
                        toast.success(`已导入: ${name}`)
                      } else if (!res?.canceled) {
                        toast.error(res?.error || '导入失败')
                      }
                    }}
                    onDrop={async (e) => {
                      e.preventDefault()
                      const file = e.dataTransfer.files?.[0]
                      if (!file) return
                      const filePath = (file as any).path || file.name
                      try {
                        const text = await file.text()
                        setReqDocs(prev => [...prev, { name: file.name, path: filePath, content: text.slice(0, 50000) }])
                        toast.success(`已导入: ${file.name}`)
                      } catch { toast.error('读取文件失败') }
                    }}
                    docs={reqDocs}
                    onRemove={(i) => setReqDocs(prev => prev.filter((_, j) => j !== i))}
                  />
                  <DocImporter icon="📝" label="用例模板" doc={templateDoc}
                    onImport={() => pickAndSet(setTemplateDoc)} onRemove={() => setTemplateDoc(null)}
                    onDrop={e => handleDrop(e, setTemplateDoc)} />
                  <DocImporter icon="📊" label="测试计划" doc={planDoc} required
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

              {/* 提示词配置 */}
              <div>
                <button onClick={() => setShowPromptConfig(!showPromptConfig)}
                  className="flex items-center gap-1 text-[10px] text-muted hover:text-foreground transition-colors">
                  <ChevronDown size={10} className={`transition-transform ${showPromptConfig ? '' : '-rotate-90'}`} />
                  提示词配置（自定义 Skills / Prompt）
                </button>
                {showPromptConfig && (
                  <div className="mt-2 space-y-2">
                    <div>
                      <label className="text-[10px] text-muted mb-1 block">System Prompt（生成用例用）</label>
                      <textarea value={customSysPrompt}
                        onChange={e => { setCustomSysPrompt(e.target.value); localStorage.setItem('tc-sys-prompt', e.target.value) }}
                        className="w-full h-24 rounded-lg px-3 py-2 text-[11px] font-mono bg-surface border border-border/5 focus:border-accent/50 resize-none outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted mb-1 block">功能点分析 Prompt（选填，不填用默认）</label>
                      <textarea value={customAnalysisPrompt}
                        onChange={e => { setCustomAnalysisPrompt(e.target.value); localStorage.setItem('tc-analysis-prompt', e.target.value) }}
                        placeholder="默认: 你是供应链金融测试专家。只输出功能点列表..."
                        className="w-full h-16 rounded-lg px-3 py-2 text-[11px] font-mono bg-surface border border-border/5 focus:border-accent/50 resize-none outline-none placeholder:text-muted/40"
                      />
                    </div>
                    <button onClick={() => {
                      setCustomSysPrompt(SYSTEM_PROMPT); setCustomAnalysisPrompt('')
                      localStorage.removeItem('tc-sys-prompt'); localStorage.removeItem('tc-analysis-prompt')
                      toast.success('已恢复默认提示词')
                    }} className="text-[10px] text-muted hover:text-accent transition-colors">恢复默认提示词</button>
                  </div>
                )}
              </div>
              {genStep === 'input' && (
                <Button onClick={handleAnalyzeTasks} disabled={generating} className="w-full" size="lg">
                  {generating ? <><Loader2 size={14} className="animate-spin" /> AI 正在分析任务与需求对应关系...</> : <><Sparkles size={14} /> 分析任务与需求对应关系</>}
                </Button>
              )}

              {genStep === 'tasks' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">AI 匹配的任务-需求对应关系（可取消勾选不需要的）</span>
                    <button onClick={() => {
                      if (checkedTasks.size === taskMatches.length) {
                        setCheckedTasks(new Set())
                      } else {
                        setCheckedTasks(new Set(taskMatches.map((_, i) => i)))
                      }
                    }} className="text-[10px] text-accent hover:underline">
                      {checkedTasks.size === taskMatches.length ? '取消全选' : '全选'}
                    </button>
                  </div>
                  <div className="overflow-x-auto max-h-64 overflow-y-auto border border-border/10 rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-surface sticky top-0">
                        <tr>
                          <th className="w-8 p-2 text-left">
                            <input type="checkbox"
                              checked={checkedTasks.size === taskMatches.length && taskMatches.length > 0}
                              onChange={() => {
                                if (checkedTasks.size === taskMatches.length) {
                                  setCheckedTasks(new Set())
                                } else {
                                  setCheckedTasks(new Set(taskMatches.map((_, i) => i)))
                                }
                              }}
                              className="rounded accent-accent" />
                          </th>
                          <th className="p-2 text-left text-muted font-medium">计划任务</th>
                          <th className="p-2 text-left text-muted font-medium">需求文档</th>
                          <th className="p-2 text-left text-muted font-medium">对应内容</th>
                        </tr>
                      </thead>
                      <tbody>
                        {taskMatches.map((t, i) => (
                          <tr key={i} className={`border-t border-border/5 ${checkedTasks.has(i) ? '' : 'opacity-40'}`}>
                            <td className="p-2">
                              <input type="checkbox" checked={checkedTasks.has(i)}
                                onChange={() => {
                                  const next = new Set(checkedTasks)
                                  if (next.has(i)) next.delete(i); else next.add(i)
                                  setCheckedTasks(next)
                                }}
                                className="rounded accent-accent" />
                            </td>
                            <td className="p-2 font-medium">{t.task}</td>
                            <td className="p-2 text-muted">{t.docName}</td>
                            <td className="p-2 text-muted/80 text-[10px] max-w-[200px] truncate" title={t.section}>{t.section}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button onClick={handleAnalyzePoints} disabled={generating} className="w-full" size="lg">
                    {generating ? <><Loader2 size={14} className="animate-spin" /> AI 正在分析功能点...</> : <>✅ 确认，分析功能点（{checkedTasks.size} 个任务）</>}
                  </Button>
                  <button onClick={() => { setGenStep('input'); setTaskMatches([]) }} className="w-full text-[10px] text-muted hover:text-foreground">← 返回重新分析任务</button>
                </div>
              )}

              {genStep === 'points' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">AI 分析出的功能点（可取消勾选不需要的）</span>
                    <button onClick={() => {
                      if (checkedPoints.size === funcPoints.length) {
                        setCheckedPoints(new Set())
                      } else {
                        setCheckedPoints(new Set(funcPoints.map((_, i) => i)))
                      }
                    }} className="text-[10px] text-accent hover:underline">
                      {checkedPoints.size === funcPoints.length ? '取消全选' : '全选'}
                    </button>
                  </div>
                  <div className="overflow-x-auto max-h-64 overflow-y-auto border border-border/10 rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-surface sticky top-0">
                        <tr>
                          <th className="w-8 p-2 text-left">
                            <input type="checkbox"
                              checked={checkedPoints.size === funcPoints.length && funcPoints.length > 0}
                              onChange={() => {
                                if (checkedPoints.size === funcPoints.length) {
                                  setCheckedPoints(new Set())
                                } else {
                                  setCheckedPoints(new Set(funcPoints.map((_, i) => i)))
                                }
                              }}
                              className="rounded accent-accent" />
                          </th>
                          <th className="p-2 text-left text-muted font-medium">任务</th>
                          <th className="p-2 text-left text-muted font-medium">功能点描述</th>
                        </tr>
                      </thead>
                      <tbody>
                        {funcPoints.map((point, i) => {
                          const bracketMatch = point.match(/^\[([^\]]+)\]\s*/)
                          const task = bracketMatch ? bracketMatch[1] : ''
                          const desc = bracketMatch ? point.slice(bracketMatch[0].length) : point
                          return (
                            <tr key={i} className={`border-t border-border/5 ${checkedPoints.has(i) ? '' : 'opacity-40'}`}>
                              <td className="p-2">
                                <input type="checkbox" checked={checkedPoints.has(i)}
                                  onChange={() => {
                                    const next = new Set(checkedPoints)
                                    if (next.has(i)) next.delete(i); else next.add(i)
                                    setCheckedPoints(next)
                                  }}
                                  className="rounded accent-accent" />
                              </td>
                              <td className="p-2 font-medium whitespace-nowrap">{task}</td>
                              <td className="p-2 text-muted/80">{desc}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
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
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={handleExportExcel} disabled={generating}>
                  <Download size={12} /> 导出 Excel
                </Button>
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
  function DocImporter({ icon, label, doc, onImport, onRemove, onDrop, required }: {
    icon: string; label: string
    doc: { name: string; path: string; content: string } | null
    onImport: () => void; onRemove: () => void
    onDrop: (e: React.DragEvent) => void
    required?: boolean
  }) {
    const [dragOver, setDragOver] = useState(false)
    return (
      <div
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }}
        onDragLeave={e => { e.preventDefault(); setDragOver(false) }}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragOver(false); onDrop(e) }}
        onClick={onImport}
        className={`flex items-center gap-1.5 px-3 py-4 rounded-lg border transition-all cursor-pointer ${
          doc ? 'border-accent/30 bg-accent/5' : required ? 'border-dashed border-red-400/30 bg-surface hover:border-accent/40 hover:bg-accent/5' : 'border-dashed border-border/20 bg-surface hover:border-accent/40 hover:bg-accent/5'
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
              {label}{required && <span className="text-red-400"> *必填</span>}<br /><span className="text-[9px] text-muted/40">点击或拖入</span>
            </p>
          )}
        </div>
        {doc && (
          <button onClick={(e) => { e.stopPropagation(); onRemove() }} className="text-[10px] text-muted hover:text-red-400 shrink-0">✕</button>
        )}
      </div>
    )
  }

  /** 需求文档导入组件 — 支持导入多份 */
  function ReqDocsImporter({ docs, onImport, onDrop, onRemove }: {
    docs: { name: string; path: string; content: string }[]
    onImport: () => void; onDrop: (e: React.DragEvent) => void
    onRemove: (i: number) => void
  }) {
    const [dragOver, setDragOver] = useState(false)
    return (
      <div
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }}
        onDragLeave={e => { e.preventDefault(); setDragOver(false) }}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragOver(false); onDrop(e) }}
        onClick={onImport}
        className={`flex flex-col gap-1 px-3 py-2 rounded-lg border transition-all cursor-pointer ${
          docs.length > 0 ? 'border-accent/30 bg-accent/5' : 'border-dashed border-red-400/30 bg-surface hover:border-accent/40 hover:bg-accent/5'
        } ${dragOver ? 'border-accent !border-accent-light ring-2 ring-accent/40 shadow-lg shadow-accent/20 scale-[1.02]' : ''}`}
      >
        <div className="flex items-center gap-1.5 pointer-events-none">
          <span className="text-sm shrink-0">📋</span>
          <p className="text-[10px] font-medium leading-tight">
            需求文档{docs.length > 0 ? ` (${docs.length})` : <span className="text-red-400"> *必填</span>}
          </p>
        </div>
        {docs.length === 0 && (
          <p className="text-[9px] text-muted/40 text-center pointer-events-none">点击或拖入</p>
        )}
        {docs.map((doc, i) => (
          <div key={i} className="flex items-center gap-1 text-[9px] bg-accent/10 rounded px-1.5 py-0.5">
            <span className="text-accent-light truncate flex-1" title={doc.path}>{doc.name}</span>
            <button onClick={(e) => { e.stopPropagation(); onRemove(i) }} className="text-muted hover:text-red-400 shrink-0">✕</button>
          </div>
        ))}
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
