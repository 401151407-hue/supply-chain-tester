import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, User, Trash2, Loader2, Sparkles, Wrench, AlertTriangle, ChevronDown, Plus, MessageSquare, X, Bug, Code2, Search, Cpu } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ToolCall {
  name: string
  args: any
  result?: string
}

interface PendingConfirm {
  tools: ToolCall[]
  resolve: (approved: boolean) => void
}

interface AgentConfig {
  id: string
  name: string
  icon: React.ReactNode
  description: string
  welcome: string
  systemPrompt: string
}

// 只有修改/写入/点击/输入类操作需要确认，只读操作直接执行
// 工具中文描述映射
const TOOL_LABELS: Record<string, string> = {
  readFile: '读取文件',
  writeFile: '写入文件',
  listDir: '列出目录',
  browserOpen: '打开网页',
  browserRead: '读取页面',
  browserClick: '点击元素',
  browserType: '输入文字',
  browserScreenshot: '截图',
}

/** 生成工具操作的中文描述 */
function describeTool(tool: ToolCall): string {
  const { name, args } = tool
  switch (name) {
    case 'readFile':
      return `读取文件「${args.path || '未知路径'}」`
    case 'writeFile':
      return `向文件「${args.path || '未知路径'}」写入内容`
    case 'listDir':
      return `列出目录「${args.path || '未知路径'}」`
    case 'browserOpen':
      return `打开网页 ${args.url || '未知地址'}`
    case 'browserRead':
      return `读取当前页面内容`
    case 'browserClick':
      return args.text
        ? `点击「${args.text}」`
        : `点击「${args.selector || '未知'}」`
    case 'browserType':
      return `输入「${args.value || ''}」`
    case 'browserScreenshot':
      return `截取页面截图`
    default:
      return `执行 ${name} 操作`
  }
}

// 只有修改/写入/点击/输入类操作需要确认，只读操作直接执行
const DANGEROUS_TOOLS = ['writeFile', 'browserOpen', 'browserClick', 'browserType']

const BASE_TOOLS_DOC = `
## 可用工具
你可以使用以下工具来操作电脑文件系统。调用格式: <tool name="工具名">{"参数": "值"}</tool>

### 文件操作
1. **readFile** — 读取电脑上**任意**文件（C盘、D盘、桌面等）
   <tool name="readFile">{"path": "C:\\Users\\xxx\\Desktop\\note.txt"}</tool>

2. **writeFile** — 写入或创建文件（会自动创建目录）
   <tool name="writeFile">{"path": "D:\\data\\test.txt", "content": "hello"}</tool>

3. **listDir** — 列出**任意**目录内容（磁盘根目录、桌面、文档等）
   <tool name="listDir">{"path": "C:\\"}</tool>
   <tool name="listDir">{"path": "C:\\Users\\xxx\\Desktop"}</tool>
   返回如: 📁 文件夹名/ 、📄 文件名

### 浏览器操作
4. **browserOpen** — 打开网页: <tool name="browserOpen">{"url": "https://www.baidu.com"}</tool>
5. **browserRead** — 读取当前页面文本: <tool name="browserRead">{}</tool>
6. **browserClick** — 点击元素: <tool name="browserClick">{"text": "登录"}</tool>
7. **browserType** — 输入文字: <tool name="browserType">{"text": "用户名", "value": "admin"}</tool>
8. **browserScreenshot** — 截图: <tool name="browserScreenshot">{}</tool>

## 重要规则
- 👆 文件路径必须使用 Windows 绝对路径，如 C:\\Users\\用户名\\Desktop
- 🔒 修改/写入/点击/输入类操作会请求用户确认，只读操作（readFile/listDir/browserRead）直接执行
- 📖 读取大文件只返回前 3000 字符
- 🛠 需要操作文件时，直接调用工具，不要问用户路径
- 用中文回复，简洁专业`

