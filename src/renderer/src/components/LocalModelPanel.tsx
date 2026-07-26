/**
 * 本地模型管理面板
 * 
 * 功能：
 * 1. 检测 Ollama 是否安装并运行
 * 2. 显示已安装的本地模型
 * 3. 一键下载 DeepSeek 免费模型（带进度条）
 * 4. 删除已安装模型
 * 5. 设置 Ollama 连接地址
 */
import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  Zap, Download, Trash2, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Cpu, HardDrive, Clock, ExternalLink, RefreshCw, Pause, Play, ChevronDown, Info,
} from 'lucide-react'

// ── 类型 ──
interface OllamaStatus { installed: boolean; running: boolean; version?: string; error?: string }
interface OllamaModel { name: string; size: number; modified_at: string; digest: string; details?: any }
interface PullProgress { modelName: string; status: string; completed?: number; total?: number; percent?: number }

// ── 预配置的免费模型 ──
const PRESET_MODELS = [
  // DeepSeek 系列（免费开源）
  {
    group: 'DeepSeek 系列',
    models: [
      { name: 'deepseek-r1:1.5b',  label: 'DeepSeek R1 · 1.5B',  size: '~1.1 GB', desc: '最小模型，CPU 可跑，适合简单问答', tier: '入门', icon: '🟢' },
      { name: 'deepseek-r1:7b',    label: 'DeepSeek R1 · 7B',    size: '~4.7 GB', desc: '推荐入门，消费级显卡，日常够用', tier: '⭐推荐', icon: '⭐' },
      { name: 'deepseek-r1:8b',    label: 'DeepSeek R1 · 8B',    size: '~4.9 GB', desc: '7B 升级版，推理效果更好', tier: '进阶', icon: '🔵' },
      { name: 'deepseek-r1:14b',   label: 'DeepSeek R1 · 14B',   size: '~9.0 GB', desc: '主力推荐，8GB 显存可跑', tier: '⭐推荐', icon: '⭐' },
      { name: 'deepseek-r1:32b',   label: 'DeepSeek R1 · 32B',   size: '~20 GB',  desc: '需要 RTX 4090 / 多卡', tier: '高端', icon: '🟣' },
      { name: 'deepseek-r1:70b',   label: 'DeepSeek R1 · 70B',   size: '~43 GB',  desc: '多卡并行，接近 API 效果', tier: '旗舰', icon: '👑' },
    ],
  },
  // 其他免费模型
  {
    group: '其他开源模型',
    models: [
      { name: 'qwen2.5:7b',       label: '通义千问 2.5 · 7B',  size: '~4.7 GB', desc: '阿里开源，中文能力最强', tier: '推荐', icon: '🇨🇳' },
      { name: 'qwen2.5:14b',      label: '通义千问 2.5 · 14B', size: '~9.0 GB', desc: '中文推理优秀', tier: '进阶', icon: '🇨🇳' },
      { name: 'llama3:8b',        label: 'Llama 3 · 8B',       size: '~4.7 GB', desc: 'Meta 开源，通用能力强', tier: '推荐', icon: '🦙' },
      { name: 'codellama:7b',     label: 'Code Llama · 7B',    size: '~3.8 GB', desc: 'Meta 代码专用，写脚本首选', tier: '推荐', icon: '💻' },
    ],
  },
]

// ── 工具函数 ──
function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

