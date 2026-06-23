import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, User, Trash2, Loader2, Sparkles, FolderOpen, FileText, Wrench, AlertTriangle, CheckCircle2, XCircle, Code2, Bug, Search, ChevronDown, Plus, MessageSquare, Edit3, Pin } from 'lucide-react'

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
  writeFile: '写入文件',
  browserOpen: '打开网页',
  browserClick: '点击页面元素',
  browserType: '输入文字',
}

/** 生成工具操作的中文描述 */
function describeTool(tool: ToolCall): string {
  const { name, args } = tool
  switch (name) {
    case 'writeFile':
      return `向文件「${args.path || '未知路径'}」写入内容`
    case 'browserOpen':
      return `在浏览器中打开网页 ${args.url || '未知地址'}`
    case 'browserClick':
      return args.text
        ? `点击页面中文字为「${args.text}」的${args.nth !== undefined ? `第 ${args.nth + 1} 个` : ''}元素`
        : `点击选择器「${args.selector || '未知'}」对应的元素`
    case 'browserType':
      return args.text
        ? `在「${args.text}」输入框中输入「${args.value || ''}」`
        : `在选择器「${args.selector || '未知'}」中输入「${args.value || ''}」`
    default:
      return `执行 ${name} 操作`
  }
}

// 只有修改/写入/点击/输入类操作需要确认，只读操作直接执行
const DANGEROUS_TOOLS = ['writeFile', 'browserOpen', 'browserClick', 'browserType']

const BASE_TOOLS_DOC = `
## 可用工具
使用 <tool name="工具名">{"参数": "值"}</tool> 格式调用工具。

### 文件操作
1. **readFile** - 读取电脑上任意文件
   项目内: <tool name="readFile">{"path": "scripts/utils/environment.py"}</tool>
   任意路径: <tool name="readFile">{"path": "/Users/xxx/Documents/note.txt"}</tool>
   Windows: <tool name="readFile">{"path": "C:\\Users\\xxx\\Desktop\\data.csv"}</tool>

2. **writeFile** - 写入/修改电脑上任意文件（会自动创建目录）
   示例: <tool name="writeFile">{"path": "scripts/test.py", "content": "print('hello')"}</tool>

3. **listDir** - 列出电脑上任意目录
   示例: <tool name="listDir">{"path": "/Users/xxx/Desktop"}</tool>

### 浏览器操作（Playwright 驱动，headless Chromium）
4. **browserOpen** - 打开网页
   示例: <tool name="browserOpen">{"url": "https://www.baidu.com"}</tool>

5. **browserRead** - 读取当前页面文本内容
   示例: <tool name="browserRead">{}</tool>

6. **browserClick** - 点击页面元素（按文本或CSS选择器）
   按文本: <tool name="browserClick">{"text": "登录"}</tool>
   按选择器: <tool name="browserClick">{"selector": "#submit-btn"}</tool>
   多个匹配时指定第几个(0-based): <tool name="browserClick">{"text": "查询", "nth": 0}</tool>

7. **browserType** - 在输入框输入文字
   按关联文本找输入框: <tool name="browserType">{"text": "用户名", "value": "admin"}</tool>
   按选择器: <tool name="browserType">{"selector": "#password", "value": "123456"}</tool>

8. **browserScreenshot** - 截取当前页面（返回图片）
   示例: <tool name="browserScreenshot">{}</tool>

## 规则
- 文件路径支持相对路径和绝对路径；URL 需带 http:// 或 https://
- **仅修改类操作（writeFile / browserOpen / browserClick / browserType）需用户确认，只读操作直接执行**
- 读取大文件时只返回前 3000 字符，页面文本限制 8000 字符
- 修改文件前先读取确认内容
- 一次可调用多个工具，逐个执行
- 不用工具时直接回复文字
- 用中文回复，简洁专业`