const AGENTS: AgentConfig[] = [
  {
    id: 'general',
    name: '通用助手',
    icon: <Sparkles size={13} className="text-purple-400" />,
    description: '回答各类问题，分析报告和脚本',
    welcome: '你好！我是通用 AI 助手。\n• 分析测试报告和脚本\n• 读写本地文件\n• 解答供应链测试问题\n• 调试 API 报错\n\n💡 试试：「帮我看看 scripts 目录」',
    systemPrompt: `你是供应链测试工具的 AI 助手，运行在用户电脑上，可以直接访问文件系统。

## 你的能力
- 📁 读取、写入、列出电脑上**任意**目录和文件（C盘、D盘、桌面、文档等）
- 🌐 用内置浏览器打开网页、截图、点击、输入（Playwright）
- 📊 分析测试脚本、日志、报错信息
- 💻 编写和修改 Python 测试脚本
- 🔍 主动探索用户电脑文件系统，无需用户告知具体路径

## 工作方式
- **主动探索**：用户说"看看桌面有什么"→ 直接调 listDir 列出 C:\\Users\\用户名\\Desktop
- **跨盘访问**：可以访问 C、D、E 等任意盘符的文件
- **先读后写**：修改文件前先用 readFile 读取确认
- **直接执行**：只读操作立即执行，写入和点击类会请求用户确认
- **用中文回复**：简洁、直接、专业

${BASE_TOOLS_DOC}`,
  },
  {
    id: 'tester',
    name: '测试工程师',
    icon: <Bug size={13} className="text-green-400" />,
    description: '设计测试用例，生成测试步骤',
    welcome: '你好！我是测试工程师 Agent。\n• 根据接口文档设计测试用例\n• 生成 API 测试步骤（JSON 格式）\n• 分析测试失败原因\n• 建议边界值和异常场景\n\n💡 试试：「为登录接口设计完整的测试用例」',
    systemPrompt: `你是一位资深测试工程师，专注于供应链系统测试。你的专长是：
- 设计全面的测试用例（正向、异常、边界、并发）
- 生成结构化的 API 测试步骤
- 分析测试失败并给出修复建议
- 评估测试覆盖率

回复时尽量给出可执行的测试步骤。${BASE_TOOLS_DOC}`,
  },
  {
    id: 'coder',
    name: '代码专家',
    icon: <Code2 size={13} className="text-blue-400" />,
    description: '编写和优化 Python 测试脚本',
    welcome: '你好！我是代码专家 Agent。\n• 编写 Python 测试脚本\n• 审查代码质量\n• 优化脚本性能\n• 修复脚本 Bug\n\n💡 试试：「帮我写一个测试登录接口的 Python 脚本」',
    systemPrompt: `你是一位资深 Python 开发工程师。你的专长是：
- 编写健壮、可维护的 Python 测试脚本
- 使用 requests、playwright 等库进行自动化测试
- 代码审查和性能优化
- 调试复杂问题

写代码时：
- 包含完整的 import 语句
- 添加适当的错误处理
- 使用类型注解
- 代码注释用中文

${BASE_TOOLS_DOC}`,
  },
  {
    id: 'analyst',
    name: '日志分析师',
    icon: <Search size={13} className="text-orange-400" />,
    description: '分析日志和报错信息',
    welcome: '你好！我是日志分析 Agent。\n• 分析错误堆栈\n• 排查接口报错原因\n• 解析响应数据\n• 发现性能瓶颈\n\n💡 试试：「帮我分析这段报错是什么意思...」',
    systemPrompt: `你是一位资深的系统故障分析专家。你的专长是：
- 快速定位日志中的关键错误信息
- 分析 Python/HTTP 错误堆栈
- 根据错误码判断根本原因
- 给出可操作的修复方案

分析时：
- 先指出核心错误
- 再分析可能原因
- 最后给出具体修复步骤

${BASE_TOOLS_DOC}`,
  },
]

// ── 多窗口/线程管理 ──
interface Thread {
  id: string
  name: string
  agentId: string
  model: string
  messages: Message[]
  createdAt: string
}

