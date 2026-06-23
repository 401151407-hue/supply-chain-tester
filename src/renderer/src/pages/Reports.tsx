import React, { useState } from 'react'
import { useAppStore } from '../store'
import type { TestReport } from '@shared/types'
import {
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
  ChevronRight,
  Search,
  Trash2,
  TrendingUp,
  TrendingDown,
  Activity,
} from 'lucide-react'

export function Reports() {
  const { reports, setReports } = useAppStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedReport, setSelectedReport] = useState<TestReport | null>(null)

  const filtered = reports.filter(r =>
    r.testCaseName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const stats = {
    total: reports.length,
    passed: reports.filter(r => r.status === 'passed').length,
    failed: reports.filter(r => r.status === 'failed').length,
    avgDuration: reports.length > 0
      ? Math.round(reports.reduce((s, r) => s + r.totalDuration, 0) / reports.length / 1000)
      : 0,
  }

  if (selectedReport) {
    return <ReportDetail report={selectedReport} onBack={() => setSelectedReport(null)} />
  }

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 flex items-center gap-3 px-4 border-b border-border/5 bg-surface-light/50 shrink-0 drag-region">
        <BarChart3 size={18} className="text-accent" />
        <h2 className="text-lg font-semibold">测试报告</h2>
        <span className="text-xs text-muted">({reports.length} 条记录)</span>
      </header>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-3 px-4 py-3 border-b border-border/5">
        <StatCard
          icon={<Activity size={16} />}
          label="总计"
          value={stats.total}
          color="text-accent-light"
        />
        <StatCard
          icon={<CheckCircle2 size={16} />}
          label="通过"
          value={stats.passed}
          color="text-success"
        />
        <StatCard
          icon={<XCircle size={16} />}
          label="失败"
          value={stats.failed}
          color="text-danger"
        />
        <StatCard
          icon={<Clock size={16} />}
          label="平均耗时"
          value={`${stats.avgDuration}s`}
          color="text-muted"
        />
      </div>

      {/* 搜索 */}
      <div className="px-4 py-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="w-full bg-surface-light rounded-lg pl-9 pr-3 py-2 text-sm outline-none
                       border border-border/5 focus:border-accent/50 transition-colors
                       placeholder:text-muted/50"
            placeholder="搜索报告..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* 报告列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {filtered.length === 0 ? (
          <div className="text-center text-muted py-12">
            <BarChart3 size={40} className="mx-auto mb-3 opacity-20" />
            <p>暂无测试报告</p>
            <p className="text-xs mt-1">运行测试用例后，报告将显示在这里</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map(report => (
              <ReportRow
                key={report.id}
                report={report}
                onClick={() => setSelectedReport(report)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode
  label: string
  value: string | number
  color: string
}) {
  return (
    <div className="bg-surface-light rounded-xl p-3 border border-border/5">
      <div className={`${color} mb-1`}>{icon}</div>
      <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  )
}

function ReportRow({ report, onClick }: { report: TestReport; onClick: () => void }) {
  const passRate = report.totalSteps > 0
    ? Math.round((report.passedSteps / report.totalSteps) * 100)
    : 0

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                 hover:bg-hover/5 transition-colors text-left group"
    >
      {report.status === 'passed' ? (
        <CheckCircle2 size={18} className="text-success shrink-0" />
      ) : (
        <XCircle size={18} className="text-danger shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{report.testCaseName}</span>
          <span className={`
            text-[10px] px-1.5 py-0.5 rounded
            ${report.testType === 'api' ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'}
          `}>
            {report.testType === 'api' ? 'API' : '流程'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted mt-0.5">
          <span>{new Date(report.startedAt).toLocaleString('zh-CN')}</span>
          <span>{(report.totalDuration / 1000).toFixed(1)}s</span>
          <span className={passRate >= 80 ? 'text-success' : 'text-danger'}>
            {passRate}% 通过
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 text-xs">
        <span className="text-success">{report.passedSteps}</span>
        <span className="text-muted">/</span>
        <span className="text-danger">{report.failedSteps}</span>
        <span className="text-muted">/</span>
        <span className="text-muted">{report.totalSteps}</span>
      </div>

      <ChevronRight size={14} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  )
}

// ============================================================
// 报告详情
// ============================================================

function ReportDetail({ report, onBack }: { report: TestReport; onBack: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <header className="h-12 flex items-center gap-3 px-4 border-b border-border/5 bg-surface-light/50 shrink-0 drag-region">
        <button
          onClick={onBack}
          className="no-drag text-muted hover:text-foreground transition-colors text-sm"
        >
          ← 返回
        </button>
        <h2 className="text-lg font-semibold">{report.testCaseName}</h2>
        {report.status === 'passed' ? (
          <span className="text-xs px-2 py-0.5 rounded bg-success/20 text-success">通过</span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded bg-danger/20 text-danger">失败</span>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 概览 */}
        <div className="grid grid-cols-4 gap-3">
          <DetailCard label="总步骤" value={report.totalSteps} />
          <DetailCard label="通过" value={report.passedSteps} color="text-success" />
          <DetailCard label="失败" value={report.failedSteps} color="text-danger" />
          <DetailCard label="总耗时" value={`${(report.totalDuration / 1000).toFixed(1)}s`} />
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs text-muted">
          <div>
            <span className="text-muted">开始: </span>
            {new Date(report.startedAt).toLocaleString('zh-CN')}
          </div>
          <div>
            <span className="text-muted">结束: </span>
            {report.finishedAt ? new Date(report.finishedAt).toLocaleString('zh-CN') : '-'}
          </div>
        </div>

        {/* 步骤详情 */}
        <div>
          <h3 className="text-sm font-medium mb-2">执行步骤</h3>
          <div className="space-y-1">
            {report.stepResults.map((step, i) => (
              <div
                key={step.stepId}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm
                  ${step.status === 'passed' ? 'bg-success/5' :
                    step.status === 'failed' ? 'bg-danger/5' : 'bg-surface-light'}
                `}
              >
                <span className="text-xs text-muted font-mono">#{i + 1}</span>
                {step.status === 'passed' && <CheckCircle2 size={14} className="text-success" />}
                {step.status === 'failed' && <XCircle size={14} className="text-danger" />}
                {step.status === 'skipped' && <Clock size={14} className="text-warning" />}
                <span className="flex-1">{step.stepName}</span>
                <span className="text-xs text-muted font-mono">{step.duration}ms</span>
              </div>
            ))}
          </div>
        </div>

        {/* 断言汇总 */}
        <div>
          <h3 className="text-sm font-medium mb-2">断言汇总</h3>
          <div className="space-y-1">
            {report.stepResults.flatMap(s =>
              (s.assertionResults || []).map((a, i) => (
                <div
                  key={`${s.stepId}-${i}`}
                  className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs
                    ${a.passed ? 'bg-success/5' : 'bg-danger/5'}
                  `}
                >
                  {a.passed
                    ? <CheckCircle2 size={12} className="text-success mt-0.5" />
                    : <XCircle size={12} className="text-danger mt-0.5" />
                  }
                  <div>
                    <div>{a.description}</div>
                    {!a.passed && (
                      <div className="text-muted mt-0.5">
                        期望: {a.expected} → 实际: {a.actual}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailCard({ label, value, color = 'text-foreground' }: {
  label: string
  value: string | number
  color?: string
}) {
  return (
    <div className="bg-surface-light rounded-xl p-3 border border-border/5 text-center">
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  )
}
