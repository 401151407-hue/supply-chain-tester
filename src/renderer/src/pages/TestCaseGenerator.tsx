/**
 * 测试用例生成器
 * 
 * 固化 Prompt + 统一模型 → 不同用户生成结果一致
 */
import React, { useState } from 'react'
import { Shield, TrendingUp, RefreshCw, ClipboardList, CheckCircle, Edit, Sparkles, Loader2, Copy, Download, Plus, Trash2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { toast } from '../lib/toast'
import { TEST_CASE_TEMPLATES, SYSTEM_PROMPT } from '../lib/test-case-prompts'

interface GenCase {
  id: string
  name: string
  type: string
  priority: string
  precondition: string
  steps: string[]
  expectedResult: string
  testData: Record<string, string>
}

export function TestCaseGenerator() {
  const api = () => (window as any).supplyChainTester
  const [selectedTemplate, setSelectedTemplate] = useState(TEST_CASE_TEMPLATES[0])
  const [customPrompt, setCustomPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [cases, setCases] = useState<GenCase[]>([])
  const [activeTab, setActiveTab] = useState('generate')

  async function handleGenerate() {
    const prompt = selectedTemplate.id === 'custom' ? customPrompt : selectedTemplate.prompt
    if (!prompt.trim()) {
      toast.error('请先选择场景或输入自定义需求')
      return
    }

    setGenerating(true)
    setCases([])
    try {
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ]

      const reply = await api()?.aiChat?.(messages)
      if (!reply) {
        toast.error('AI 服务不可用，请检查模型配置')
        return
      }

      // 解析 JSON
      const jsonStr = extractJSON(reply)
      const parsed = JSON.parse(jsonStr)

      // 支持 { cases: [...] } 或直接数组
      const caseList: GenCase[] = Array.isArray(parsed) ? parsed : (parsed.cases || [parsed])

      if (caseList.length === 0) {
        toast.error('未能解析出有效用例，请重试')
        return
      }

      // 补充 id
      const withIds = caseList.map((c, i) => ({
        ...c,
        id: c.id || `TC-${String(i + 1).padStart(3, '0')}`,
      }))
      setCases(withIds)
      setActiveTab('result')
      toast.success(`已生成 ${withIds.length} 个用例`)
    } catch (err: any) {
      console.error('生成用例失败:', err)
      toast.error(`生成失败: ${err.message || '请重试'}`)
    } finally {
      setGenerating(false)
    }
  }

  function extractJSON(text: string): string {
    // 尝试提取 ```json ... ``` 代码块
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (match) return match[1].trim()
    // 尝试找到 { 或 [ 开头的内容
    const start = text.indexOf('[')
    const start2 = text.indexOf('{')
    const idx = start === -1 ? start2 : (start2 === -1 ? start : Math.min(start, start2))
    if (idx === -1) throw new Error('响应中没有找到 JSON')
    return text.slice(idx)
  }

  function handleCopy() {
    const text = JSON.stringify(cases, null, 2)
    navigator.clipboard.writeText(text)
    toast.success('已复制到剪贴板')
  }

  function handleImport() {
    // 导入到现有测试用例系统
    cases.forEach(c => {
      const tc = {
        id: c.id,
        type: 'api' as const,
        name: c.name,
        description: `${c.precondition}\n预期: ${c.expectedResult}`,
        tags: [c.type, c.priority, selectedTemplate.name],
        steps: c.steps.map((s, i) => ({
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
      }
      // 保存到 store
      const store = (window as any).__zustandStore
      if (store) {
        const current = store.getState().testCases || []
        store.setState({ testCases: [...current, tc] })
      }
    })
    toast.success(`已导入 ${cases.length} 个用例到测试编辑器`)
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border/[0.03]">
        <Sparkles size={18} className="text-purple-400" />
        <div>
          <h2 className="text-sm font-semibold">测试用例生成器</h2>
          <p className="text-[11px] text-muted">标准化 Prompt 模板 — 不同人使用生成结果一致</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-5 mt-3">
          <TabsTrigger value="generate">生成用例</TabsTrigger>
          <TabsTrigger value="result" disabled={cases.length === 0}>生成结果 ({cases.length})</TabsTrigger>
        </TabsList>

        {/* 生成页 */}
        <TabsContent value="generate" className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
          {/* 场景选择 */}
          <div>
            <label className="text-xs text-muted mb-2 block">选择业务场景</label>
            <div className="grid grid-cols-3 gap-2">
              {TEST_CASE_TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setSelectedTemplate(t); if (t.id === 'custom') setCustomPrompt('') }}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center ${
                    selectedTemplate.id === t.id
                      ? 'border-accent/50 bg-accent/10 text-accent-light'
                      : 'border-border/10 hover:border-border/30 text-muted hover:text-foreground'
                  }`}
                >
                  <span className="text-lg">{getIcon(t.icon)}</span>
                  <span className="text-[11px] font-medium leading-tight">{t.name}</span>
                  <span className="text-[10px] text-muted/60">{t.scenario}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 自定义需求输入 */}
          {selectedTemplate.id === 'custom' && (
            <div>
              <label className="text-xs text-muted mb-1 block">描述你的测试需求</label>
              <textarea
                value={customPrompt}
                onChange={e => setCustomPrompt(e.target.value)}
                placeholder={'例如：为「企业信息变更」场景生成测试用例，覆盖名称变更、法人变更、注册资本变更...'}
                className="w-full h-32 rounded-lg px-3 py-2 text-sm bg-surface border border-border/5 focus:border-accent/50 resize-none outline-none placeholder:text-muted/40"
              />
            </div>
          )}

          {/* 预览选中的 Prompt */}
          {selectedTemplate.id !== 'custom' && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs flex items-center gap-2">
                  <Sparkles size={11} className="text-purple-400" />
                  将使用的 Prompt 模板（固化，不可修改）
                </CardTitle>
                <CardDescription className="text-[10px]">统一提示词保证所有人生成的用例一致</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="text-[10px] text-muted whitespace-pre-wrap max-h-32 overflow-y-auto bg-surface rounded-lg p-2.5 border border-border/5">
                  {selectedTemplate.prompt.slice(0, 300)}
                  {selectedTemplate.prompt.length > 300 && '...'}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* 生成按钮 */}
          <Button onClick={handleGenerate} disabled={generating} className="w-full" size="lg">
            {generating ? (
              <><Loader2 size={14} className="animate-spin" /> 正在生成...</>
            ) : (
              <><Sparkles size={14} /> 生成测试用例</>
            )}
          </Button>

          {/* 使用提示 */}
          <div className="text-[10px] text-muted/60 text-center space-y-0.5">
            <p>💡 使用 <code className="bg-surface px-1 rounded">qwen2.5:7b</code> 本地模型即可获得稳定结果</p>
            <p>🔒 Prompt 模板已固化，不同用户生成效果一致</p>
          </div>
        </TabsContent>

        {/* 结果页 */}
        <TabsContent value="result" className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">共 {cases.length} 个用例</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy}>
                <Copy size={12} /> 复制 JSON
              </Button>
              <Button size="sm" onClick={handleImport}>
                <Download size={12} /> 导入测试编辑器
              </Button>
            </div>
          </div>

          {cases.map((c, i) => (
            <Card key={c.id || i} className="animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
              <CardHeader className="pb-2 flex flex-row items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted">{c.id}</span>
                    {c.name}
                  </CardTitle>
                  <CardDescription>{c.precondition}</CardDescription>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Badge variant={c.type === '正向' ? 'success' : c.type === '异常' ? 'destructive' : 'warning'} className="text-[10px]">
                    {c.type}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">{c.priority}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <span className="text-[10px] text-muted">测试步骤:</span>
                  <ol className="mt-0.5 space-y-0.5">
                    {c.steps.map((s, j) => (
                      <li key={j} className="text-xs text-foreground ml-4 list-decimal">{s}</li>
                    ))}
                  </ol>
                </div>
                <div>
                  <span className="text-[10px] text-muted">预期结果:</span>
                  <p className="text-xs text-foreground mt-0.5">{c.expectedResult}</p>
                </div>
                {c.testData && Object.keys(c.testData).length > 0 && (
                  <div>
                    <span className="text-[10px] text-muted">测试数据:</span>
                    <div className="flex flex-wrap gap-1.5 mt-0.5">
                      {Object.entries(c.testData).map(([k, v]) => (
                        <span key={k} className="text-[10px] bg-surface px-1.5 py-0.5 rounded border border-border/10">
                          <span className="text-muted">{k}:</span> <span className="text-foreground">{String(v)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function getIcon(name: string): string {
  const map: Record<string, string> = {
    Shield: '🛡️', TrendingUp: '📈', RefreshCw: '🔄',
    ClipboardList: '📋', CheckCircle: '✅', Edit: '✏️',
  }
  return map[name] || '📝'
}