function loadThreads(): Thread[] {
  try {
    const raw = localStorage.getItem('ai_threads')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
function saveThreads(threads: Thread[]) {
  localStorage.setItem('ai_threads', JSON.stringify(threads))
}
function loadActiveThreadId(): string {
  return localStorage.getItem('ai_active_thread_id') || ''
}
function saveActiveThreadId(id: string) {
  localStorage.setItem('ai_active_thread_id', id)
}

function createThread(agentId: string, model?: string): Thread {
  return {
    id: Date.now().toString(),
    name: '新对话',
    agentId,
    model: model || PRESET_MODELS[0],
    messages: [],
    createdAt: new Date().toISOString(),
  }
}

const MAX_TOOL_ROUNDS = 8

/** 压缩对话历史以节省 token */
function compactHistory(history: { role: string; content: string }[]): { role: string; content: string }[] {
  const sys = history.filter(m => m.role === 'system')
  const rest = history.filter(m => m.role !== 'system')
  return [...sys, ...rest.slice(-8)] // 系统提示 + 最近8条
}

const PRESET_MODELS = [
  'llm-pro', 'llm-plus', 'llm-flash',
  'deepseek-v4-pro', 'deepseek-v4-flash',
  'qwen-max', 'qwen-plus', 'qwen-turbo',
  'moonshot-v1',
  'qwen2.5:7b', 'llama3:8b', 'deepseek-r1:7b', 'codellama:7b',
]

// 模型 → API 地址映射 + 中文名
const MODEL_INFO: Record<string, { base: string; key: string; label: string }> = {
  'llm-pro':        { base: 'http://10.100.22.203:30080/llmsec/wxsllm/v1', key: 'llm-sk-y2ZW6Gvm-bQjif7EsrmsVg', label: '内部 · Pro' },
  'llm-plus':       { base: 'http://10.100.22.203:30080/llmsec/wxsllm/v1', key: 'llm-sk-y2ZW6Gvm-bQjif7EsrmsVg', label: '内部 · Plus' },
  'llm-flash':      { base: 'http://10.100.22.203:30080/llmsec/wxsllm/v1', key: 'llm-sk-y2ZW6Gvm-bQjif7EsrmsVg', label: '内部 · Flash' },
  'deepseek-v4-pro': { base: 'https://api.deepseek.com/v1', key: '', label: 'DeepSeek · V4 Pro' },
  'deepseek-v4-flash':{ base: 'https://api.deepseek.com/v1', key: '', label: 'DeepSeek · V4 Flash' },
  'qwen-max':       { base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', key: '', label: '通义千问 · Max' },
  'qwen-plus':      { base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', key: '', label: '通义千问 · Plus' },
  'qwen-turbo':     { base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', key: '', label: '通义千问 · Turbo' },
  'moonshot-v1':    { base: 'https://api.moonshot.cn/v1', key: '', label: '月之暗面 · Moonshot' },
  'qwen2.5:7b':     { base: 'http://localhost:11434/v1', key: 'ollama', label: '本地 · Qwen2.5 7B' },
  'llama3:8b':      { base: 'http://localhost:11434/v1', key: 'ollama', label: '本地 · Llama3 8B' },
  'deepseek-r1:7b': { base: 'http://localhost:11434/v1', key: 'ollama', label: '本地 · DeepSeek R1 7B' },
  'codellama:7b':   { base: 'http://localhost:11434/v1', key: 'ollama', label: '本地 · CodeLlama 7B' },
}

function loadCustomModels(): string[] {
  try {
    const s = localStorage.getItem('ai-custom-models')
    return s ? JSON.parse(s) : []
  } catch { return [] }
}

export function AIAssistant() {
  const [threads, setThreads] = useState<Thread[]>(loadThreads)
  const [activeThreadId, setActiveThreadId] = useState<string>(() => {
    const saved = loadActiveThreadId()
    const allThreads = loadThreads()
    if (saved && allThreads.some(t => t.id === saved)) return saved
    return allThreads.length > 0 ? allThreads[0].id : ''
  })
  const [showAgentMenu, setShowAgentMenu] = useState(false)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [customModels, setCustomModels] = useState<string[]>(loadCustomModels)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [toolStatus, setToolStatus] = useState<string>('')
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const api = (window as any).supplyChainTester

  // 确保至少有一个线程
  const activeThread = threads.find(t => t.id === activeThreadId)
  const messages = activeThread?.messages ?? []
  const activeAgentId = activeThread?.agentId ?? 'general'
  const currentAgent = AGENTS.find(a => a.id === activeAgentId) || AGENTS[0]

  // 初始化：如果没有线程，创建一个
  useEffect(() => {
    if (threads.length === 0) {
      const t = createThread('general')
      setThreads([t])
      setActiveThreadId(t.id)
    }
  }, [])

  // 点击空白处关闭下拉
  useEffect(() => {
    if (!showModelMenu && !showAgentMenu) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-dropdown]')) {
        setShowModelMenu(false)
        setShowAgentMenu(false)
      }
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [showModelMenu, showAgentMenu])

  function updateThreads(next: Thread[]) {
    setThreads(next)
    saveThreads(next)
  }

  function handleNewThread() {
    const t = createThread(activeAgentId, activeModel)
    updateThreads([...threads, t])
    setActiveThreadId(t.id)
  }

  // ——— 模型管理 ———
  const activeModel = activeThread?.model || PRESET_MODELS[0]
  const allModels = [...new Set([...PRESET_MODELS, ...customModels])]
  const [localModelsInstalled, setLocalModelsInstalled] = useState<Set<string>>(new Set())
  const [localServerRunning, setLocalServerRunning] = useState(false)

  // 检测本地模型状态
  useEffect(() => {
    async function check() {
      try {
        const s = await api?.ollamaStatus?.()
        setLocalServerRunning(!!s?.running)
        if (s?.running) {
          const r = await api?.ollamaListModels?.()
          if (r?.ok && r.models) {
            setLocalModelsInstalled(new Set(r.models.map((m: any) => m.name)))
          }
        }
      } catch {}
    }
    check()
  }, [])

  /** 判断模型配置状态 */
  function getModelStatus(model: string): 'ready' | 'no-key' | 'local-offline' | 'local-nomodel' {
    const info = MODEL_INFO[model]
    if (!info) return 'no-key'

    // 内部模型：有默认 key
    if (model.startsWith('llm-')) return 'ready'

    // 云模型：检查是否有保存的 key
    const isCloud = ['deepseek-', 'qwen-', 'moonshot'].some(p => model.startsWith(p))
    if (isCloud) {
      const savedKey = localStorage.getItem(`ai-key-${model}`)
      return savedKey ? 'ready' : 'no-key'
    }

    // 本地模型：检查 Ollama 是否运行 + 模型是否安装
    if (info.base === 'http://localhost:11434/v1' || info.base === 'http://localhost:1234/v1') {
      if (!localServerRunning) return 'local-offline'
      if (!localModelsInstalled.has(model)) return 'local-nomodel'
      return 'ready'
    }

    return 'no-key'
  }

  const currentModelStatus = getModelStatus(activeModel)

  function setActiveModel(model: string) {
    updateThreads(threads.map(t =>
      t.id === activeThreadId ? { ...t, model } : t
    ))
    const mapping = MODEL_INFO[model]
    if (mapping) {
      const providerKey = localStorage.getItem(`ai-key-${model}`)
      api?.getAIConfig?.().then((cfg: any) => {
        if (cfg) {
          api?.saveAIConfig?.({
            ...cfg,
            apiBase: mapping.base,
            apiKey: providerKey ?? (model.startsWith('llm-') ? cfg.apiKey : ''),
          }).catch(() => {})
        }
      }).catch(() => {})
    }
  }

  function handleDeleteThread(id: string) {
    const next = threads.filter(t => t.id !== id)
    updateThreads(next)
    if (activeThreadId === id) {
      setActiveThreadId(next.length > 0 ? next[0].id : '')
    }
  }

  function handleRename(id: string) {
    if (!renameInput.trim()) { setRenamingId(null); return }
    updateThreads(threads.map(t => t.id === id ? { ...t, name: renameInput.trim() } : t))
    setRenamingId(null)
  }

  function updateMessages(msgs: Message[], preUpdatedThreads?: Thread[]) {
    const base = preUpdatedThreads ?? threads
    updateThreads(base.map(t => t.id === activeThreadId ? { ...t, messages: msgs } : t))
  }

  function handleClear() {
    updateMessages([{ role: 'assistant', content: currentAgent.welcome }])
  }

  // 切换线程时重置状态，避免跨线程污染
  useEffect(() => {
    setInput('')
    setLoading(false)
    setToolStatus('')
  }, [activeThreadId])

  // 持久化当前活跃线程 ID
  useEffect(() => {
    if (activeThreadId) saveActiveThreadId(activeThreadId)
  }, [activeThreadId])

  // 切换线程时重置输入
  useEffect(() => {
    setInput('')
  }, [activeThreadId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, toolStatus])

  /** 解析 AI 回复中的 <tool> 标签 */
  function parseTools(text: string): { tools: ToolCall[]; rest: string } {
    const tools: ToolCall[] = []
    const regex = /<tool\s+name="(\w+)">(.*?)<\/tool>/gs
    let m
    while ((m = regex.exec(text)) !== null) {
      try {
        tools.push({ name: m[1], args: JSON.parse(m[2]) })
      } catch { /* ignore parse errors */ }
    }
    const rest = text.replace(/<tool\s+name="\w+">.*?<\/tool>/gs, '').trim()
    return { tools, rest }
  }

  /** 请求用户确认操作 */
  function requestConfirm(tools: ToolCall[]): Promise<boolean> {
    return new Promise(resolve => {
      setPendingConfirm({ tools, resolve })
    })
  }

  /** 执行工具调用 */
  async function executeTool(tool: ToolCall): Promise<string> {
    const { name, args } = tool
    try {
      switch (name) {
        case 'readFile': {
          const res = await api.readFile(args.path)
          if (!res.ok) return `读取失败: ${res.error}`
          const content = res.content || ''
          // 超过 3000 字符截断并提示
          if (content.length > 3000) {
            return content.slice(0, 3000) + `\n... (截断，共 ${content.length} 字符。如需完整内容请指定行范围)`
          }
          return content
        }
        case 'writeFile': {
          if (!args.content) return '写入失败: 缺少 content 参数'
          const res = await api.writeFile(args.path, args.content)
          return res.ok ? `✅ 已写入 ${args.path}` : `写入失败: ${res.error}`
        }
        case 'listDir': {
          const res = await api.listDir(args.path)
          if (!res.ok) return `列出失败: ${res.error}`
          const items = res.items || []
          if (items.length === 0) return `目录 ${args.path} 为空`
          const lines = items.map((i: any) => (i.isDir ? `📁 ${i.name}/` : `📄 ${i.name}`))
          return `${args.path} (${items.length} 项):\n${lines.join('\n')}`
        }
        case 'browserOpen': {
          if (!args.url) return '浏览器打开失败: 缺少 url 参数'
          const res = await api.browserOpen(args.url)
          if (!res.ok) return `浏览器打开失败: ${(res as any).error}`
          return `✅ 已打开 ${res.url}\n页面标题: ${res.title}`
        }
        case 'browserRead': {
          const res = await api.browserRead()
          if (!res.ok) return `读取页面失败: ${(res as any).error}`
          const info = `📍 ${res.url}\n📌 ${res.title}\n\n`
          const text = res.text || '(页面无文本内容)'
          return info + text
        }
        case 'browserClick': {
          const res = await api.browserClick(args)
          return res.ok ? `✅ ${res.message}` : `点击失败: ${(res as any).message || res.message}`
        }
        case 'browserType': {
          if (!args.value) return '输入失败: 缺少 value 参数'
          const res = await api.browserType(args)
          return res.ok ? `✅ ${res.message}` : `输入失败: ${(res as any).message || res.message}`
        }
        case 'browserScreenshot': {
          const res = await api.browserScreenshot()
          if (!res.ok) return `截图失败: ${(res as any).error}`
          return `[截图](${res.dataUrl})`
        }
        default:
          return `未知工具: ${name}`
      }
    } catch (err: any) {
      return `工具执行出错: ${err.message || String(err)}`
    }
  }

  /** 执行工具循环，最终回复流式输出 */
  async function runWithTools(
    history: { role: string; content: string }[],
    setStatus: (msg: string) => void,
    model: string,
    onStream: (text: string) => void,
  ): Promise<string> {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const reply = await api.aiChat(compactHistory(history), model)
      if (!reply || reply.trim() === '') {
        return 'AI 返回内容为空，请检查模型配置和 API Key 是否正确。'
      }
      const { tools, rest } = parseTools(reply)

      if (tools.length === 0) {
        // 最终回复：先非流式获取，稳定后再流式优化
        return reply
      }

      const dangerousTools = tools.filter(t => DANGEROUS_TOOLS.includes(t.name))
      if (dangerousTools.length > 0) {
        const approved = await requestConfirm(dangerousTools)
        if (!approved) return '⛔ 用户取消了文件操作。'
      }

      setStatus(`执行工具 (${round + 1}/${MAX_TOOL_ROUNDS})...`)
      const toolResults: string[] = []
      for (const tool of tools) {
        setStatus(`正在${TOOL_LABELS[tool.name] || tool.name}...`)
        let result = await executeTool(tool)
        if (result.length > 600) result = result.slice(0, 600) + '\n...(截断)'
        toolResults.push(`[${tool.name}]: ${result}`)
      }

      // 只追加工具结果摘要，不追加完整 AI 回复（节省 token）
      history.push({ role: 'user', content: `工具结果:\n${toolResults.join('\n')}\n\n继续。` })
    }
    return '已达到最大工具调用轮次，请简化问题重试。'
  }

  /** 构建项目上下文供 AI 了解供应链系统 */
  async function buildProjectContext(): Promise<string> {
    try {
      const data = await api?.scanScripts?.()
      if (!data) return ''
      
      const parts: string[] = []
      
      // 产品线及脚本
      const productNames: Record<string, string> = {
        xinerong: '信e融', dingerong: '订e融', huoerong: '货e融',
        zhangerong: '账e融', piaoerong: '票e融',
      }
      
      for (const [key, label] of Object.entries(productNames)) {
        const productScripts = data[key] as any[] | undefined
        if (!productScripts || productScripts.length === 0) continue
        parts.push(`\n### ${label}（${key}）`)
        for (const sub of productScripts) {
          const subName = sub.subProduct || '默认'
          const count = sub.scripts?.length || 0
          if (count > 0) {
            const names = sub.scripts.slice(0, 5).map((s: any) => s.name).join('、')
            parts.push(`- ${subName}（${count}个脚本）: ${names}${count > 5 ? '等' : ''}`)
          }
        }
      }
      
      // 通用脚本
      const common = data.common as any[] | undefined
      if (common && common.length > 0) {
        parts.push('\n### 通用工具脚本')
        for (const g of common) {
          const names = g.scripts?.slice(0, 5).map((s: any) => s.name).join('、') || ''
          if (names) parts.push(`- ${names}${g.scripts.length > 5 ? '等' : ''}`)
        }
      }
      
      // 工具模块
      const utils = data.utils as any[] | undefined
      if (utils && utils.length > 0) {
        parts.push('\n### 工具模块')
        for (const u of utils) {
          const names = u.scripts?.slice(0, 3).map((s: any) => s.name).join('、') || ''
          if (names) parts.push(`- ${names}`)
        }
      }
      
      if (parts.length === 0) return ''
      return '这是一个供应链测试系统，包含以下产品和脚本：' + parts.join('')
    } catch {
      return ''
    }
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { role: 'user', content: text }

    // 首次发言时自动命名线程（取前20字作为对话概述）
    let updatedThreads = threads
    if (messages.length === 0 && activeThread?.name === '新对话') {
      const autoName = text.length > 20 ? text.slice(0, 20) + '…' : text
      updatedThreads = threads.map(t =>
        t.id === activeThreadId ? { ...t, name: autoName } : t
      )
    }
    const newMessages = [...messages, userMsg]
    updateMessages(newMessages, updatedThreads)
    setInput('')
    setLoading(true)
    setToolStatus('')

    try {
      if (!api?.aiChat) {
        updateMessages([...newMessages, { role: 'assistant', content: 'AI 服务不可用，请检查配置。' }])
        setLoading(false)
        return
      }

      // 构建完整对话历史（系统提示 + 项目上下文 + 工作区路径）
      const wsInfo = (window as any).supplyChainTester?.getScriptsPath?.()
      const wsPath = typeof wsInfo === 'string' && wsInfo ? `\n工作区路径: ${wsInfo.replace(/\\/g, '\\\\')}` : ''
      
      // 首次对话时注入项目上下文
      let projectContext = ''
      if (messages.length === 0) {
        const ctx = await buildProjectContext()
        if (ctx) projectContext = `\n## 当前项目供应链系统概况\n${ctx}`
      }
      
      const modelLabel = MODEL_INFO[activeModel]?.label || activeModel
      const modelIdentity = `\n## 你的身份\n你是「${modelLabel}」模型，运行在用户本地电脑上，由 Ollama 驱动。如果有人问"你用的是什么模型"，直接告诉对方你是 ${modelLabel}。`
      const systemMsg = { role: 'system', content: currentAgent.systemPrompt + modelIdentity + projectContext + wsPath }
      const recentHistory = newMessages.slice(-10).map(m => ({
        role: m.role as string,
        content: m.content,
      }))
      const history = [systemMsg, ...recentHistory, { role: 'user', content: text }]

      // 包装 toolStatus setter
      const setStatus = (msg: string) => {
        setToolStatus(msg)
      }
      setToolStatus('正在分析…')

      const finalReply = await runWithTools(history, setStatus, activeModel, (streaming) => {
        updateMessages([...newMessages, { role: 'assistant', content: streaming + '▌' }])
      })

      updateMessages([...newMessages, { role: 'assistant', content: finalReply }])
    } catch (err: any) {
      console.error('[AIAssistant] 出错:', err)
      updateMessages([...newMessages, { role: 'assistant', content: `出错了: ${err.message || String(err)}` }])
    } finally {
      setLoading(false)
      setToolStatus('')
      inputRef.current?.focus()
    }
  }

  const inputRef = useRef<HTMLInputElement>(null)
  // 当前线程名
  const threadName = threads.find(t => t.id === activeThreadId)?.name || '新对话'

  return (
    <div className="flex h-full">
      {/* 左侧：对话历史 */}
      <aside className="w-44 border-r border-border/5 bg-surface-light/10 flex flex-col shrink-0">
        <div className="px-2.5 py-2 border-b border-border/5 flex items-center justify-between">
          <span className="text-[10px] text-muted font-medium">对话历史</span>
          <button onClick={handleNewThread} className="p-0.5 rounded hover:bg-hover/10 text-muted hover:text-foreground transition-colors" title="新建对话">
            <Plus size={13} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threads.map(t => (
            <div key={t.id}
              onClick={() => setActiveThreadId(t.id)}
              className={`group flex items-center gap-2 px-2.5 py-2 cursor-pointer transition-colors text-left w-full
                ${activeThreadId === t.id ? 'bg-accent/10 border-l-2 border-l-accent' : 'hover:bg-hover/5 border-l-2 border-l-transparent'}`}
            >
              <MessageSquare size={11} className={activeThreadId === t.id ? 'text-accent-light shrink-0' : 'text-muted shrink-0'} />
              <span className="text-[11px] truncate flex-1">{t.name}</span>
              {threads.length > 1 && (
                <button onClick={e => { e.stopPropagation(); handleDeleteThread(t.id) }}
                  className="p-0.5 rounded hover:bg-red-500/20 text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 shrink-0">
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* 右侧：聊天区 */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* 头部 — 模型选择 */}
        <header className="h-10 flex items-center gap-2 px-3 border-b border-border/5 bg-surface-light/30 shrink-0">
          <Sparkles size={14} className="text-purple-400 shrink-0" />

        {/* 模型选择器 */}
        <div className="relative">
          <button
            onClick={() => { setShowModelMenu(!showModelMenu); setShowAgentMenu(false) }}
            className={`flex items-center gap-1 px-1.5 py-1 rounded hover:bg-hover/10 transition-colors text-xs font-mono ${
              currentModelStatus !== 'ready' ? 'text-orange-400' : 'text-accent-light'
            }`}
            title={currentModelStatus === 'no-key' ? '未配置 API Key' : currentModelStatus === 'local-offline' ? '本地服务未启动' : currentModelStatus === 'local-nomodel' ? '模型未下载' : '切换模型'}
          >
            <Cpu size={11} />
            <span className="max-w-[80px] truncate">{MODEL_INFO[activeModel]?.label || activeModel}</span>
            {currentModelStatus !== 'ready' && <span className="text-[10px] text-orange-400 ml-0.5">⚠</span>}
            <ChevronDown size={10} />
          </button>
          {showModelMenu && (
            <div data-dropdown className="absolute top-full left-0 mt-1 w-64 bg-surface-light border border-border/10 rounded-xl shadow-xl z-50 py-1 animate-fade-in max-h-[360px] overflow-y-auto"
                 onClick={e => e.stopPropagation()}>
              {/* 未配置模型顶部提示 */}
              {currentModelStatus !== 'ready' && (
                <div className="px-3 py-2 mx-2 mb-1 rounded-lg bg-orange-500/10 border border-orange-500/20 text-[11px] text-orange-400">
                  {currentModelStatus === 'no-key' && '当前模型未配置 API Key，请在「模型配置」中设置'}
                  {currentModelStatus === 'local-offline' && '本地 Ollama 服务未启动，请先启动 Ollama'}
                  {currentModelStatus === 'local-nomodel' && '模型未下载，请在「模型配置 → 本地模型」中下载'}
                </div>
              )}
              {allModels.map(m => {
                const info = MODEL_INFO[m]
                const status = getModelStatus(m)
                return (
                <button key={m}
                  onClick={() => { setActiveModel(m); setShowModelMenu(false) }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-hover/5 transition-colors flex items-center gap-2
                    ${activeModel === m ? 'text-accent-light bg-accent/5' : 'text-muted'}`}>
                  <span className="font-mono truncate flex-1">{m}</span>
                  {info?.label && <span className="text-[10px] text-muted/60">{info.label}</span>}
                  {status !== 'ready' && (
                    <span className="text-[10px] text-orange-400 shrink-0" title={
                      status === 'no-key' ? '未配置 Key' : status === 'local-offline' ? '服务未启动' : '未下载'
                    }>⚠</span>
                  )}
                </button>
                )
              })}

            </div>
          )}
        </div>

        <button onClick={handleNewThread} className="p-1 rounded hover:bg-hover/10 text-muted hover:text-foreground transition-colors" title="新建对话">
          <Plus size={14} />
        </button>
        <button onClick={handleClear} className="p-1 rounded hover:bg-hover/10 text-muted hover:text-foreground transition-colors" title="清空对话">
          <Trash2 size={14} />
        </button>
      </header>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-purple-500/15 flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={12} className="text-purple-400" />
              </div>
            )}
            <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words
              ${msg.role === 'user'
                ? 'bg-accent/15 text-foreground'
                : 'bg-hover/5 text-foreground'}`}>
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="w-6 h-6 rounded-full bg-accent/15 flex items-center justify-center shrink-0 mt-0.5">
                <User size={12} className="text-accent-light" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 px-1">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400/60 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400/60 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400/60 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs text-muted/60 italic">{toolStatus || '思考中...'}</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 输入区 */}
      <div className="px-4 py-3 border-t border-border/5 bg-surface-light/20 shrink-0">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="输入问题，Enter 发送..."
            disabled={loading}
            className="flex-1 rounded-lg px-3 py-2 text-sm outline-none bg-surface border border-border/5 focus:border-accent/50 disabled:opacity-50 placeholder:text-muted/40 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent/90 text-foreground disabled:opacity-40 transition-all"
          >
            <Send size={15} />
          </button>
        </div>
      </div>

      {/* 确认弹窗 */}
      {pendingConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface-light border border-border/10 rounded-2xl w-[460px] shadow-2xl animate-fade-in">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-border/5">
              <AlertTriangle size={16} className="text-warning" />
              <h3 className="text-sm font-semibold">确认操作</h3>
            </div>
            <div className="px-5 py-3 space-y-2 max-h-[250px] overflow-y-auto">
              {pendingConfirm.tools.map((tool, i) => (
                <div key={i} className="bg-surface rounded-lg p-2.5 border border-border/5">
                  <span className="text-[10px] font-bold text-warning bg-warning/10 px-1.5 py-0.5 rounded">{TOOL_LABELS[tool.name] || tool.name}</span>
                  <p className="text-xs text-foreground mt-1">{describeTool(tool)}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2 px-5 py-3 border-t border-border/5">
              <button onClick={() => { pendingConfirm.resolve(false); setPendingConfirm(null) }}
                className="flex-1 py-2 rounded-lg text-xs bg-hover/5 hover:bg-hover/10 transition-colors">取消</button>
              <button onClick={() => { pendingConfirm.resolve(true); setPendingConfirm(null) }}
                className="flex-1 py-2 rounded-lg text-xs font-semibold bg-accent hover:bg-accent/90 transition-colors">确认执行</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  )
}
