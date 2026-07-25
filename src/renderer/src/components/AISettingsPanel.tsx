import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import type { AIConfig } from '@shared/types'
import { X, CheckCircle2, XCircle, Loader2, Sparkles, Key, Globe } from 'lucide-react'

interface Props {
  onClose: () => void
}

// 提供商快速配置
const PROVIDERS: { id: string; name: string; base: string; models: string[] }[] = [
  { id: 'internal', name: '内部算力', base: 'http://10.100.22.203:30080/llmsec/wxsllm/v1', models: ['llm-pro', 'llm-plus', 'llm-flash'] },
  { id: 'deepseek', name: 'DeepSeek', base: 'https://api.deepseek.com/v1', models: ['deepseek-v4-pro', 'deepseek-v4-flash'] },
  { id: 'qwen', name: '通义千问', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-max', 'qwen-plus', 'qwen-turbo'] },
  { id: 'glm', name: '智谱 GLM', base: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4', 'glm-4-flash'] },
  { id: 'moonshot', name: '月之暗面', base: 'https://api.moonshot.cn/v1', models: ['moonshot-v1'] },
  { id: 'baichuan', name: '百川', base: 'https://api.baichuan-ai.com/v1', models: ['baichuan4'] },
  { id: 'ernie', name: '文心一言', base: 'https://qianfan.baidubce.com/v2', models: ['ernie-4.0'] },
  { id: 'openai', name: 'OpenAI', base: 'https://api.openai.com/v1', models: ['gpt-4o', 'gpt-4o-mini'] },
]

export function AISettingsPanel({ onClose }: Props) {
  const { aiConfig, loadAIConfig, saveAIConfig } = useAppStore()
  const [form, setForm] = useState<AIConfig>({
    apiBase: '',
    apiKey: '',
    analysisModel: 'llm-pro',
    generationModel: 'llm-flash',
    enabled: true,
  })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => { loadAIConfig() }, [])
  useEffect(() => { if (aiConfig) setForm({ ...aiConfig }) }, [aiConfig])

  const api = () => (window as any).supplyChainTester

  function selectProvider(prov: typeof PROVIDERS[0]) {
    setForm(prev => ({
      ...prev,
      apiBase: prov.base,
      analysisModel: prov.models[0],
      generationModel: prov.models[prov.models.length - 1],
    }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveAIConfig(form)
      setTestResult({ ok: true, message: '配置已保存' })
    } catch (err: any) {
      setTestResult({ ok: false, message: `保存失败: ${err.message}` })
    } finally { setSaving(false) }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try { await saveAIConfig(form) } catch {}
    try {
      const result = await api().testAIConnection()
      setTestResult(result)
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || String(err) })
    } finally { setTesting(false) }
  }

  function updateField<K extends keyof AIConfig>(key: K, value: AIConfig[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface-light border border-border/10 rounded-2xl w-[480px] max-h-[80vh] overflow-y-auto shadow-2xl animate-fade-in">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/5">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-purple-400" />
            <h2 className="text-sm font-semibold">模型配置</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-hover/10 text-muted hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* 启用开关 */}
          <div className="flex items-center justify-between">
            <span className="text-sm">启用 AI</span>
            <button onClick={() => updateField('enabled', !form.enabled)}
              className={`relative w-9 h-5 rounded-full transition-colors ${form.enabled ? 'bg-accent' : 'bg-hover/10'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.enabled ? 'left-4' : 'left-0.5'}`} />
            </button>
          </div>

          {/* 提供商快速选择 */}
          <div>
            <label className="text-xs text-muted mb-2 block">选择提供商（自动填入地址和模型）</label>
            <div className="grid grid-cols-4 gap-1.5">
              {PROVIDERS.map(prov => (
                <button key={prov.id}
                  onClick={() => selectProvider(prov)}
                  className={`text-xs px-2 py-2 rounded-lg border transition-all text-center
                    ${form.apiBase === prov.base ? 'border-accent/50 bg-accent/10 text-accent-light' : 'border-border/5 hover:border-border/20 text-muted hover:text-foreground'}`}>
                  {prov.name}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="flex items-center gap-1.5 text-xs text-muted mb-1">
              <Key size={11} /> API Key
            </label>
            <input className="w-full bg-surface rounded-lg px-3 py-2 text-sm font-mono outline-none border border-border/5 focus:border-accent/50 transition-colors placeholder:text-muted/50"
              type="password" value={form.apiKey} onChange={e => updateField('apiKey', e.target.value)}
              placeholder="sk-..." />
          </div>

          {/* 高级设置 */}
          <button onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors">
            <Globe size={11} />
            {showAdvanced ? '收起高级设置' : '高级设置（API 地址 / 模型名）'}
          </button>
          {showAdvanced && (
            <div className="space-y-3 pl-1">
              <input className="w-full bg-surface rounded-lg px-3 py-2 text-[11px] font-mono outline-none border border-border/5 focus:border-accent/50"
                value={form.apiBase} onChange={e => updateField('apiBase', e.target.value)} placeholder="API Base URL" />
              <div className="grid grid-cols-2 gap-2">
                <input className="bg-surface rounded-lg px-3 py-2 text-[11px] font-mono outline-none border border-border/5 focus:border-accent/50"
                  value={form.analysisModel} onChange={e => updateField('analysisModel', e.target.value)} placeholder="分析模型" />
                <input className="bg-surface rounded-lg px-3 py-2 text-[11px] font-mono outline-none border border-border/5 focus:border-accent/50"
                  value={form.generationModel} onChange={e => updateField('generationModel', e.target.value)} placeholder="生成模型" />
              </div>
            </div>
          )}

          {/* 测试结果 */}
          {testResult && (
            <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${testResult.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
              {testResult.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <XCircle size={14} className="mt-0.5 shrink-0" />}
              {testResult.message}
            </div>
          )}

          {/* 按钮 */}
          <div className="flex gap-2 pt-1">
            <button onClick={handleTest} disabled={testing || !form.enabled}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-hover/5 hover:bg-hover/10 disabled:opacity-40 transition-all">
              {testing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              测试连接
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-accent hover:bg-accent/90 disabled:opacity-40 transition-all">
              {saving ? '保存中...' : '保存配置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
