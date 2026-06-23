import React from 'react'
import type { TestCase, ApiTestStep, BusinessFlowStep, HttpMethod } from '@shared/types'
import {
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  Link,
} from 'lucide-react'

interface Props {
  testCase: TestCase
  onChange: (tc: TestCase) => void
  onAddApiStep: () => void
  onAddFlowStep: () => void
}

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']

export function TestCaseForm({ testCase, onChange, onAddApiStep, onAddFlowStep }: Props) {
  /** 更新用例基本信息 */
  function updateField(field: string, value: any) {
    onChange({ ...testCase, [field]: value })
  }

  /** 更新 API 步骤 */
  function updateApiStep(index: number, field: string, value: any) {
    if (testCase.type !== 'api') return
    const steps = [...testCase.steps] as ApiTestStep[]
    steps[index] = { ...steps[index], [field]: value }
    onChange({ ...testCase, steps } as TestCase)
  }

  /** 删除步骤 */
  function removeStep(index: number) {
    const steps = [...testCase.steps]
    steps.splice(index, 1)
    onChange({ ...testCase, steps } as TestCase)
  }

  /** 更新流程步骤 */
  function updateFlowStep(index: number, field: string, value: any) {
    if (testCase.type !== 'business-flow') return
    const steps = [...testCase.steps] as BusinessFlowStep[]
    steps[index] = { ...steps[index], [field]: value }
    onChange({ ...testCase, steps } as TestCase)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 基本信息 */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted uppercase tracking-wider">基本信息</h3>
        <textarea
          className="w-full bg-surface-light rounded-lg px-3 py-2 text-sm outline-none
                     border border-border/5 focus:border-accent/50 transition-colors
                     resize-none placeholder:text-muted/50"
          rows={3}
          value={testCase.description}
          onChange={e => updateField('description', e.target.value)}
          placeholder="描述测试场景，如：验证采购订单创建的 API 的完整流程，包括订单创建、审核、入库通知..."
        />

        {/* 变量 */}
        <div>
          <label className="text-xs text-muted mb-1 block">全局变量 (&#123;&#123;变量名&#125;&#125; 格式引用)</label>
          <VariablesEditor
            variables={testCase.variables}
            onChange={vars => updateField('variables', vars)}
          />
        </div>

        {/* 标签 */}
        <div>
          <label className="text-xs text-muted mb-1 block">标签 (逗号分隔)</label>
          <input
            className="w-full bg-surface-light rounded-lg px-3 py-2 text-sm outline-none
                       border border-border/5 focus:border-accent/50 transition-colors
                       placeholder:text-muted/50"
            value={testCase.tags.join(', ')}
            onChange={e => updateField('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
            placeholder="采购, 入库, 订单"
          />
        </div>
      </section>

      {/* 测试步骤 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted uppercase tracking-wider">
            测试步骤 ({testCase.steps.length})
          </h3>
          {testCase.type === 'api' ? (
            <button onClick={onAddApiStep}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs
                         bg-accent/20 hover:bg-accent/30 text-accent-light transition-colors">
              <Plus size={12} /> 添加 API 步骤
            </button>
          ) : (
            <button onClick={onAddFlowStep}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs
                         bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 transition-colors">
              <Plus size={12} /> 添加流程步骤
            </button>
          )}
        </div>

        {testCase.steps.length === 0 ? (
          <div className="text-center py-8 text-muted text-sm border border-dashed border-border/10 rounded-xl">
            暂无测试步骤，点击上方按钮添加
          </div>
        ) : testCase.type === 'api' ? (
          (testCase.steps as ApiTestStep[]).map((step, i) => (
            <ApiStepEditor
              key={step.id}
              step={step}
              index={i}
              onChange={(field, value) => updateApiStep(i, field, value)}
              onRemove={() => removeStep(i)}
            />
          ))
        ) : (
          (testCase.steps as BusinessFlowStep[]).map((step, i) => (
            <FlowStepEditor
              key={step.id}
              step={step}
              index={i}
              onChange={(field, value) => updateFlowStep(i, field, value)}
              onRemove={() => removeStep(i)}
            />
          ))
        )}
      </section>
    </div>
  )
}

// ============================================================
// API 步骤编辑器
// ============================================================

function ApiStepEditor({ step, index, onChange, onRemove }: {
  step: ApiTestStep
  index: number
  onChange: (field: string, value: any) => void
  onRemove: () => void
}) {
  return (
    <div className="bg-surface-light rounded-xl border border-border/5 overflow-hidden">
      {/* 步骤头 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-hover/[0.02]">
        <GripVertical size={14} className="text-muted cursor-grab" />
        <span className="text-xs text-muted font-mono">#{index + 1}</span>
        <input
          className="flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted/50"
          value={step.name}
          onChange={e => onChange('name', e.target.value)}
          placeholder="步骤名称"
        />
        <div className="flex items-center gap-1">
          {/* HTTP 方法选择器 */}
          <select
            className="bg-hover/5 rounded px-2 py-1 text-xs font-mono text-accent-light outline-none
                       cursor-pointer appearance-none"
            value={step.method}
            onChange={e => onChange('method', e.target.value)}
          >
            {HTTP_METHODS.map(m => (
              <option key={m} value={m} className="bg-surface">{m}</option>
            ))}
          </select>
          <button
            onClick={onRemove}
            className="p-1 rounded hover:bg-red-500/20 text-muted hover:text-red-400 transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* 步骤内容 */}
      <div className="p-3 space-y-2">
        <div>
          <label className="text-[10px] text-muted uppercase tracking-wider">URL</label>
          <input
            className="w-full bg-surface rounded-lg px-3 py-1.5 text-sm font-mono outline-none
                       border border-border/5 focus:border-accent/50 transition-colors
                       placeholder:text-muted/50"
            value={step.url}
            onChange={e => onChange('url', e.target.value)}
            placeholder="https://api.example.com/orders"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted uppercase tracking-wider">
              期望状态码
            </label>
            <input
              type="number"
              className="w-full bg-surface rounded-lg px-3 py-1.5 text-sm font-mono outline-none
                         border border-border/5 focus:border-accent/50 transition-colors"
              value={step.expectedStatus}
              onChange={e => onChange('expectedStatus', Number(e.target.value))}
            />
          </div>
          <div>
            <label className="text-[10px] text-muted uppercase tracking-wider">
              超时 (毫秒)
            </label>
            <input
              type="number"
              className="w-full bg-surface rounded-lg px-3 py-1.5 text-sm font-mono outline-none
                         border border-border/5 focus:border-accent/50 transition-colors"
              value={step.timeout}
              onChange={e => onChange('timeout', Number(e.target.value))}
            />
          </div>
        </div>

        {/* Headers */}
        <div>
          <label className="text-[10px] text-muted uppercase tracking-wider">Headers</label>
          <KeyValueEditor
            pairs={step.headers}
            onChange={v => onChange('headers', v)}
          />
        </div>

        {/* Body */}
        {step.method !== 'GET' && (
          <div>
            <label className="text-[10px] text-muted uppercase tracking-wider">Body (JSON)</label>
            <textarea
              className="w-full bg-surface rounded-lg px-3 py-2 text-sm font-mono outline-none
                         border border-border/5 focus:border-accent/50 transition-colors
                         resize-none placeholder:text-muted/50"
              rows={4}
              value={step.body || ''}
              onChange={e => onChange('body', e.target.value)}
              placeholder='{"key": "value"}'
            />
          </div>
        )}

        {/* 期望响应 */}
        <div>
          <label className="text-[10px] text-muted uppercase tracking-wider">
            期望响应匹配 (JSON 部分匹配)
          </label>
          <textarea
            className="w-full bg-surface rounded-lg px-3 py-2 text-sm font-mono outline-none
                       border border-border/5 focus:border-accent/50 transition-colors
                       resize-none placeholder:text-muted/50"
            rows={3}
            value={step.expectedBody || ''}
            onChange={e => onChange('expectedBody', e.target.value)}
            placeholder='{"status": "ok"}'
          />
        </div>

        {/* 变量提取 */}
        <div>
          <label className="text-[10px] text-muted uppercase tracking-wider">
            变量提取 (变量名 → JSONPath，如 orderId → $.data.id)
          </label>
          <KeyValueEditor
            pairs={step.extractVars || {}}
            onChange={v => onChange('extractVars', v)}
          />
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 业务流程步骤编辑器
// ============================================================

function FlowStepEditor({ step, index, onChange, onRemove }: {
  step: BusinessFlowStep
  index: number
  onChange: (field: string, value: any) => void
  onRemove: () => void
}) {
  return (
    <div className="bg-surface-light rounded-xl border border-purple-500/10 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-purple-500/5">
        <GripVertical size={14} className="text-muted cursor-grab" />
        <span className="text-xs text-muted font-mono">#{index + 1}</span>
        <input
          className="flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted/50"
          value={step.name}
          onChange={e => onChange('name', e.target.value)}
          placeholder="业务流程步骤名称"
        />
        <button
          onClick={onRemove}
          className="p-1 rounded hover:bg-red-500/20 text-muted hover:text-red-400 transition-colors"
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div className="p-3 space-y-2">
        <div>
          <label className="text-[10px] text-muted uppercase tracking-wider">业务操作描述</label>
          <input
            className="w-full bg-surface rounded-lg px-3 py-1.5 text-sm outline-none
                       border border-border/5 focus:border-accent/50 transition-colors"
            value={step.action}
            onChange={e => onChange('action', e.target.value)}
            placeholder="如：创建采购订单，验证订单状态为待审核"
          />
        </div>

        <div>
          <label className="text-[10px] text-muted uppercase tracking-wider">依赖步骤 ID (逗号分隔)</label>
          <input
            className="w-full bg-surface rounded-lg px-3 py-1.5 text-sm outline-none
                       border border-border/5 focus:border-accent/50 transition-colors"
            value={step.dependsOn.join(', ')}
            onChange={e => onChange('dependsOn', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            placeholder="步骤 ID，逗号分隔"
          />
        </div>

        <div className="text-xs text-muted">
          包含 <span className="text-accent-light">{step.apiCalls.length}</span>  个 API 调用，
          <span className="text-purple-300"> {step.assertions.length}</span> 条断言
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 键值对编辑器
// ============================================================

function KeyValueEditor({ pairs, onChange }: {
  pairs: Record<string, string>
  onChange: (pairs: Record<string, string>) => void
}) {
  const entries = Object.entries(pairs)

  function updateEntry(index: number, key: string, value: string) {
    const newPairs = { ...pairs }
    const oldKey = entries[index]?.[0]
    if (oldKey && oldKey !== key) {
      delete newPairs[oldKey]
    }
    if (key) newPairs[key] = value
    onChange(newPairs)
  }

  function removeEntry(index: number) {
    const newPairs = { ...pairs }
    delete newPairs[entries[index]?.[0]]
    onChange(newPairs)
  }

  function addEntry() {
    onChange({ ...pairs, '': '' })
  }

  return (
    <div className="space-y-1">
      {entries.map(([key, value], i) => (
        <div key={i} className="flex gap-1">
          <input
            className="flex-1 bg-surface rounded px-2 py-1 text-xs font-mono outline-none
                       border border-border/5 focus:border-accent/50 transition-colors
                       placeholder:text-muted/50"
            value={key}
            onChange={e => updateEntry(i, e.target.value, value)}
            placeholder="Key"
          />
          <input
            className="flex-1 bg-surface rounded px-2 py-1 text-xs font-mono outline-none
                       border border-border/5 focus:border-accent/50 transition-colors
                       placeholder:text-muted/50"
            value={value}
            onChange={e => updateEntry(i, key, e.target.value)}
            placeholder="Value"
          />
          <button
            onClick={() => removeEntry(i)}
            className="p-1 rounded hover:bg-red-500/20 text-muted hover:text-red-400"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <button
        onClick={addEntry}
        className="flex items-center gap-1 text-[10px] text-muted hover:text-accent-light transition-colors"
      >
        <Plus size={10} /> 添加
      </button>
    </div>
  )
}

// ============================================================
// 变量编辑器
// ============================================================

function VariablesEditor({ variables, onChange }: {
  variables: Record<string, string>
  onChange: (vars: Record<string, string>) => void
}) {
  return (
    <KeyValueEditor pairs={variables} onChange={onChange} />
  )
}
