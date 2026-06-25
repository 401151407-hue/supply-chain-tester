/**
 * Preload 桥接层 - 将主进程能力安全地暴露给渲染进程
 */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type TestCase, type TestReport, type TestSuite, type AIConfig, type AIGeneratedStep, type ApiBatchRequest, type ApiBatchResult } from '../shared/types'

const api = {
  /** 执行单个测试用例 */
  runTest: (testCase: TestCase): Promise<TestReport> =>
    ipcRenderer.invoke(IPC_CHANNELS.RUN_TEST, testCase),

  /** 批量执行测试套件 */
  runSuite: (suite: TestSuite, cases: TestCase[]): Promise<TestReport[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.RUN_SUITE, suite, cases),

  /** 获取所有报告 */
  getReports: (): Promise<TestReport[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_REPORTS),

  /** 获取单个报告 */
  getReport: (id: string): Promise<TestReport | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_REPORT, id),

  /** 保存测试用例 */
  saveTestCase: (testCase: TestCase): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_TEST_CASE, testCase),

  /** 加载所有测试用例 */
  loadTestCases: (): Promise<TestCase[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.LOAD_TEST_CASES),

  /** 删除测试用例 */
  deleteTestCase: (id: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.DELETE_TEST_CASE, id),

  /** AI 分析报告（传入报告 JSON 字符串） */
  aiAnalyze: (reportJson: string): Promise<string[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_ANALYZE, reportJson),

  /** AI 生成测试步骤 */
  aiGenerateSteps: (description: string): Promise<AIGeneratedStep[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_STEPS, description),

  /** 获取 AI 配置 */
  getAIConfig: (): Promise<AIConfig> =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_GET_CONFIG),

  /** 保存 AI 配置 */
  saveAIConfig: (config: AIConfig): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_SAVE_CONFIG, config),

  /** 测试 AI 连接 */
  testAIConnection: (): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_TEST_CONNECTION),

  /** AI 多轮对话 */
  aiChat: (messages: { role: string; content: string }[]): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT, messages),

  /** AI 流式多轮对话 — 返回取消订阅函数 */
  aiChatStream: (
    messages: { role: string; content: string }[],
    onToken: (token: string) => void,
    onDone: (result: { ok: boolean; content?: string; error?: string }) => void,
  ): (() => void) => {
    const tokenHandler = (_event: any, token: string) => onToken(token)
    ipcRenderer.on(IPC_CHANNELS.AI_CHAT_STREAM_TOKEN, tokenHandler)

    ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT_STREAM, messages).then(onDone)

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.AI_CHAT_STREAM_TOKEN, tokenHandler)
    }
  },

  /** 读取文件内容 */
  readFile: (filePath: string): Promise<{ ok: boolean; content?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_READ, filePath),

  /** 写入文件 */
  writeFile: (filePath: string, content: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_WRITE, filePath, content),

  /** 列出目录内容 */
  listDir: (dirPath: string): Promise<{ ok: boolean; items?: { name: string; isDir: boolean }[]; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_LIST, dirPath),

  /** 浏览器操作（AI Agent 用） */
  browserOpen: (url: string): Promise<{ ok: boolean; title: string; url: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.BROWSER_OPEN, url),
  browserRead: (): Promise<{ ok: boolean; text: string; title: string; url: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.BROWSER_READ),
  browserClick: (target: { text?: string; selector?: string; nth?: number }): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.BROWSER_CLICK, target),
  browserType: (target: { text?: string; selector?: string; value: string }): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.BROWSER_TYPE, target),
  browserScreenshot: (): Promise<{ ok: boolean; dataUrl: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.BROWSER_SCREENSHOT),
  browserClose: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.BROWSER_CLOSE),

  /** 运行 Python 脚本 */
  runScript: (scriptPath: string, vars?: Record<string, string>): Promise<{ ok: boolean; output: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.RUN_SCRIPT, scriptPath, vars),

  /** 停止正在运行的脚本 */
  stopScript: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.STOP_SCRIPT),

  /** 监听脚本实时输出 */
  onScriptOutput: (callback: (chunk: string) => void) => {
    const handler = (_event: any, chunk: string) => callback(chunk)
    ipcRenderer.on('script:output', handler)
    return () => ipcRenderer.removeListener('script:output', handler)
  },
  onScriptDone: (callback: (result: { ok: boolean }) => void) => {
    const handler = (_event: any, result: { ok: boolean }) => callback(result)
    ipcRenderer.on('script:done', handler)
    return () => ipcRenderer.removeListener('script:done', handler)
  },

  /** 检查 Python 是否可用 */
  checkPython: (): Promise<{ available: boolean; version?: string; hint?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.CHECK_PYTHON),

  /** 一键安装 Playwright + Chromium */
  installPlaywright: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.INSTALL_PLAYWRIGHT),

  /** 检测 Playwright + Chromium 是否可用 */
  checkPlaywright: (): Promise<{ playwright: boolean; chromium: boolean }> =>
    ipcRenderer.invoke('app:check-playwright'),

  /** 解析脚本可配置变量 */
  parseScriptVars: (scriptPath: string): Promise<{ key: string; value: string; comment: string }[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.PARSE_SCRIPT_VARS, scriptPath),

  /** 扫描 scripts 目录，返回产品线脚本树 */
  scanScripts: () => ipcRenderer.invoke(IPC_CHANNELS.SCAN_SCRIPTS),

  /** 获取 scripts 目录的绝对路径 */
  getScriptsPath: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.GET_SCRIPTS_PATH),

  /** API 调试：发送 HTTP 请求 */
  apiDebug: (req: { method: string; url: string; headers: Record<string,string>; body?: string; timeout?: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.API_DEBUG, req),

  /** API 并发性能测试 */
  apiDebugBatch: (req: ApiBatchRequest): Promise<ApiBatchResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.API_DEBUG_BATCH, req),

  /** 自动更新 */
  getUpdateState: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_GET_STATE),
  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),
  downloadUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_DOWNLOAD),
  installUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL),
  installLanUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL_LAN),
  onUpdateStateChanged: (callback: (state: any) => void) => {
    const handler = (_event: any, state: any) => callback(state)
    ipcRenderer.on('update:state-changed', handler)
    return () => ipcRenderer.removeListener('update:state-changed', handler)
  },

  /** 当前系统的路径分隔符 */
  pathSep: process.platform === 'win32' ? '\\' : '/',

  /** 打开脚本目录 */
  openScriptsFolder: (): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('app:open-scripts-folder'),

  /** 打开数据目录 */
  openDataFolder: (): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('app:open-data-folder'),

  /** 用系统默认程序打开文件 */
  openPath: (filePath: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('shell:open-path', filePath),
}

contextBridge.exposeInMainWorld('supplyChainTester', api)

export type SupplyChainTesterAPI = typeof api