const AGENTS: AgentConfig[] = [
  {
    id: 'general',
    name: '通用助手',
    icon: <Sparkles size={13} className="text-purple-400" />,
    description: '回答各类问题，分析报告和脚本',
    welcome: '你好！我是通用 AI 助手。\n• 分析测试报告和脚本\n• 读写本地文件\n• 解答供应链测试问题\n• 调试 API 报错\n\n💡 试试：「帮我看看 scripts 目录」',
    systemPrompt: `你是一个全能的供应链测试助手。${BASE_TOOLS_DOC}`,
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

function createThread(agentId: string): Thread {
  return {
    id: Date.now().toString(),
    name: '新对话',
    agentId,
    messages: [],
    createdAt: new Date().toISOString(),
  }
}

const MAX_TOOL_ROUNDS = 5

export function AIAssistant() {
  const [threads, setThreads] = useState<Thread[]>(loadThreads)
  const [activeThreadId, setActiveThreadId] = useState<string>(() => {
    const saved = loadActiveThreadId()
    // 验证保存的 ID 是否在已加载的线程中存在
    const allThreads = loadThreads()
    if (saved && allThreads.some(t => t.id === saved)) return saved
    return allThreads.length > 0 ? allThreads[0].id : ''
  })
  const [showAgentMenu, setShowAgentMenu] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameInput, setRenameInput] = useState('')
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

  // 持久化
  function updateThreads(next: Thread[]) {
    setThreads(next)
    saveThreads(next)
  }

  function handleNewThread() {
    const t = createThread(activeAgentId)
    updateThreads([...threads, t])
    setActiveThreadId(t.id)
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

  /** 执行工具循环并获取最终回复 */
  async function runWithTools(
    history: { role: string; content: string }[],
    setStatus: (msg: string) => void,
  ): Promise<string> {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const reply = await api.aiChat(history)
      const { tools, rest } = parseTools(reply)

      if (tools.length === 0) {
        // 无工具调用，直接返回
        return reply
      }

      // 有工具调用：检查是否需要确认
      const dangerousTools = tools.filter(t => DANGEROUS_TOOLS.includes(t.name))
      if (dangerousTools.length > 0) {
        const approved = await requestConfirm(dangerousTools)
        if (!approved) {
          return '⛔ 用户取消了文件操作。如需继续，请重新描述你的需求。'
        }
      }

      // 逐个执行
      setStatus(`执行工具中 (第 ${round + 1} 轮)...`)
      const toolResults: string[] = []
      for (const tool of tools) {
        setStatus(`正在${TOOL_LABELS[tool.name] || tool.name}...`)
        const result = await executeTool(tool)
        toolResults.push(`[工具 ${tool.name} 结果]\n${result}`)
      }

      // 将工具调用和结果追加到对话历史
      history.push({ role: 'assistant', content: reply })
      history.push({ role: 'user', content: `工具执行结果:\n${toolResults.join('\n\n')}\n\n请根据以上结果继续回答。` })
    }
    return '已达到最大工具调用轮次，请简化问题重试。'
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

      // 构建完整对话历史（包含系统提示）
      const systemMsg = { role: 'system', content: currentAgent.systemPrompt }
      const recentHistory = newMessages.slice(-10).map(m => ({
        role: m.role as string,
        content: m.content,
      }))
      const history = [systemMsg, ...recentHistory, { role: 'user', content: text }]

      // 先放一个 assistant 消息占位，实时显示工具状态
      const updatePlaceholder = (content: string) => {
        updateMessages([...newMessages, { role: 'assistant', content }])
      }
      updatePlaceholder('▊ 正在分析…')

      // 包装 toolStatus setter，同步更新占位消息
      const setStatus = (msg: string) => {
        setToolStatus(msg)
        updatePlaceholder(`▊ ${msg}`)
      }

      const finalReply = await runWithTools(history, setStatus)

      // 确保最终内容完整（如果工具执行期间占位消息被覆盖）
      updateMessages([...newMessages, { role: 'assistant', content: finalReply }])
    } catch (err: any) {
      console.error('[AIAssistant] 出错:', err)
      updateMessages([...newMessages, { role: 'assistant', content: `出错了: ${err.message || String(err)}` }])
    } finally {
      setLoading(false)
      setToolStatus('')
    }
  }

  function handleClear() {
    updateMessages([{ role: 'assistant', content: currentAgent.welcome }])
  }

  return (
    <div className="flex h-full">
      {/* 左侧：线程列表 */}
      <aside className="w-48 border-r border-border/5 bg-surface-light/10 flex flex-col shrink-0">
        <div className="px-3 py-2.5 border-b border-border/5 flex items-center justify-between">
          <span className="text-[10px] text-muted uppercase tracking-wider">对话</span>
          <button onClick={handleNewThread} className="p-1 rounded hover:bg-hover/10 text-muted hover:text-foreground transition-colors" title="新建对话">
            <Plus size={13} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threads.map(t => (
            <div key={t.id}
              onClick={() => setActiveThreadId(t.id)}
              className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors border-b border-border/[0.03]
                ${activeThreadId === t.id ? 'bg-accent/10 border-l-2 border-l-accent' : 'hover:bg-hover/5 border-l-2 border-l-transparent'}`}
            >
              <MessageSquare size={12} className={activeThreadId === t.id ? 'text-accent-light' : 'text-muted'} />
              <div className="flex-1 min-w-0">
                {renamingId === t.id ? (
                  <input
                    value={renameInput}
                    onChange={e => setRenameInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRename(t.id); if (e.key === 'Escape') setRenamingId(null) }}
                    onBlur={() => handleRename(t.id)}
                    className="w-full text-[11px] px-1 py-0.5 rounded bg-surface border border-border/5 outline-none"
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <p className="text-[11px] text-foreground truncate">{t.name}</p>
                )}
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={e => { e.stopPropagation(); setRenamingId(t.id); setRenameInput(t.name) }}
                  className="p-0.5 rounded hover:bg-hover/10 text-muted hover:text-foreground"
                  title="重命名"
                >
                  <Edit3 size={10} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); if (threads.length > 1) handleDeleteThread(t.id) }}
                  className="p-0.5 rounded hover:bg-red-500/20 text-muted hover:text-red-400"
                  title="删除"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="px-3 py-2 border-t border-border/5">
          <p className="text-[9px] text-muted text-center">{threads.length} 个对话</p>
        </div>
      </aside>

      {/* 右侧：聊天区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 头部 */}
        <header className="h-12 flex items-center gap-3 px-4 border-b border-border/5 bg-surface-light/50 shrink-0">
        {/* Agent 选择器 */}
        <div className="relative">
          <button
            onClick={() => setShowAgentMenu(!showAgentMenu)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-hover/10 transition-colors"
          >
            <div className="w-5 h-5 rounded bg-purple-500/20 flex items-center justify-center">
              {currentAgent.icon}
            </div>
            <span className="text-sm font-medium">{currentAgent.name}</span>
            <ChevronDown size={12} className="text-muted" />
          </button>

          {showAgentMenu && (
            <div className="absolute top-full left-0 mt-1 w-52 bg-surface-light border border-border/10 rounded-xl shadow-xl z-50 py-1 animate-fade-in"
                 onClick={() => setShowAgentMenu(false)}>
              {AGENTS.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => {
                    // 切换当前线程的 Agent，保留对话历史
                    updateThreads(threads.map(t =>
                      t.id === activeThreadId ? { ...t, agentId: agent.id } : t
                    ))
                    setShowAgentMenu(false)
                  }}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-hover/5 transition-colors
                    ${activeAgentId === agent.id ? 'bg-accent/10' : ''}`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5
                    ${activeAgentId === agent.id ? 'bg-accent/20' : 'bg-hover/10'}`}>
                    {agent.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground">{agent.name}</div>
                    <div className="text-[10px] text-muted leading-tight">{agent.description}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1" />
        <button onClick={handleClear} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-hover/5 hover:bg-hover/10 text-muted hover:text-foreground transition-colors">
          <Trash2 size={12} />
          清空对话
        </button>
      </header>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={15} className="text-purple-400" />
              </div>
            )}
            <div className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words
              ${msg.role === 'user'
                ? 'bg-accent/20 text-foreground rounded-br-md'
                : 'bg-hover/10 text-foreground rounded-bl-md'}`}>
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center shrink-0 mt-0.5">
                <User size={15} className="text-accent-light" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
              <Bot size={15} className="text-purple-400" />
            </div>
            <div className="bg-hover/10 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-muted" />
                <span className="text-sm text-muted">{toolStatus || '思考中...'}</span>
              </div>
              {toolStatus && (
                <div className="mt-2 p-2 rounded-lg bg-accent/10 border border-accent/10">
                  <div className="flex items-center gap-1.5 text-[11px] text-accent-light">
                    <Wrench size={11} />
                    正在调用工具...
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 输入区 */}
      <div className="px-6 py-4 border-t border-border/5 bg-surface-light/20 shrink-0">
        <div className="flex gap-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="输入问题，Enter 发送... 可访问电脑任意文件，操作前会请你确认"
            disabled={loading}
            className="flex-1 rounded-xl px-4 py-3 text-sm outline-none bg-surface border border-border/5 focus:border-accent/50 disabled:opacity-50 placeholder:text-muted/40 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-5 py-3 rounded-xl bg-accent hover:bg-accent-light text-foreground disabled:opacity-40 transition-all flex items-center gap-2"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      {/* 确认弹窗 */}
      {pendingConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-light border border-border/10 rounded-2xl w-[500px] shadow-2xl animate-fade-in">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border/5">
              <div className="w-8 h-8 rounded-full bg-warning/20 flex items-center justify-center">
                <AlertTriangle size={16} className="text-warning" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">确认操作</h3>
                <p className="text-[11px] text-muted">AI 请求执行以下操作，请确认后继续</p>
              </div>
            </div>

            <div className="px-5 py-3 space-y-2 max-h-[300px] overflow-y-auto">
              {pendingConfirm.tools.map((tool, i) => (
                <div key={i} className="bg-surface rounded-lg p-3 border border-border/5 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-warning uppercase bg-warning/10 px-1.5 py-0.5 rounded">
                      {TOOL_LABELS[tool.name] || tool.name}
                    </span>
                  </div>
                  <p className="text-xs text-foreground leading-relaxed">{describeTool(tool)}</p>
                  {tool.args.content && (
                    <pre className="text-[11px] text-muted font-mono bg-hover/5 rounded p-2 max-h-[120px] overflow-y-auto whitespace-pre-wrap break-all">
                      {tool.args.content.length > 500
                        ? tool.args.content.slice(0, 500) + '\n... (截断)'
                        : tool.args.content}
                    </pre>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/5">
              <button
                onClick={() => {
                  pendingConfirm.resolve(false)
                  setPendingConfirm(null)
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium
                           bg-hover/5 hover:bg-hover/10 text-muted hover:text-foreground transition-colors"
              >
                <XCircle size={13} />
                取消
              </button>
              <button
                onClick={() => {
                  pendingConfirm.resolve(true)
                  setPendingConfirm(null)
                }}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-medium
                           bg-warning/20 hover:bg-warning/30 text-warning transition-colors"
              >
                <CheckCircle2 size={13} />
                确认执行
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