// ── 组件 ──
export function LocalModelPanel() {
  const api = () => (window as any).supplyChainTester

  const [status, setStatus] = useState<OllamaStatus | null>(null)
  const [installedModels, setInstalledModels] = useState<OllamaModel[]>([])
  const [checking, setChecking] = useState(false)
  const [pullingModel, setPullingModel] = useState<string | null>(null)
  const [pullProgress, setPullProgress] = useState<Record<string, PullProgress>>({})
  const [pullLog, setPullLog] = useState<string[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['DeepSeek 系列']))
  const [viewMode, setViewMode] = useState<'all' | 'installed' | 'available'>('all')
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434')
  const [showUrlEdit, setShowUrlEdit] = useState(false)

  // 初始检测
  useEffect(() => {
    checkOllama()
  }, [])

  // 监听拉取进度
  useEffect(() => {
    const unsub = api()?.onOllamaPullProgress?.((progress: PullProgress) => {
      setPullProgress(prev => ({ ...prev, [progress.modelName]: progress }))
      if (progress.status) {
        setPullLog(prev => [...prev.slice(-20), progress.status])
      }
      // 拉取完成
      if (progress.status === 'success') {
        setPullingModel(null)
        refreshModels()
      }
    })
    return () => unsub?.()
  }, [])

  async function checkOllama() {
    setChecking(true)
    try {
      const s = await api()?.ollamaStatus?.()
      setStatus(s || { installed: false, running: false, error: '无法获取状态' })
      if (s?.running) {
        await refreshModels()
      }
    } catch (err: any) {
      setStatus({ installed: false, running: false, error: err.message || String(err) })
    } finally {
      setChecking(false)
    }
  }

  async function refreshModels() {
    try {
      const result = await api()?.ollamaListModels?.()
      if (result?.ok && result.models) {
        setInstalledModels(result.models)
      }
    } catch {}
  }

  const installedNames = new Set(installedModels.map(m => m.name))

  async function handlePull(modelName: string) {
    if (pullingModel) return
    setPullingModel(modelName)
    setPullLog([])
    setPullProgress(prev => ({ ...prev, [modelName]: { modelName, status: '准备下载…' } }))
    try {
      await api()?.ollamaPullModel?.(modelName)
    } catch (err: any) {
      setPullProgress(prev => ({
        ...prev,
        [modelName]: { modelName, status: `下载失败: ${err.message || String(err)}` },
      }))
      setPullingModel(null)
    }
  }

  async function handleCancel() {
    await api()?.ollamaCancelPull?.()
    setPullingModel(null)
  }

  async function handleDelete(modelName: string) {
    if (!confirm(`确认删除模型「${modelName}」？删除后需要重新下载。`)) return
    try {
      await api()?.ollamaDeleteModel?.(modelName)
      await refreshModels()
    } catch (err: any) {
      alert(`删除失败: ${err.message || String(err)}`)
    }
  }

  async function handleSaveUrl() {
    await api()?.ollamaSetBaseUrl?.(baseUrl)
    setShowUrlEdit(false)
    checkOllama()
  }

  function renderStatus() {
    if (!status) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 size={14} className="animate-spin" />
          正在检测 Ollama…
        </div>
      )
    }
    if (status.running) {
      return (
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 size={14} className="text-green-400" />
          <span className="text-green-400 font-medium">Ollama 运行中</span>
          {status.version && <span className="text-muted">v{status.version}</span>}
          <span className="text-muted">|</span>
          <span className="text-muted">{installedModels.length} 个模型已安装</span>
        </div>
      )
    }
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-sm">
          <XCircle size={14} className="text-red-400" />
          <span className="text-red-400 font-medium">Ollama 未连接</span>
        </div>
        {status.error && <p className="text-xs text-muted ml-6">{status.error}</p>}
        <div className="flex items-center gap-2 mt-1 ml-6">
          <a
            href="https://ollama.com/download/windows"
            target="_blank"
            className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
            onClick={(e) => { e.preventDefault(); api()?.openExternal?.('https://ollama.com/download/windows') }}
          >
            <ExternalLink size={12} /> 下载 Ollama
          </a>
          <span className="text-muted">·</span>
          <button
            onClick={checkOllama}
            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            <RefreshCw size={12} /> 重新检测
          </button>
        </div>
      </div>
    )
  }

  function toggleGroup(group: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  return (
    <div className="space-y-4">
      {/* 头部：状态 */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-purple-500/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <Cpu size={18} className="text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">本地大模型</h3>
            <p className="text-xs text-muted">免费 · 离线 · 无限制 · 数据不外传</p>
          </div>
        </div>
        {renderStatus()}
      </div>

      {/* Ollama 地址设置 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">连接地址:</span>
        {showUrlEdit ? (
          <div className="flex items-center gap-1">
            <input
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              className="px-2 py-1 text-xs rounded bg-black/30 border border-border/10 w-56 focus:outline-none focus:border-purple-500/30"
              onKeyDown={e => e.key === 'Enter' && handleSaveUrl()}
            />
            <button onClick={handleSaveUrl} className="px-2 py-1 text-xs text-purple-400 hover:bg-purple-500/10 rounded transition-colors">保存</button>
            <button onClick={() => setShowUrlEdit(false)} className="px-1 py-1 text-xs text-muted hover:text-foreground">取消</button>
          </div>
        ) : (
          <button onClick={() => setShowUrlEdit(true)} className="text-xs text-muted hover:text-purple-400 transition-colors">
            {baseUrl} ✎
          </button>
        )}
      </div>

      {/* 视图切换 */}
      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-black/20 border border-border/5">
        {(['all', 'installed', 'available'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${
              viewMode === mode
                ? 'bg-purple-500/20 text-purple-400 font-medium'
                : 'text-muted hover:text-foreground'
            }`}
          >
            {mode === 'all' ? '全部模型' : mode === 'installed' ? `已安装 (${installedModels.length})` : '可下载'}
          </button>
        ))}
      </div>

      {/* 模型列表 */}
      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {PRESET_MODELS.map(group => {
          const filteredModels = viewMode === 'installed'
            ? group.models.filter(m => installedNames.has(m.name))
            : viewMode === 'available'
              ? group.models.filter(m => !installedNames.has(m.name))
              : group.models

          if (filteredModels.length === 0) return null

          const isExpanded = expandedGroups.has(group.group)
          const installedInGroup = group.models.filter(m => installedNames.has(m.name)).length

          return (
            <div key={group.group}>
              <button
                onClick={() => toggleGroup(group.group)}
                className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-muted hover:text-foreground transition-colors"
              >
                <ChevronDown
                  size={12}
                  className={`transition-transform ${isExpanded ? '' : '-rotate-90'}`}
                />
                <span className="font-medium">{group.group}</span>
                {installedInGroup > 0 && (
                  <span className="text-green-400">({installedInGroup}/{group.models.length} 已安装)</span>
                )}
              </button>

              {isExpanded && (
                <div className="space-y-1.5 mt-1">
                  {filteredModels.map(model => {
                    const installed = installedNames.has(model.name)
                    const pulling = pullingModel === model.name
                    const progress = pullProgress[model.name]

                    return (
                      <div
                        key={model.name}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                          installed
                            ? 'bg-green-500/5 border-green-500/10'
                            : pulling
                              ? 'bg-purple-500/5 border-purple-500/20'
                              : 'bg-black/10 border-border/5 hover:border-purple-500/20'
                        }`}
                      >
                        {/* 左侧：模型信息 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{model.icon}</span>
                            <span className="text-sm font-medium truncate">{model.label}</span>
                            {model.tier && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                model.tier.includes('推荐') ? 'bg-yellow-500/10 text-yellow-400' : 'bg-gray-500/10 text-gray-400'
                              }`}>
                                {model.tier}
                              </span>
                            )}
                            {installed && <CheckCircle2 size={12} className="text-green-400 shrink-0" />}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-[11px] text-muted flex items-center gap-1">
                              <HardDrive size={10} /> {model.size}
                            </span>
                            <span className="text-[11px] text-muted">{model.desc}</span>
                          </div>
                          {/* 进度条 */}
                          {pulling && progress && (
                            <div className="mt-2">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] text-purple-400 truncate max-w-[200px]">
                                  {progress.status}
                                </span>
                                {progress.percent !== undefined && (
                                  <span className="text-[10px] text-purple-400">{progress.percent}%</span>
                                )}
                              </div>
                              <div className="h-1.5 rounded-full bg-black/30 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300"
                                  style={{ width: `${progress.percent ?? 0}%` }}
                                />
                              </div>
                              {progress.completed && progress.total && (
                                <div className="text-[10px] text-muted mt-0.5">
                                  {fmtSize(progress.completed)} / {fmtSize(progress.total)}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* 右侧：操作按钮 */}
                        <div className="flex items-center gap-1 shrink-0">
                          {installed ? (
                            <button
                              onClick={() => handleDelete(model.name)}
                              className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              title="删除模型"
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : pulling ? (
                            <button
                              onClick={handleCancel}
                              className="p-1.5 rounded-lg text-orange-400 hover:bg-orange-500/10 transition-colors"
                              title="取消下载"
                            >
                              <Pause size={14} />
                            </button>
                          ) : (
                            <button
                              onClick={() => handlePull(model.name)}
                              disabled={!!pullingModel}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-30"
                            >
                              <Download size={12} />
                              下载
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 底部提示 */}
      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/10 text-[11px] text-blue-400/70">
        <Info size={13} className="shrink-0" />
        <span>
          下载完成后，在 AI 助手模型选择器中选择「本地 · DeepSeek R1」即可使用。
          所有数据在本地运行，不会上传到云端。
        </span>
      </div>
    </div>
  )
}
