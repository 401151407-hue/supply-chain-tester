import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import type { AIConfig } from '@shared/types'
import { X, CheckCircle2, XCircle, Loader2, Sparkles, Key, Globe, Cpu } from 'lucide-react'
import { LocalModelPanel } from './LocalModelPanel'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet'
import { toast } from '../lib/toast'

interface Props {
  onClose: () => void
}

// 提供商快速配置
const PROVIDERS: { id: string; name: string; base: string; models: string[] }[] = [
  { id: 'internal', name: '内部算力', base: 'http://10.100.22.203:30080/llmsec/wxsllm/v1', models: ['llm-pro', 'llm-plus', 'llm-flash'] },
  { id: 'deepseek', name: 'DeepSeek', base: 'https://api.deepseek.com/v1', models: ['deepseek-v4-pro', 'deepseek-v4-flash'] },
  { id: 'qwen', name: '通义千问', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-max', 'qwen-plus', 'qwen-turbo'] },
  { id: 'moonshot', name: '月之暗面', base: 'https://api.moonshot.cn/v1', models: ['moonshot-v1'] },
  { id: 'ollama', name: 'Ollama 本地', base: 'http://localhost:11434/v1', models: ['qwen2.5:7b', 'llama3:8b', 'deepseek-r1:7b', 'codellama:7b'] },
  { id: 'lmstudio', name: 'LM Studio 本地', base: 'http://localhost:1234/v1', models: ['local-model'] },
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
  const [tab, setTab] = useState<'cloud' | 'local'>('cloud')

  useEffect(() => { loadAIConfig() }, [])

  const api = () => (window as any).supplyChainTester

  function selectProvider(prov: typeof PROVIDERS[0]) {
    const savedKey = localStorage.getItem(`ai-key-${prov.models[0]}`) || ''
    setForm(prev => ({
      ...prev,
      apiBase: prov.base,
      apiKey: savedKey || (prov.id === 'internal' ? prev.apiKey : ''),
      analysisModel: prov.models[0],
      generationModel: prov.models[prov.models.length - 1],
    }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveAIConfig(form)
      // 按模型保存独立 Key
      PROVIDERS.forEach(p => {
        if (form.apiBase === p.base && form.apiKey) {
          p.models.forEach(m => localStorage.setItem(`ai-key-${m}`, form.apiKey))
        }
      })
      setTestResult({ ok: true, message: '配置已保存' })
      toast.success('配置已保存')
    } catch (err: any) {
      setTestResult({ ok: false, message: `保存失败: ${err.message}` })
      toast.error(`保存失败: ${err.message}`)
    } finally { setSaving(false) }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      await saveAIConfig(form)
      // 等配置生效
      await new Promise(r => setTimeout(r, 300))
    } catch {}
    try {
      const result = await api().testAIConnection()
      setTestResult(result)
      if (result.ok) toast.success('连接成功')
      else toast.error(result.message)
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || String(err) })
      toast.error(err.message || '连接失败')
    } finally { setTesting(false) }
  }

  function updateField<K extends keyof AIConfig>(key: K, value: AIConfig[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-[420px] sm:max-w-[420px] p-0 overflow-y-auto">
        <SheetHeader className="px-5 py-3">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <Sparkles size={16} className="text-purple-400" />
            模型配置
          </SheetTitle>
        </SheetHeader>

        {/* 标签切换 */}
        <div className="flex items-center gap-1 px-5 py-2 bg-surface/50">
          <button
            onClick={() => setTab('cloud')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
              tab === 'cloud' ? 'bg-accent/10 text-accent-light font-medium' : 'text-muted hover:text-foreground'
            }`}
          >
            <Globe size={13} /> 云端配置
          </button>
          <button
            onClick={() => setTab('local')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
              tab === 'local' ? 'bg-purple-500/10 text-purple-400 font-medium' : 'text-muted hover:text-foreground'
            }`}
          >
            <Cpu size={13} /> 本地模型
          </button>
        </div>

        {tab === 'cloud' ? (
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

          {/* API 地址 */}
          <div>
            <label className="flex items-center gap-1.5 text-xs text-muted mb-1">
              <Globe size={11} /> API 地址
            </label>
            <input className="w-full bg-surface rounded-lg px-3 py-2 text-[11px] font-mono outline-none border border-border/5 focus:border-accent/50"
              value={form.apiBase} onChange={e => updateField('apiBase', e.target.value)} placeholder="https://api.deepseek.com/v1" />
            <p className="text-[10px] text-muted/60 mt-1">选择提供商后自动填入，也可手动修改。模型在 AI 助手对话顶部切换</p>
          </div>

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
        ) : (
          <div className="p-4">
            <LocalModelPanel />
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
