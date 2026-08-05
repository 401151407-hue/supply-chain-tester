import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import type { AIConfig } from '@shared/types'
import { X, CheckCircle2, XCircle, Loader2, Sparkles, Key, Globe, Cpu, Plus, Trash2, PlusCircle } from 'lucide-react'
import { LocalModelPanel } from './LocalModelPanel'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet'
import { toast } from '../lib/toast'

interface Props {
  onClose: () => void
}

interface CustomProvider { id: string; name: string; base: string; key: string; models: string[] }

function loadCustomProviders(): CustomProvider[] {
  try {
    const s = localStorage.getItem('ai-custom-providers')
    return s ? JSON.parse(s) : []
  } catch { return [] }
}

function saveCustomProviders(list: CustomProvider[]) {
  try { localStorage.setItem('ai-custom-providers', JSON.stringify(list)) } catch {}
}

// 提供商快速配置
const PROVIDERS: { id: string; name: string; base: string; models: string[] }[] = [
  { id: 'internal', name: '内部算力', base: 'http://10.100.22.203:30080/llmsec/wxsllm/v1', models: ['llm-pro', 'llm-plus', 'llm-flash'] },
  { id: 'deepseek', name: 'DeepSeek', base: 'https://api.deepseek.com/v1', models: ['deepseek-v4-pro', 'deepseek-v4-flash'] },
  { id: 'qwen', name: '通义千问', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-max', 'qwen-plus', 'qwen-turbo'] },
  { id: 'moonshot', name: '月之暗面', base: 'https://api.moonshot.cn/v1', models: ['moonshot-v1'] },
  { id: 'hunyuan', name: '腾讯混元', base: 'https://tokenhub.tencentmaas.com/v1', models: ['hy3'] },
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
    customModels: [],
  })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'cloud' | 'local'>('cloud')
  const [newModelValue, setNewModelValue] = useState('')
  const [newModelLabel, setNewModelLabel] = useState('')
  const [customProviders, setCustomProviders] = useState<CustomProvider[]>(loadCustomProviders)
  const [showNewProv, setShowNewProv] = useState(false)
  const [newProv, setNewProv] = useState({ name: '', base: '', key: '', models: '' })
  const [formKey, setFormKey] = useState(0)

  useEffect(() => { loadAIConfig() }, [])

  // 合并内置 + 自定义供应商
  const allProviders = [
    ...PROVIDERS,
    ...customProviders.map(p => ({ id: `custom-${p.id}`, name: p.name, base: p.base, models: p.models })),
  ]

  const api = () => (window as any).supplyChainTester

  function addCustomProvider() {
    const name = newProv.name.trim()
    const base = newProv.base.trim()
    const models = newProv.models.trim()
    if (!name || !base || !models) { toast.error('供应商名称、API地址、模型ID 为必填'); return }
    const id = name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '-').slice(0, 20)
    const newP: CustomProvider = {
      id,
      name,
      base,
      key: newProv.key.trim(),
      models: models.split(',').map(m => m.trim()).filter(Boolean),
    }
    const next = [...customProviders, newP]
    setCustomProviders(next)
    saveCustomProviders(next)
    // 自动填入
    setForm(prev => ({
      ...prev,
      apiBase: newP.base,
      apiKey: newP.key,
      analysisModel: newP.models[0],
      generationModel: newP.models[newP.models.length - 1],
    }))
    setShowNewProv(false)
    setNewProv({ name: '', base: '', key: '', models: '' })
    toast.success(`已添加供应商：${name}`)
  }

  function removeCustomProvider(id: string) {
    const next = customProviders.filter(p => p.id !== id)
    setCustomProviders(next)
    saveCustomProviders(next)
  }

  // 配置加载后同步到表单
  useEffect(() => {
    if (aiConfig) {
      setForm(prev => ({
        ...prev,
        ...aiConfig,
        customModels: aiConfig.customModels || [],
      }))
    }
  }, [aiConfig])

  function addCustomModel() {
    const value = newModelValue.trim()
    if (!value) { toast.error('请输入模型ID'); return }
    const custom = form.customModels || []
    if (custom.some(m => m.value === value)) { toast.error('该模型已存在'); return }
    const next = [...custom, { value, label: newModelLabel.trim() || value }]
    updateField('customModels', next)
    // 同步到 AIAssistant 的 localStorage
    try {
      localStorage.setItem('ai-custom-models', JSON.stringify(next.map(m => m.value)))
    } catch {}
    setNewModelValue('')
    setNewModelLabel('')
    toast.success('已添加自定义模型')
  }

  function removeCustomModel(value: string) {
    const next = (form.customModels || []).filter(m => m.value !== value)
    updateField('customModels', next)
    try {
      localStorage.setItem('ai-custom-models', JSON.stringify(next.map(m => m.value)))
    } catch {}
  }

  function selectProvider(prov: typeof PROVIDERS[0]) {
    const savedKey = localStorage.getItem(`ai-key-${prov.models[0]}`) || ''
    setFormKey(k => k + 1)
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
              {allProviders.map(prov => (
                <button key={prov.id}
                  onClick={() => selectProvider(prov)}
                  className={`relative text-xs px-2 py-2 rounded-lg border transition-all text-center group
                    ${form.apiBase === prov.base ? 'border-accent/50 bg-accent/10 text-accent-light' : 'border-border/5 hover:border-border/20 text-muted hover:text-foreground'}`}>
                  {prov.name}
                  {prov.id.startsWith('custom-') && (
                    <span
                      onClick={e => { e.stopPropagation(); removeCustomProvider(prov.id.replace('custom-', '')) }}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-surface border border-border/10 text-muted/50 hover:text-danger transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <X size={9} />
                    </span>
                  )}
                </button>
              ))}
              <button
                onClick={() => setShowNewProv(true)}
                className={`text-xs px-2 py-2 rounded-lg border border-dashed transition-all text-center
                  ${showNewProv ? 'border-accent/50 bg-accent/10 text-accent-light' : 'border-border/10 text-muted/50 hover:border-accent/30 hover:text-accent-light'}`}>
                <PlusCircle size={14} className="mx-auto mb-0.5" />
                新建
              </button>
            </div>
          </div>

          {/* 新建供应商表单 */}
          {showNewProv && (
            <div className="p-3 rounded-lg border border-accent/20 bg-accent/5 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-accent-light">新建供应商</span>
                <button onClick={() => setShowNewProv(false)} className="text-muted hover:text-foreground"><X size={14} /></button>
              </div>
              <input
                className="w-full bg-surface rounded-lg px-2.5 py-1.5 text-[11px] outline-none border border-border/5 focus:border-accent/50 placeholder:text-muted/50"
                value={newProv.name} onChange={e => setNewProv(p => ({ ...p, name: e.target.value }))}
                placeholder="供应商名称，如 OpenAI" />
              <input
                className="w-full bg-surface rounded-lg px-2.5 py-1.5 text-[11px] font-mono outline-none border border-border/5 focus:border-accent/50 placeholder:text-muted/50"
                value={newProv.base} onChange={e => setNewProv(p => ({ ...p, base: e.target.value }))}
                placeholder="API 地址，如 https://api.openai.com/v1" />
              <input
                className="w-full bg-surface rounded-lg px-2.5 py-1.5 text-[11px] font-mono outline-none border border-border/5 focus:border-accent/50 placeholder:text-muted/50"
                type="password" value={newProv.key} onChange={e => setNewProv(p => ({ ...p, key: e.target.value }))}
                placeholder="API Key（可选）" />
              <input
                className="w-full bg-surface rounded-lg px-2.5 py-1.5 text-[11px] font-mono outline-none border border-border/5 focus:border-accent/50 placeholder:text-muted/50"
                value={newProv.models} onChange={e => setNewProv(p => ({ ...p, models: e.target.value }))}
                placeholder="模型列表，逗号分隔，如 gpt-4o,gpt-4-turbo" />
              <div className="flex gap-1.5 pt-1">
                <button onClick={addCustomProvider}
                  className="flex-1 px-2 py-1.5 rounded-lg text-[11px] bg-accent text-white hover:bg-accent/90 transition-colors">
                  添加并应用
                </button>
                <button onClick={() => setShowNewProv(false)}
                  className="px-2 py-1.5 rounded-lg text-[11px] text-muted hover:bg-hover/5 transition-colors">
                  取消
                </button>
              </div>
            </div>
          )}

          {/* 切换供应商时下方表单区整体动画 */}
          <div key={formKey} className="animate-tab-switch">
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

          {/* 自定义模型管理 */}
          <div>
            <label className="flex items-center gap-1.5 text-xs text-muted mb-1.5">
              <Plus size={11} /> 自定义模型
            </label>
            <div className="flex gap-1.5 mb-1.5">
              <input
                className="flex-1 bg-surface rounded-lg px-2.5 py-1.5 text-[11px] font-mono outline-none border border-border/5 focus:border-accent/50 placeholder:text-muted/50"
                value={newModelValue} onChange={e => setNewModelValue(e.target.value)}
                placeholder="模型ID，如 my-model-v1" />
              <input
                className="flex-1 bg-surface rounded-lg px-2.5 py-1.5 text-[11px] outline-none border border-border/5 focus:border-accent/50 placeholder:text-muted/50"
                value={newModelLabel} onChange={e => setNewModelLabel(e.target.value)}
                placeholder="显示名称(可选)" />
              <button onClick={addCustomModel}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] bg-accent/10 text-accent-light hover:bg-accent/20 transition-colors shrink-0">
                <Plus size={11} /> 添加
              </button>
            </div>
            {(form.customModels || []).length > 0 ? (
              <div className="space-y-1">
                {(form.customModels || []).map(m => (
                  <div key={m.value} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-surface border border-border/5 text-[11px]">
                    <span className="font-mono text-accent-light">{m.value}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-muted">{m.label}</span>
                      <button onClick={() => removeCustomModel(m.value)} className="text-muted hover:text-danger transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-muted/60">暂无自定义模型，添加后可出现在 AI 助手和用例生成的模型下拉框中</p>
            )}
          </div>
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
