import React, { useState } from 'react'
import type { TestReport, StepResult } from '@shared/types'
import {
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  ChevronDown,
  Copy,
  Terminal,
  Loader2,
  Sparkles,
} from 'lucide-react'

interface Props {
  report: TestReport | null
  liveResults: StepResult[]
  isRunning: boolean
  onAnalyze?: () => void
  isAnalyzing?: boolean
  aiSuggestions?: string[]
}

export function ResultPanel({ report, liveResults, isRunning, onAnalyze, isAnalyzing, aiSuggestions }: Props) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())

  const results = liveResults.length > 0 ? liveResults : report?.stepResults || []

  function toggleStep(id: string) {
    const next = new Set(expandedSteps)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpandedSteps(next)
  }

  if (results.length === 0 && !isRunning) {
    return (
      <aside className="w-96 border-l border-border/5 bg-surface-light/30 flex items-center justify-center">
        <div className="text-center text-muted px-6">
          <Terminal size={32} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">运行测试后，结果将显示在这里</p>
        </div>
      </aside>
    )
  }

  return (
    <aside className="w-96 border-l border-border/5 bg-surface-light/30 flex flex-col shrink-0">
      {/* 头部统计 */}
      <div className="px-4 py-3 border-b border-border/5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">执行结果</h3>
          <div className="flex items-center gap-2">
            {isRunning && (
              <span className="flex items-center gap-1 text-xs text-accent-light">
                <Loader2 size={12} className="animate-spin" />
                执行中
              </span>
            )}
            {report && onAnalyze && (
              <button
                onClick={onAnalyze}
                disabled={isAnalyzing}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px]
                           bg-purple-500/15 hover:bg-purple-500/25 text-purple-300
                           disabled:opacity-50 transition-colors"
              >
                {isAnalyzing ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  <Sparkles size={10} />
                )}
                AI 分析
              </button>
            )}
          </div>
        </div>

        {report && (
          <div className="grid grid-cols-3 gap-2">
            <StatBadge
              icon={<CheckCircle2 size={12} />}
              label="通过"
              value={report.passedSteps}
              color="text-success"
            />
            <StatBadge
              icon={<XCircle size={12} />}
              label="失败"
              value={report.failedSteps}
              color="text-danger"
            />
            <StatBadge
              icon={<Clock size={12} />}
              label="耗时"
              value={`${(report.totalDuration / 1000).toFixed(1)}s`}
              color="text-muted"
            />
          </div>
        )}
      </div>

      {/* 步骤列表 */}
      <div className="flex-1 overflow-y-auto">
        {results.map((step, i) => (
          <StepResultItem
            key={step.stepId}
            step={step}
            index={i}
            expanded={expandedSteps.has(step.stepId)}
            onToggle={() => toggleStep(step.stepId)}
          />
        ))}
      </div>

      {/* AI 建议 */}
      {(aiSuggestions && aiSuggestions.length > 0) && (
        <div className="px-4 py-3 border-t border-border/5 bg-purple-500/5">
          <h4 className="flex items-center gap-1 text-xs font-medium text-purple-300 mb-2">
            <Sparkles size={12} /> AI 分析建议
          </h4>
          {aiSuggestions.map((s, i) => (
            <p key={i} className="text-xs text-muted mb-1 last:mb-0">{s}</p>
          ))}
        </div>
      )}
    </aside>
  )
}

function StatBadge({ icon, label, value, color }: {
  icon: React.ReactNode
  label: string
  value: string | number
  color: string
}) {
  return (
    <div className="bg-surface rounded-lg px-2 py-1.5 text-center">
      <div className={`flex items-center justify-center gap-1 text-xs ${color}`}>
        {icon}
        <span className="font-mono font-semibold">{value}</span>
      </div>
      <div className="text-[10px] text-muted mt-0.5">{label}</div>
    </div>
  )
}

function StepResultItem({ step, index, expanded, onToggle }: {
  step: StepResult
  index: number
  expanded: boolean
  onToggle: () => void
}) {
  const isPassed = step.status === 'passed'
  const isFailed = step.status === 'failed'
  const isSkipped = step.status === 'skipped'

  return (
    <div className={`border-b border-border/[0.02] ${isFailed ? 'bg-red-500/5' : ''}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-hover/[0.02] transition-colors"
      >
        {isPassed && <CheckCircle2 size={14} className="text-success shrink-0" />}
        {isFailed && <XCircle size={14} className="text-danger shrink-0" />}
        {isSkipped && <Clock size={14} className="text-warning shrink-0" />}
        {step.status === 'running' && <Loader2 size={14} className="text-accent-light animate-spin shrink-0" />}

        <span className="flex-1 text-xs truncate">
          <span className="text-muted font-mono mr-1">#{index + 1}</span>
          {step.stepName}
        </span>

        <span className="text-[10px] text-muted font-mono">{step.duration}ms</span>
        {expanded ? <ChevronDown size={12} className="text-muted" /> : <ChevronRight size={12} className="text-muted" />}
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2 animate-fade-in">
          {/* 请求信息 */}
          {step.request && (
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wider">请求</label>
              <div className="bg-surface rounded-lg p-2 mt-0.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono text-accent-light">{step.request.method}</span>
                  <span className="text-[10px] font-mono text-muted truncate">{step.request.url}</span>
                </div>
                <pre className="text-[11px] font-mono text-muted overflow-x-auto whitespace-pre-wrap break-all">
                  {step.request.body || '(无请求体)'}
                </pre>
              </div>
            </div>
          )}

          {/* 响应信息 */}
          {step.response && (
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wider">
                响应 (HTTP {step.response.status})
              </label>
              <div className="bg-surface rounded-lg p-2 mt-0.5 relative group">
                <pre className="text-[11px] font-mono text-muted overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
                  {step.response.body.length > 1000
                    ? step.response.body.substring(0, 1000) + '...'
                    : step.response.body}
                </pre>
                <button
                  onClick={() => navigator.clipboard.writeText(step.response!.body)}
                  className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100
                             bg-surface-light hover:bg-hover/10 transition-all"
                >
                  <Copy size={11} className="text-muted" />
                </button>
              </div>
            </div>
          )}

          {/* 断言结果 */}
          {step.assertionResults && step.assertionResults.length > 0 && (
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wider">断言</label>
              <div className="space-y-1 mt-0.5">
                {step.assertionResults.map((a, i) => (
                  <div key={i} className={`flex items-start gap-1.5 text-[11px] ${
                    a.passed ? 'text-success' : 'text-danger'
                  }`}>
                    {a.passed
                      ? <CheckCircle2 size={10} className="mt-0.5 shrink-0" />
                      : <XCircle size={10} className="mt-0.5 shrink-0" />
                    }
                    <div className="min-w-0">
                      <span>{a.description}</span>
                      {!a.passed && (
                        <div className="text-[10px] text-muted mt-0.5">
                          期望: {a.expected} | 实际: {a.actual}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 错误 */}
          {step.error && (
            <div className="bg-red-500/10 rounded-lg p-2">
              <p className="text-[11px] text-danger">{step.error}</p>
            </div>
          )}

          {/* 提取的变量 */}
          {step.extractedVars && Object.keys(step.extractedVars).length > 0 && (
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wider">提取的变量</label>
              <div className="bg-surface rounded-lg p-2 mt-0.5">
                {Object.entries(step.extractedVars).map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-[11px] font-mono">
                    <span className="text-accent-light">{k}</span>
                    <span className="text-muted">= {v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
