import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import type { AIConfig } from '@shared/types'
import { X, CheckCircle2, XCircle, Loader2, Sparkles, Key, Globe, Cpu } from 'lucide-react'

interface Props {
  onClose: () => void
}

export function AISettingsPanel({ onClose }: Props) {
  const { aiConfig, loadAIConfig, saveAIConfig } = useAppStore()
  const [form, setForm] = useState<AIConfig>({
    apiBase: 'http://10.100.22.203:30080/llmsec/wxsllm/v1',
    apiKey: 'llm-sk-y2ZW6Gvm-bQjif7EsrmsVg',
    analysisModel: 'llm-pro',
    generationModel: 'llm-flash',
    enabled: true,
  })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadAIConfig()
  }, [])

  useEffect(() => {
    if (aiConfig) {
      setForm({ ...aiConfig })
    }
  }, [aiConfig])

  const api = () => (window as any).supplyChainTester

  async function handleSave() {
    setSaving(true)
    try {
      await saveAIConfig(form)
      setTestResult({ ok: true, message: '配置已保存' })
    } catch (err: any) {
      setTestResult({ ok: false, message: `保存失败: ${err.message}` })
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    // 先保存当前配置
    try {
      await saveAIConfig(form)
    } catch {}

    try {
      const result = await api().testAIConnection()
      setTestResult(result)
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || String(err) })
    } finally {
      setTesting(false)
    }
  }

  function updateField<K extends keyof AIConfig>(key: K, value: AIConfig[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface-light border border-border/10 rounded-2xl w-[520px] max-h-[80vh] overflow-y-auto shadow-2xl animate-fade-in">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/5">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-purple-400" />
            <h2 className="text-base font-semibold">AI 算力配置</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-hover/10 text-muted hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* 表单 */}
        <div className="p-5 space-y-4">
          {/* 启用开关 */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">启用 AI 功能</label>
            <button
              onClick={() => updateField('enabled', !form.enabled)}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                form.enabled ? 'bg-accent' : 'bg-hover/10'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  form.enabled ? 'left-5' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          {/* API Base */}
          <div>
            <label className="flex items-center gap-1.5 text-xs text-muted mb-1.5">
              <Globe size={12} /> API Base URL
            </label>
            <input
              className="w-full bg-surface rounded-lg px-3 py-2 text-sm font-mono outline-none
                         border border-border/5 focus:border-accent/50 transition-colors
                         placeholder:text-muted/50"
              value={form.apiBase}
              onChange={e => updateField('apiBase', e.target.value)}
              placeholder="http://10.100.22.203:30080/llmsec/wxsllm/v1"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="flex items-center gap-1.5 text-xs text-muted mb-1.5">
              <Key size={12} /> API Key
            </label>
            <input
              className="w-full bg-surface rounded-lg px-3 py-2 text-sm font-mono outline-none
                         border border-border/5 focus:border-accent/50 transition-colors
                         placeholder:text-muted/50"
              type="password"
              value={form.apiKey}
              onChange={e => updateField('apiKey', e.target.value)}
              placeholder="llm-sk-..."
            />
          </div>

          {/* 模型选择 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1.5 text-xs text-muted mb-1.5">
                <Cpu size={12} /> 分析模型（报告分析）
              </label>
              <select
                className="w-full bg-surface rounded-lg px-3 py-2 text-sm outline-none
                           border border-border/5 focus:border-accent/50 transition-colors"
                value={form.analysisModel}
                onChange={e => updateField('analysisModel', e.target.value)}
              >
                <option value="llm-pro">llm-pro（集团）</option>
                <option value="llm-plus">llm-plus（锡商）</option>
                <option value="llm-flash">llm-flash（锡商）</option>
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs text-muted mb-1.5">
                <Cpu size={12} /> 生成模型（步骤生成）
              </label>
              <select
                className="w-full bg-surface rounded-lg px-3 py-2 text-sm outline-none
                           border border-border/5 focus:border-accent/50 transition-colors"
                value={form.generationModel}
                onChange={e => updateField('generationModel', e.target.value)}
              >
                <option value="llm-pro">llm-pro（集团）</option>
                <option value="llm-plus">llm-plus（锡商）</option>
                <option value="llm-flash">llm-flash（锡商）</option>
              </select>
            </div>
          </div>

          <div className="text-[11px] text-muted bg-surface rounded-lg p-2.5 space-y-1">
            <p>💡 模型说明：</p>
            <p>• <strong>llm-pro</strong>（集团）— 最强性能，适合复杂分析和报告</p>
            <p>• <strong>llm-plus</strong>（锡商）— 均衡性能，适合通用任务</p>
            <p>• <strong>llm-flash</strong>（锡商）— 快速响应，适合步骤生成</p>
          </div>

          {/* 测试结果 */}
          {testResult && (
            <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${
              testResult.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
            }`}>
              {testResult.ok
                ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                : <XCircle size={16} className="mt-0.5 shrink-0" />
              }
              <span>{testResult.message}</span>
            </div>
          )}

          {/* 按钮 */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleTest}
              disabled={testing || !form.enabled}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium
                         bg-hover/5 hover:bg-hover/10 text-foreground
                         disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              测试连接
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium
                         bg-accent hover:bg-accent-light text-foreground
                         disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {saving ? '保存中...' : '保存配置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
