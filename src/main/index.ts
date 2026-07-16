/**
 * Electron 主进程入口
 * 创建窗口，注册 IPC 处理器，管理测试运行器
 */
import { app, BrowserWindow, ipcMain, shell, Menu, type MenuItemConstructorOptions } from 'electron'
import { join, sep } from 'path'
import { pathToFileURL } from 'url'
import { spawn } from 'child_process'
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync } from 'fs'
import { TestRunner } from './test-runner'
import { ReportStore } from './report-store'
import { AIService, DEFAULT_AI_CONFIG, type AIConfig } from './ai-service'
import { IPC_CHANNELS, type TestCase, type TestSuite, type ApiBatchRequest, type ApiBatchResult, type ApiBatchItem, type RecordSession } from '../shared/types'
import { initAutoUpdater, checkForUpdates as doCheckUpdates, downloadUpdate as doDownloadUpdate, quitAndInstall, installLanUpdate, getUpdateState, stopLanServer } from './auto-updater'
import { browserOpen, browserRead, browserClick, browserType, browserScreenshot, closeBrowser, startRecording, stopRecording, clearRecordingDedup, replayStep } from './browser-manager'

const isDev = !app.isPackaged

/** 获取脚本根目录（dev: 项目根, packaged: app 安装目录，升级时由 NSIS 脚本保护） */
function getScriptsDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, '..', 'test-suites')
  }
  return join(__dirname, '../..', 'test-suites')
}

/** 获取项目根目录（dev: 项目根, packaged: app 根目录） */
function getAppRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, '..')
  }
  return join(__dirname, '../..')
}

let mainWindow: BrowserWindow | null = null
const aiService = new AIService()
const testRunner = new TestRunner()
const reportStore = new ReportStore()

// Python 路径解析
function getPythonPortableDir(): string {
  if (app.isPackaged) {
    // python-portable 与 app.asar 同级，都在 resources/ 下
    return join(process.resourcesPath, 'python-portable')
  }
  return join(app.getAppPath(), 'resources', 'python-portable')
}
const PYTHON_EXE = process.platform === 'win32' ? 'python.exe' : 'python3'

function getPythonPath(): string {
  // 优先使用打包的便携版 Python
  const bundled = join(getPythonPortableDir(), PYTHON_EXE)
  if (existsSync(bundled)) return bundled

  if (process.platform === 'win32') {
    // 回退：尝试 Windows 常见 Python 安装路径
    const localAppData = process.env.LOCALAPPDATA || ''
    const candidates = [
      `D:\\Python\\python.exe`,
      `D:\\Python312\\python.exe`,
      `D:\\Python311\\python.exe`,
      `D:\\Python310\\python.exe`,
      `C:\\Python312\\python.exe`,
      `C:\\Python311\\python.exe`,
      `C:\\Python310\\python.exe`,
      `${localAppData}\\Programs\\Python\\Python312\\python.exe`,
      `${localAppData}\\Programs\\Python\\Python311\\python.exe`,
      `${localAppData}\\Programs\\Python\\Python310\\python.exe`,
    ]
    for (const p of candidates) {
      if (existsSync(p)) return p
    }
    // Windows 回退到 PATH 中的 python / py
    return 'python'
  }

  // macOS / Linux：尝试常见的 python3 路径
  const unixCandidates = [
    '/usr/local/bin/python3',
    '/usr/bin/python3',
    '/Library/Frameworks/Python.framework/Versions/3.11/bin/python3',
    '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3',
    '/Library/Frameworks/Python.framework/Versions/3.10/bin/python3',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python',
    '/usr/bin/python',
  ]
  for (const p of unixCandidates) {
    if (existsSync(p)) return p
  }

  // 最后回退到 PATH 中的 python3 / python
  return 'python3'
}

// Python 可用性缓存
let pythonAvailable: boolean | null = null
let pythonVersion: string | null = null

/** 获取所有可能的 Python 路径 */
function getPythonPaths(): string[] {
  const paths: string[] = []
  
  // 1. 打包的便携版 Python（最高优先）
  if (!isDev) {
    const bundled = join(getPythonPortableDir(), PYTHON_EXE)
    console.log('[Python] Checking bundled:', bundled, 'exists:', existsSync(bundled))
    if (existsSync(bundled)) paths.push(bundled)
  }

  // 2. 常见命令
  paths.push('python', 'python3', 'py')

  // 3. 常见 Windows 安装路径
  const localAppData = process.env.LOCALAPPDATA || ''
  const commonDirs = [
    `D:\\Python\\python.exe`,
    `D:\\Python312\\python.exe`,
    `D:\\Python311\\python.exe`,
    `D:\\Python310\\python.exe`,
    `C:\\Python312\\python.exe`,
    `C:\\Python311\\python.exe`,
    `C:\\Python310\\python.exe`,
    `${localAppData}\\Programs\\Python\\Python312\\python.exe`,
    `${localAppData}\\Programs\\Python\\Python311\\python.exe`,
    `${localAppData}\\Programs\\Python\\Python310\\python.exe`,
  ]
  for (const p of commonDirs) {
    if (existsSync(p)) paths.push(p)
  }

  return paths
}

/** 检测 Python 是否可用（每次重新检测，不用缓存） */
async function checkPython(): Promise<{ available: boolean; version?: string; hint?: string }> {
  const pathsToTry = getPythonPaths()

  for (const pythonPath of pathsToTry) {
    const result = await tryPython(pythonPath)
    if (result.available) {
      pythonAvailable = true
      pythonVersion = result.version!
      return result
    }
  }

  pythonAvailable = false
  return {
    available: false,
    hint: '未检测到 Python。请安装 Python 或运行 npm run setup-python 使用内置便携版。',
  }
}

function tryPython(pythonPath: string): Promise<{ available: boolean; version?: string }> {
  return new Promise((resolve) => {
    const { execFile } = require('child_process')
    execFile(pythonPath, ['--version'], {
      timeout: 10000,
      windowsHide: true,
    }, (err: any, stdout: string, stderr: string) => {
      if (err) {
        console.warn('[Python] execFile failed for', pythonPath, ':', err.message)
        // embeddable Python outputs version to stderr
        const output = (stdout + stderr).trim()
        if (output.includes('Python')) {
          resolve({ available: true, version: output })
        } else {
          resolve({ available: false })
        }
        return
      }
      const output = (stdout + stderr).trim()
      resolve({
        available: output.includes('Python'),
        version: output || undefined,
      })
    })
  })
}

// 启动时从文件加载 AI 配置
function loadAIConfig(): void {
  const saved = reportStore.getAIConfig()
  if (saved) {
    aiService.updateConfig(saved)
  }
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    // macOS 应用菜单
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { label: '关于', role: 'about' as const },
              { type: 'separator' as const },
              { label: '服务', role: 'services' as const },
              { type: 'separator' as const },
              { label: '隐藏', role: 'hide' as const },
              { label: '隐藏其他', role: 'hideOthers' as const },
              { label: '全部显示', role: 'unhide' as const },
              { type: 'separator' as const },
              { label: '退出', role: 'quit' as const },
            ],
          },
        ]
      : []),
    // 文件
    {
      label: '文件',
      submenu: [
        {
          label: '新建测试用例',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new-test-case'),
        },
        { type: 'separator' },
        isMac
          ? { label: '关闭窗口', role: 'close' as const }
          : { label: '退出', role: 'quit' as const },
      ],
    },
    // 编辑
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' as const },
        { label: '重做', role: 'redo' as const },
        { type: 'separator' },
        { label: '剪切', role: 'cut' as const },
        { label: '复制', role: 'copy' as const },
        { label: '粘贴', role: 'paste' as const },
        { label: '全选', role: 'selectAll' as const },
      ],
    },
    // 视图
    {
      label: '视图',
      submenu: [
        { label: '重新加载', role: 'reload' as const },
        { label: '强制重新加载', role: 'forceReload' as const },
        { label: '开发者工具', role: 'toggleDevTools' as const },
        { type: 'separator' },
        { label: '实际大小', role: 'resetZoom' as const },
        { label: '放大', role: 'zoomIn' as const },
        { label: '缩小', role: 'zoomOut' as const },
        { type: 'separator' },
        { label: '全屏', role: 'togglefullscreen' as const },
      ],
    },
    // 窗口
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' as const },
        { label: '缩放', role: 'zoom' as const },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { label: '前置全部窗口', role: 'front' as const },
            ]
          : [{ label: '关闭窗口', role: 'close' as const }]),
      ],
    },
    // 帮助
    {
      label: '帮助',
      submenu: [
        {
          label: '关于供应链测试工具',
          click: () => {
            shell.openExternal('https://github.com')
          },
        },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: '供应链测试工具 - Supply Chain Tester',
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      webSecurity: true,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // 外部链接用默认浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ---- IPC 处理器 ----

function registerIpcHandlers(): void {
  // 执行单个测试用例
  ipcMain.handle(IPC_CHANNELS.RUN_TEST, async (_event, testCase: TestCase) => {
    return testRunner.run(testCase)
  })

  // 批量执行测试套件
  ipcMain.handle(IPC_CHANNELS.RUN_SUITE, async (_event, suite: TestSuite, cases: TestCase[]) => {
    const results = []
    for (const tc of cases) {
      const report = await testRunner.run(tc)
      results.push(report)
    }
    return results
  })

  // 获取所有报告
  ipcMain.handle(IPC_CHANNELS.GET_REPORTS, async () => {
    return reportStore.getAll()
  })

  // 获取单个报告
  ipcMain.handle(IPC_CHANNELS.GET_REPORT, async (_event, id: string) => {
    return reportStore.get(id)
  })

  // 保存测试用例
  ipcMain.handle(IPC_CHANNELS.SAVE_TEST_CASE, async (_event, testCase: TestCase) => {
    return reportStore.saveCase(testCase)
  })

  // 加载所有测试用例
  ipcMain.handle(IPC_CHANNELS.LOAD_TEST_CASES, async () => {
    return reportStore.loadCases()
  })

  // 删除测试用例
  ipcMain.handle(IPC_CHANNELS.DELETE_TEST_CASE, async (_event, id: string) => {
    return reportStore.deleteCase(id)
  })

  // AI 分析报告（传入报告 JSON 字符串）
  ipcMain.handle(IPC_CHANNELS.AI_ANALYZE, async (_event, reportJson: string) => {
    return testRunner.aiAnalyze(reportJson)
  })

  // AI 生成测试步骤
  ipcMain.handle(IPC_CHANNELS.AI_GENERATE_STEPS, async (_event, description: string) => {
    return testRunner.aiGenerateSteps(description)
  })

  // AI 配置读写
  ipcMain.handle(IPC_CHANNELS.AI_GET_CONFIG, async () => {
    return aiService.getConfig()
  })

  ipcMain.handle(IPC_CHANNELS.AI_SAVE_CONFIG, async (_event, config: AIConfig) => {
    aiService.updateConfig(config)
    testRunner.setAIService(aiService)
    reportStore.saveAIConfig(config)
    return { ok: true }
  })

  // AI 连接测试
  ipcMain.handle(IPC_CHANNELS.AI_TEST_CONNECTION, async () => {
    return aiService.testConnection()
  })

  // 运行 Python 脚本（流式输出）
  let runningProc: ReturnType<typeof spawn> | null = null

  ipcMain.handle(IPC_CHANNELS.RUN_SCRIPT, async (event, scriptPath: string, vars?: Record<string, string>) => {
    if (runningProc) { runningProc.kill(); runningProc = null }
    return new Promise<{ ok: boolean; output: string }>((resolve) => {
      const { dirname } = require('path')
      const { readFileSync } = require('fs')
      const pythonPath = getPythonPath()
      const scriptsDir = getScriptsDir()
      const fullScriptPath = join(dirname(scriptsDir), scriptPath)
      const envArg = vars?.env || vars?.current_env || ''

      // 读取原始脚本，将用户填写变量的值替换掉脚本中的默认值
      let scriptContent = readFileSync(fullScriptPath, 'utf-8')
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          if (k === 'env' || k === 'current_env') continue
          const userVal = v != null ? String(v) : ''
          // 替换脚本中的赋值语句：var = 'xxx' 或 var = "xxx"，后面可能有 # 注释
          const re = new RegExp(
            `(^|\\n)(\\s*)${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*(["']).*?\\3(\\s*#.*)?(\\r?\\n|$)`,
            'gm'
          )
          scriptContent = scriptContent.replace(re, `$1$2${k} = ${JSON.stringify(userVal)}$4$5`)
        }
      }

      const varLines = vars ? Object.entries(vars)
        .filter(([k]) => k !== 'env' && k !== 'current_env' && !new RegExp(`(^|\\n)${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`).test(scriptContent))
        .map(([k, v]) => `${k} = ${JSON.stringify(v != null ? v : '')}`)
        .join('\n') + '\n' : ''
      const argvPart = envArg ? `sys.argv = ['${fullScriptPath.replace(/\\/g, '\\\\')}', '${envArg}']` : ''
      const varPart = varLines.trim().split('\n').filter(Boolean).join('; ')
      const sitePackages = join(getPythonPortableDir(), 'site-packages')
      const injectLine = `import sys; sys.path.insert(0, r"${scriptsDir}"); sys.path.insert(0, r"${sitePackages.replace(/\\/g, '\\\\')}"); ${argvPart}${varPart ? '; ' + varPart : ''}; __file__ = r"${fullScriptPath.replace(/\\/g, '\\\\')}"`
      // 注入代码拼到脚本第一行，保持报错行号和原脚本完全一致
      const firstNewline = scriptContent.indexOf('\n')
      let insertPos = firstNewline
      // 处理 CRLF：在 \r 之前取第一行内容
      if (insertPos > 0 && scriptContent[insertPos - 1] === '\r') {
        insertPos--
      }
      const firstLine = insertPos > 0 ? scriptContent.slice(0, insertPos) : (insertPos === 0 ? '' : scriptContent)
      const trimmedFirst = firstLine.trimStart()
      if (trimmedFirst.startsWith('#')) {
        // 第一行是注释（如 # -*- coding: utf-8 -*-），注入代码必须放在 # 前面，否则会被注释掉
        const hashIdx = firstLine.indexOf('#')
        const newFirstLine = firstLine.slice(0, hashIdx) + injectLine + '; ' + firstLine.slice(hashIdx)
        scriptContent = newFirstLine + (firstNewline >= 0 ? scriptContent.slice(firstNewline) : '\n')
      } else if (insertPos > 0) {
        // 变量赋值必须放在脚本原始代码之前，否则脚本第一行的 print(f'{var}') 会报 NameError
        scriptContent = injectLine + '; ' + scriptContent
      } else {
        // 脚本为空或只有一行：注入代码放在最前面
        scriptContent = injectLine + '\n' + scriptContent
      }

      // 将 preamble 写入脚本目录下的临时 .py 文件执行
      const { writeFileSync, unlinkSync } = require('fs')
      const tempPyFile = join(scriptsDir, `_sct_${Date.now()}.py`)
      writeFileSync(tempPyFile, scriptContent, 'utf-8')

      const proc = spawn(pythonPath, ['-u', tempPyFile], {
        cwd: scriptsDir,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
      })
      runningProc = proc
      let output = ''
      const emit = (chunk: string) => {
        output += chunk
        event.sender.send('script:output', chunk)
      }
      proc.stdout.on('data', (data: Buffer) => emit(data.toString('utf-8')))
      // stderr 用于变量注入（key:value / key=value 行），非变量行也转发到输出
      let stderrBuf = ''
      let inTraceback = false  // 检测到 Traceback 后停止变量注入
      // Python 异常类名黑名单，防止错误信息被误当变量注入
      const PYTHON_EXCEPTIONS = new Set([
        'NameError', 'TypeError', 'ValueError', 'KeyError', 'IndexError',
        'AttributeError', 'ImportError', 'ModuleNotFoundError', 'SyntaxError',
        'OSError', 'FileNotFoundError', 'RuntimeError', 'ConnectionError',
        'ZeroDivisionError', 'StopIteration', 'AssertionError', 'Exception',
        'BaseException', 'SystemExit', 'KeyboardInterrupt'
      ])
      proc.stderr.on('data', (data: Buffer) => {
        stderrBuf += data.toString('utf-8')
        const lines = stderrBuf.split('\n')
        stderrBuf = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          // 检测到 traceback 开头，后续行全部当作错误输出
          if (/^\s*Traceback\s*\(/.test(trimmed)) {
            inTraceback = true
            event.sender.send('script:output', `[stderr] ${line}\n`)
            continue
          }
          // traceback 结束标志：非缩进行且非 File " 行
          if (inTraceback) {
            if (/^\s*(File\s+")/.test(trimmed) || /^\s/.test(trimmed)) {
              event.sender.send('script:output', `[stderr] ${line}\n`)
            } else {
              inTraceback = false  // 非 traceback 内容，恢复变量解析
            }
            continue
          }
          const m = trimmed.match(/^(\w+)\s*[:=]\s*(.+)$/)
          if (m) {
            const key = m[1].trim()
            // 过滤掉 Python 异常名和内置类型
            if (PYTHON_EXCEPTIONS.has(key) || key.startsWith('__')) {
              event.sender.send('script:output', `[stderr] ${line}\n`)
            } else {
              event.sender.send('script:vars', { [key]: m[2].trim() })
            }
          } else {
            event.sender.send('script:output', `[stderr] ${line}\n`)
          }
        }
      })
      const flushStderr = () => {
        if (stderrBuf.trim()) {
          const trimmed = stderrBuf.trim()
          if (/^\s*(Traceback|File\s+")/.test(trimmed)) {
            event.sender.send('script:output', `[stderr] ${trimmed}\n`)
          } else {
            const m = trimmed.match(/^(\w+)\s*[:=]\s*(.+)$/)
            if (m) {
              const key = m[1].trim()
              if (PYTHON_EXCEPTIONS.has(key) || key.startsWith('__')) {
                event.sender.send('script:output', `[stderr] ${trimmed}\n`)
              } else {
                event.sender.send('script:vars', { [key]: m[2].trim() })
              }
            } else {
              event.sender.send('script:output', `[stderr] ${trimmed}\n`)
            }
          }
        }
        stderrBuf = ''
        inTraceback = false
      }
      const cleanup = (keepFile = false) => {
        runningProc = null
        if (!keepFile) { try { unlinkSync(tempPyFile) } catch {} }
      }
      proc.on('close', (code) => {
        flushStderr()
        if (code !== 0) {
          event.sender.send('script:output', `[stderr] 脚本异常退出(code=${code})\n`)
          cleanup()
        } else {
          cleanup()
        }
        event.sender.send('script:done', { ok: code === 0 })
        resolve({ ok: code === 0, output })
      })
      proc.on('error', (err) => {
        cleanup()
        const code = (err as any).code
        let hint = ''
        if (code === 'ENOENT') {
          const portableDir = getPythonPortableDir()
          hint = `\n\n💡 请将 python-portable.zip 解压到 ${portableDir}/`
          if (process.platform === 'win32') {
            hint += `\n   或安装 Python 3.11 并添加到系统 PATH 环境变量`
          }
        }
        const msg = `无法启动 Python: ${err.message}${hint}`
        event.sender.send('script:output', msg)
        event.sender.send('script:done', { ok: false })
        resolve({ ok: false, output: msg })
      })
    })
  })

  // 停止正在运行的脚本
  ipcMain.handle(IPC_CHANNELS.STOP_SCRIPT, async () => {
    if (runningProc) {
      runningProc.kill()
      runningProc = null
      return { ok: true }
    }
    return { ok: false }
  })

  // 检查 Python 是否可用
  ipcMain.handle(IPC_CHANNELS.CHECK_PYTHON, async () => {
    return checkPython()
  })

  // 一键安装 Playwright + Chromium（用于 Python 脚本）
  ipcMain.handle(IPC_CHANNELS.INSTALL_PLAYWRIGHT, async (event) => {
    const pythonPath = getPythonPath()
    try {
      // 使用便携版 Python 安装 playwright
      event.sender.send('script:output', '\n📦 正在安装 Playwright...\n')
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(pythonPath, ['-m', 'pip', 'install', 'playwright', '--quiet'], {
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        })
        proc.stderr?.on('data', (d: Buffer) => {
          event.sender.send('script:output', d.toString())
        })
        proc.on('close', (code: number) => {
          if (code === 0) resolve()
          else reject(new Error(`pip install 失败 (exit ${code})`))
        })
        proc.on('error', reject)
      })

      event.sender.send('script:output', '\n📦 正在安装 Chromium 浏览器...\n')
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(pythonPath, ['-m', 'playwright', 'install', 'chromium'], {
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        })
        proc.stdout?.on('data', (d: Buffer) => {
          event.sender.send('script:output', d.toString())
        })
        proc.stderr?.on('data', (d: Buffer) => {
          event.sender.send('script:output', d.toString())
        })
        proc.on('close', (code: number) => {
          if (code === 0) resolve()
          else reject(new Error(`chromium install 失败 (exit ${code})`))
        })
        proc.on('error', reject)
      })

      event.sender.send('script:output', '\n✅ Playwright + Chromium 安装完成！\n')
      return { ok: true }
    } catch (err: any) {
      event.sender.send('script:output', `\n❌ 安装失败: ${err.message}\n`)
      return { ok: false, error: err.message }
    }
  })

  // 检测 Playwright + Chromium 是否真正可用
  ipcMain.handle('app:check-playwright', async () => {
    const pythonPath = getPythonPath()
    try {
      // 检测 playwright 模块是否可导入 + Chromium 浏览器是否存在
      const checkScript = `
import sys
sys.path = [p for p in sys.path if p]
has_pw = False
has_chromium = False
try:
    import playwright
    has_pw = True
    from playwright.sync_api import sync_playwright
    p = sync_playwright().start()
    try:
        exe = p.chromium.executable_path
        import os
        has_chromium = os.path.exists(str(exe)) if exe else False
    finally:
        p.stop()
except Exception:
    pass
print(f"PLAYWRIGHT_OK={has_pw}")
print(f"CHROMIUM_OK={has_chromium}")
`
      const { execSync } = require('child_process')
      const { writeFileSync, unlinkSync } = require('fs')
      const { tmpdir } = require('os')
      const tmpFile = join(tmpdir(), `sc-playwright-check-${Date.now()}.py`)
      writeFileSync(tmpFile, checkScript, 'utf-8')
      try {
        const result = execSync(`"${pythonPath}" "${tmpFile}"`, {
          encoding: 'utf-8',
          timeout: 15000,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        })
        return {
          playwright: result.includes('PLAYWRIGHT_OK=True'),
          chromium: result.includes('CHROMIUM_OK=True'),
        }
      } finally {
        try { unlinkSync(tmpFile) } catch {}
      }
    } catch {
      return { playwright: false, chromium: false }
    }
  })

  // AI 多轮对话
  ipcMain.handle(IPC_CHANNELS.AI_CHAT, async (_event, messages: { role: string; content: string }[]) => {
    try {
      const response = await aiService.chat(
        messages.map(m => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
      )
      return response
    } catch (err: any) {
      return `错误: ${err.message || String(err)}`
    }
  })

  // AI 流式多轮对话
  ipcMain.handle(IPC_CHANNELS.AI_CHAT_STREAM, async (event, messages: { role: string; content: string }[]) => {
    try {
      const fullContent = await aiService.chatStream(
        messages.map(m => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
        (token) => {
          event.sender.send(IPC_CHANNELS.AI_CHAT_STREAM_TOKEN, token)
        },
      )
      return { ok: true, content: fullContent }
    } catch (err: any) {
      return { ok: false, error: err.message || String(err) }
    }
  })

  // ── 文件操作（AI Agent 工具）──
  // 解析路径：相对路径相对于项目根目录，绝对路径直接使用
  function resolvePath(inputPath: string): string {
    if (inputPath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(inputPath)) {
      return inputPath
    }
    return join(getAppRoot(), inputPath)
  }

  ipcMain.handle(IPC_CHANNELS.FILE_READ, async (_event, filePath: string) => {
    try {
      const fullPath = resolvePath(filePath)
      const content = readFileSync(fullPath, 'utf-8')
      return { ok: true, content }
    } catch (err: any) {
      return { ok: false, error: err.message || String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.FILE_WRITE, async (_event, filePath: string, content: string) => {
    try {
      const { writeFileSync, mkdirSync } = require('fs')
      const { dirname } = require('path')
      const fullPath = resolvePath(filePath)
      const dir = dirname(fullPath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(fullPath, content, 'utf-8')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err.message || String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.FILE_LIST, async (_event, dirPath: string) => {
    try {
      const fullPath = resolvePath(dirPath)
      if (!existsSync(fullPath)) return { ok: false, error: '目录不存在: ' + fullPath }
      const items = readdirSync(fullPath, { withFileTypes: true }).map(d => ({
        name: d.name,
        isDir: d.isDirectory(),
      }))
      return { ok: true, items }
    } catch (err: any) {
      return { ok: false, error: err.message || String(err) }
    }
  })

  // ── 浏览器操作（AI Agent 工具）──
  ipcMain.handle(IPC_CHANNELS.BROWSER_OPEN, async (_event, url: string) => {
    return browserOpen(url)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_READ, async () => {
    return browserRead()
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_CLICK, async (_event, target: { text?: string; selector?: string; nth?: number }) => {
    return browserClick(target)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_TYPE, async (_event, target: { text?: string; selector?: string; value: string }) => {
    return browserType(target)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_SCREENSHOT, async () => {
    return browserScreenshot()
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_CLOSE, async () => {
    await closeBrowser()
    return { ok: true }
  })

  // 解析脚本中的可配置变量
  ipcMain.handle(IPC_CHANNELS.PARSE_SCRIPT_VARS, async (_event, scriptPath: string, env?: string) => {
    console.log('[parseScriptVars] IPC called with env:', env, 'script:', scriptPath.split('/').pop())
    return parseScriptVars(scriptPath, env)
  })

  // API 调试：发送 HTTP 请求
  ipcMain.handle(IPC_CHANNELS.API_DEBUG, async (_event, req: { method: string; url: string; headers: Record<string,string>; body?: string; timeout?: number }) => {
    const start = Date.now()

    // 调试日志：打印收到的请求体信息
    if (req.body) {
      console.log(`[API_DEBUG] Body length: ${req.body.length} chars, first 200:`, req.body.slice(0, 200))
    } else {
      console.log('[API_DEBUG] No body')
    }

    try {
      // 自动检测 JSON body 并补全 Content-Type
      const requestHeaders = { ...req.headers }
      const hasContentType = Object.keys(requestHeaders).some(
        k => k.toLowerCase() === 'content-type'
      )
      if (!hasContentType && req.body && req.method !== 'GET') {
        // 尝试解析为 JSON，成功则自动加上 Content-Type
        try {
          JSON.parse(req.body)
          requestHeaders['Content-Type'] = 'application/json; charset=utf-8'
          console.log('[API_DEBUG] Auto-set Content-Type: application/json')
        } catch {
          // 不是 JSON，不添加 Content-Type
        }
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), req.timeout || 30000)
      const res = await fetch(req.url, {
        method: req.method,
        headers: requestHeaders,
        body: req.body && req.method !== 'GET' ? req.body : undefined,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      const resBody = await res.text()
      return {
        ok: true,
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(res.headers.entries()),
        body: resBody,
        duration: Date.now() - start,
      }
    } catch (err: any) {
      return { ok: false, error: err.message, duration: Date.now() - start }
    }
  })

  // API 并发性能测试
  ipcMain.handle(IPC_CHANNELS.API_DEBUG_BATCH, async (_event, req: ApiBatchRequest): Promise<ApiBatchResult> => {
    const { method, url, headers, body, concurrency, totalRequests, timeout = 30000 } = req
    const overallStart = Date.now()

    console.log(`[API_DEBUG_BATCH] method=${method}, url=${url}, concurrency=${concurrency}, total=${totalRequests}`)
    console.log(`[API_DEBUG_BATCH] body length: ${body?.length ?? 0}, first 200:`, body?.slice(0, 200) ?? '(none)')
    console.log(`[API_DEBUG_BATCH] headers:`, JSON.stringify(headers))

    // 准备请求头 - 自动补全 Content-Type
    const requestHeaders = { ...headers }
    const hasContentType = Object.keys(requestHeaders).some(k => k.toLowerCase() === 'content-type')
    if (!hasContentType && body && method !== 'GET') {
      try { JSON.parse(body); requestHeaders['Content-Type'] = 'application/json; charset=utf-8' } catch {}
    }
    console.log(`[API_DEBUG_BATCH] hasContentType=${hasContentType}, final Content-Type=${requestHeaders['Content-Type'] ?? '(none)'}`)

    const fetchOne = async (index: number): Promise<ApiBatchItem> => {
      const reqStart = Date.now()
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)
        const res = await fetch(url, {
          method,
          headers: requestHeaders,
          body: body && method !== 'GET' ? body : undefined,
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        const resBody = await res.text()
        // 截断过长响应体
        const truncatedBody = resBody.length > 500 ? resBody.slice(0, 500) + '…' : resBody
        return { index, status: res.status, duration: Date.now() - reqStart, body: truncatedBody }
      } catch (err: any) {
        return { index, duration: Date.now() - reqStart, error: err.message }
      }
    }

    const results: ApiBatchItem[] = []

    // 并发执行，每次最多 concurrency 个
    let cursor = 0
    const runNext = async (): Promise<void> => {
      while (cursor < totalRequests) {
        const idx = cursor++
        const item = await fetchOne(idx)
        results.push(item)
        // 如果 send 流支持，可以发进度事件，但这里一次性收集
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, totalRequests) }, () => runNext())
    await Promise.all(workers)

    const totalDuration = Date.now() - overallStart
    const durations = results.map(r => r.duration).sort((a, b) => a - b)
    const successResults = results.filter(r => !r.error)
    const failedResults = results.filter(r => r.error)
    const n = durations.length

    const avgDuration = n > 0 ? durations.reduce((s, d) => s + d, 0) / n : 0
    const minDuration = n > 0 ? durations[0] : 0
    const maxDuration = n > 0 ? durations[n - 1] : 0
    const p50Duration = n > 0 ? durations[Math.floor(n * 0.5)] : 0
    const p95Duration = n > 0 ? durations[Math.floor(n * 0.95)] : 0
    const p99Duration = n > 0 ? durations[Math.floor(n * 0.99)] : 0
    const qps = totalDuration > 0 ? Math.round((totalRequests / (totalDuration / 1000)) * 100) / 100 : 0

    // 状态码分布
    const statusDistribution: Record<number, number> = {}
    for (const r of successResults) {
      const st = r.status ?? 0
      statusDistribution[st] = (statusDistribution[st] || 0) + 1
    }

    return {
      method,
      url,
      headers: requestHeaders,
      body: body && method !== 'GET' ? body : undefined,
      total: totalRequests,
      success: successResults.length,
      failed: failedResults.length,
      totalDuration,
      minDuration,
      maxDuration,
      avgDuration: Math.round(avgDuration * 100) / 100,
      p50Duration,
      p95Duration,
      p99Duration,
      qps,
      statusDistribution,
      items: results.sort((a, b) => a.index - b.index),
    }
  })

  // ── 脚本目录扫描 ──
  ipcMain.handle(IPC_CHANNELS.SCAN_SCRIPTS, async () => {
    return scanScriptsDirectory()
  })

  ipcMain.handle(IPC_CHANNELS.GET_SCRIPTS_PATH, async () => {
    // 返回项目根目录，配合相对路径 scriptPath 可直接拼接
    return getAppRoot().replace(/\//g, sep).replace(/\\/g, sep)
  })

  // 打开脚本目录
  ipcMain.handle('app:open-scripts-folder', async () => {
    const scriptsDir = getScriptsDir()
    try {
      if (!existsSync(scriptsDir)) {
        mkdirSync(scriptsDir, { recursive: true })
      }
      const errMsg = await shell.openPath(scriptsDir)
      return { ok: !errMsg, path: scriptsDir, error: errMsg || undefined }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  // 获取脚本目录路径
  ipcMain.handle('app:get-scripts-path', async () => {
    return { path: getScriptsDir() }
  })

  // 打开数据目录
  ipcMain.handle('app:open-data-folder', async () => {
    const dataDir = join(app.getPath('userData'), '..', 'supply-chain-tester-data')
    try {
      const { mkdirSync } = require('fs')
      if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
      await shell.openPath(dataDir)
      return { ok: true, path: dataDir }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  // 用系统默认程序打开文件
  ipcMain.handle('shell:open-path', async (_event, filePath: string) => {
    const fullPath = join(getAppRoot(), filePath)
    try {
      // shell.openPath 比 shell.openExternal(file://) 在 Windows 上更可靠
      const errorMsg = await shell.openPath(fullPath)
      if (errorMsg) {
        // 如果 openPath 失败（如 Unicode 路径），回退到 file:// URL
        console.warn('[shell:open-path] openPath failed, trying file URL:', errorMsg)
        const fileUrl = pathToFileURL(fullPath).href
        await shell.openExternal(fileUrl)
      }
      return { ok: true }
    } catch (err: any) {
      console.error('[shell:open-path] Error:', err.message)
      return { ok: false, error: err.message }
    }
  })

  // 用默认浏览器打开链接
  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    try {
      await shell.openExternal(url)
    } catch (err: any) {
      console.error('[shell:open-external] Error:', err.message)
    }
  })

  // ── 运行环境检测 ──
  ipcMain.handle('app:check-environment', async () => {
    const result: Record<string, { ok: boolean; message: string }> = {}

    // Python
    const py = await checkPython()
    result['python'] = { ok: py.available, message: py.available ? (py.version || 'OK') : '未安装' }

    // Node.js Playwright Chromium
    result['pwChromium'] = {
      ok: existsSync(join(getPythonPortableDir(), '..', 'ms-playwright')),
      message: existsSync(join(getPythonPortableDir(), '..', 'ms-playwright')) ? 'OK' : '未安装'
    }

    // Python Playwright (for exported scripts)
    try {
      const { execSync } = require('child_process')
      execSync(`"${getPythonPath()}" -c "import playwright"`, { timeout: 5000, windowsHide: true })
      result['pyPlaywright'] = { ok: true, message: 'OK' }
    } catch {
      result['pyPlaywright'] = { ok: false, message: '未安装' }
    }

    // test-suites
    const scriptsDir = getScriptsDir()
    result['testSuites'] = {
      ok: existsSync(scriptsDir) && readdirSync(scriptsDir).length > 0,
      message: (existsSync(scriptsDir) && readdirSync(scriptsDir).length > 0) ? `${readdirSync(scriptsDir).length} 个目录` : '无脚本'
    }

    return result
  })

  // ── 自动更新 ──
  ipcMain.handle(IPC_CHANNELS.UPDATE_GET_STATE, () => getUpdateState())
  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, () => doCheckUpdates())
  ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, () => doDownloadUpdate())
  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, () => { quitAndInstall() })
  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL_LAN, () => { installLanUpdate() })

  // ── 可视化录制 ──

  ipcMain.handle(IPC_CHANNELS.RECORDER_START, async (event, startUrl: string, captureMode?: string) => {
    return startRecording(startUrl, (step) => {
      event.sender.send(IPC_CHANNELS.RECORDER_EVENT, step)
    }, false, captureMode || 'network')
  })

  ipcMain.handle(IPC_CHANNELS.APIRECORDER_START, async (event, startUrl: string, captureMode?: string) => {
    return startRecording(startUrl, (step) => {
      event.sender.send(IPC_CHANNELS.APIRECORDER_EVENT, step)
    }, true, captureMode || 'network')  // apiOnly = true
  })

  ipcMain.handle(IPC_CHANNELS.RECORDER_STOP, async () => {
    stopRecording()
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.APIRECORDER_STOP, async () => {
    stopRecording()
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.APIRECORDER_CLEAR, async () => {
    clearRecordingDedup()
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.APIRECORDER_SAVE_TRACE, async (event, content: string, defaultName: string) => {
    const { dialog } = require('electron')
    const { writeFileSync } = require('fs')
    const win = BrowserWindow.fromWebContents(event.sender)
    const isPy = defaultName.endsWith('.py')
    const title = isPy ? '保存 Python 脚本' : '导出 traceId 清单'
    const result = await dialog.showSaveDialog(win!, {
      title,
      defaultPath: defaultName,
      filters: [{ name: isPy ? 'Python 脚本' : 'JSON 文件', extensions: [isPy ? 'py' : 'json'] }],
    })
    if (result.canceled || !result.filePath) return { ok: false, error: '用户取消' }
    try {
      writeFileSync(result.filePath, content, 'utf-8')
      return { ok: true, savedPath: result.filePath }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.APIRECORDER_IMPORT_TRACE, async (event, filePath?: string) => {
    const { dialog } = require('electron')
    const { readFileSync, writeFileSync, unlinkSync } = require('fs')
    const { execFile } = require('child_process')
    const { join: pathJoin } = require('path')
    const os = require('os')
    const win = BrowserWindow.fromWebContents(event.sender)

    // 如果没传 filePath，打开文件对话框
    if (!filePath) {
      const result = await dialog.showOpenDialog(win!, {
        title: '导入 traceId 清单',
        filters: [{ name: 'JSON 文件', extensions: ['json'] }],
        properties: ['openFile'],
      })
      if (result.canceled || result.filePaths.length === 0) return { ok: false, error: '用户取消' }
      filePath = result.filePaths[0]
    }

    let jsonData: any
    try {
      jsonData = JSON.parse(readFileSync(filePath, 'utf-8'))
    } catch (err: any) {
      return { ok: false, error: `JSON 解析失败: ${err.message}` }
    }
    const traceIds: string[] = jsonData.traceIds || []
    const system = jsonData.system || ''
    if (traceIds.length === 0) return { ok: false, error: '未找到 traceId' }

    // 构建临时输入文件
    const tmpDir = os.tmpdir()
    const tmpIn = pathJoin(tmpDir, `trace_import_${Date.now()}.json`)
    const tmpOut = pathJoin(tmpDir, `trace_enriched_${Date.now()}.json`)
    const apis = traceIds.map((tid: string) => ({ traceId: tid }))
    writeFileSync(tmpIn, JSON.stringify({ system, apis }, null, 2), 'utf-8')

    // 调用 Python log_fetcher.py
    const scriptsDir = getScriptsDir()
    const pythonPath = getPythonPath()
    const fetcherScript = pathJoin(scriptsDir, 'utils', 'log_fetcher.py')
    if (!existsSync(fetcherScript)) {
      try { unlinkSync(tmpIn) } catch {}
      return { ok: false, error: `找不到 log_fetcher.py: ${fetcherScript}` }
    }

    try {
      const sender = event.sender
      let stderrLog = ''
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(pythonPath, [fetcherScript, tmpIn, '--output', tmpOut], {
          timeout: 120000,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        })
        
        // 监听 stderr 中的进度行
        if (proc.stderr) {
          let stderrBuf = ''
          proc.stderr.on('data', (chunk: Buffer) => {
            const text = chunk.toString()
            stderrBuf += text
            stderrLog += text
            const lines = stderrBuf.split('\n')
            stderrBuf = lines.pop() || ''
            for (const line of lines) {
              const m = line.match(/^PROGRESS:(\d+)\/(\d+)/)
              if (m) {
                sender.send(IPC_CHANNELS.APIRECORDER_EVENT, {
                  type: 'import_progress',
                  current: parseInt(m[1]),
                  total: parseInt(m[2]),
                })
              }
            }
          })
        }
        
        proc.on('error', (err: any) => { reject(err) })
        proc.on('close', (code: number | null) => {
          if (code !== 0 && !existsSync(tmpOut)) {
            const tail = stderrLog.trim().split('\n').slice(-5).join('\n') || '(无输出)'
            reject(new Error(`Python exit code: ${code}\n${tail}`))
            return
          }
          resolve()
        })
      })
    } catch (err: any) {
      try { unlinkSync(tmpIn) } catch {}
      return { ok: false, error: `Python 执行失败: ${err.message}` }
    }

    // 读取结果
    let enriched: any
    try {
      if (existsSync(tmpOut)) {
        enriched = JSON.parse(readFileSync(tmpOut, 'utf-8'))
      }
    } catch {}

    // 清理临时文件
    try { unlinkSync(tmpIn) } catch {}
    try { unlinkSync(tmpOut) } catch {}

    if (!enriched || !enriched.apis) return { ok: false, error: '日志查询无结果' }
    return { ok: true, data: enriched }
  })

  ipcMain.handle(IPC_CHANNELS.APIRECORDER_PICK_FILE, async (event) => {
    const { dialog } = require('electron')
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      title: '导入 traceId 清单',
      filters: [{ name: 'JSON 文件', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return { ok: false, error: '用户取消' }
    return { ok: true, filePath: result.filePaths[0] }
  })

  ipcMain.handle(IPC_CHANNELS.RECORDER_PLAY, async (_event, steps: any[]) => {
    const results: { ok: boolean; message: string; index: number }[] = []
    for (let i = 0; i < steps.length; i++) {
      const res = await replayStep(steps[i])
      results.push({ ...res, index: i })
      if (!res.ok) break
    }
    return { ok: results.every(r => r.ok), results }
  })

  ipcMain.handle(IPC_CHANNELS.RECORDER_SCREENSHOT, async () => {
    return browserScreenshot()
  })

  ipcMain.handle(IPC_CHANNELS.RECORDER_NAVIGATE, async (_event, url: string) => {
    return browserOpen(url)
  })

  // 录制会话持久化
  const sessionsDir = join(app.getPath('userData'), 'recorder-sessions')
  if (!existsSync(sessionsDir)) mkdirSync(sessionsDir, { recursive: true })

  ipcMain.handle(IPC_CHANNELS.RECORDER_SAVE_SESSION, async (_event, session: RecordSession) => {
    try {
      const { writeFileSync } = require('fs')
      const filePath = join(sessionsDir, `${session.id}.json`)
      writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.RECORDER_LOAD_SESSIONS, async () => {
    try {
      if (!existsSync(sessionsDir)) return []
      const files = readdirSync(sessionsDir).filter(f => f.endsWith('.json'))
      return files.map(f => {
        const content = readFileSync(join(sessionsDir, f), 'utf-8')
        return JSON.parse(content) as RecordSession
      }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    } catch {
      return []
    }
  })

  ipcMain.handle(IPC_CHANNELS.RECORDER_DELETE_SESSION, async (_event, id: string) => {
    try {
      const { unlinkSync } = require('fs')
      unlinkSync(join(sessionsDir, `${id}.json`))
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })
}

/** 检查脚本第一行是否以 # WIP 开头，表示未完成 */
function isWipScript(filePath: string): boolean {
  try {
    const firstLine = readFileSync(filePath, 'utf-8').split('\n')[0].trim()
    return firstLine.startsWith('# WIP')
  } catch {
    return false
  }
}

/** 扫描 scripts 目录，返回产品线 → 子产品 → 脚本的树形结构 */
function scanScriptsDirectory(): Record<string, { subProduct: string; scripts: { name: string; path: string }[] }[]> {
  const result: Record<string, { subProduct: string; scripts: { name: string; path: string }[] }[]> = {}
  const scriptsDir = getScriptsDir()

  if (!existsSync(scriptsDir)) {
    console.warn('[scanScripts] scripts directory not found, creating:', scriptsDir)
    try { mkdirSync(scriptsDir, { recursive: true }) } catch (e: any) { console.error('[scanScripts] Failed to create:', e.message) }
    return result
  }

  // 内置产品目录映射
  const PRODUCT_KEY_MAP: Record<string, string> = {
    'common': 'common',
    'config': 'config',
    'utils': 'utils',
  }

  try {
    // 使用 Buffer 读取目录，避免中文编码问题
    const products = readdirSync(scriptsDir, { encoding: 'buffer' })
    for (const productBuf of products) {
      const productPath = join(scriptsDir, productBuf.toString())
      if (!statSync(productPath).isDirectory()) continue

      const product = productBuf.toString()

      // 检查是否为内置目录（common / config / utils）
      if (PRODUCT_KEY_MAP[product]) {
        const key = PRODUCT_KEY_MAP[product]
        // common 目录：直接扫描 .py 文件
        const pyFiles = readdirSync(productPath, { encoding: 'buffer' })
          .map(b => b.toString())
          .filter(f => f.endsWith('.py'))

        if (pyFiles.length > 0) {
          const scripts = pyFiles.map(f => ({
            name: f.replace(/\.py$/, ''),
            path: ['test-suites', product, f].join(sep),
            wip: isWipScript(join(productPath, f)),
          }))
          if (!result[key]) result[key] = []
          result[key]!.push({ subProduct: product, scripts })
          console.log(`[scanScripts]   ${key}: ${pyFiles.length} scripts`)
        }
        continue
      }

      // 从目录名推断产品 key（支持编码差异，用 contains 而非 exact match）
      let key = ''
      if (product.includes('信') || product.includes('xin')) key = 'xinerong'
      else if (product.includes('订') || product.includes('ding')) key = 'dingerong'
      else if (product.includes('货') || product.includes('huo')) key = 'huoerong'
      else if (product.includes('账') || product.includes('zhang')) key = 'zhangerong'
      else if (product.includes('票') || product.includes('piao')) key = 'piaoerong'
      if (!key) {
        console.log('[scanScripts] Skipping unknown product dir:', product)
        continue
      }

      // 收集该产品下的所有子目录 + .py 脚本
      const subDirs = readdirSync(productPath, { encoding: 'buffer' })
      for (const subBuf of subDirs) {
        const subPath = join(productPath, subBuf.toString())
        if (!statSync(subPath).isDirectory()) continue

        const sub = subBuf.toString()
        const files = readdirSync(subPath, { encoding: 'buffer' })
          .map(b => b.toString())
          .filter(f => f.endsWith('.py'))

        if (files.length > 0) {
          const scripts = files.map(f => ({
            name: f.replace(/\.py$/, ''),
            path: ['test-suites', product, sub, f].join(sep),
            wip: isWipScript(join(subPath, f)),
          }))
          if (!result[key]) result[key] = []
          result[key]!.push({ subProduct: sub, scripts })
          console.log(`[scanScripts]   ${key}/${sub}: ${files.length} scripts`)
        }
      }
    }
  } catch (err) {
    console.error('[scanScripts] Error:', err)
  }

  console.log('[scanScripts] Scanned:', Object.keys(result).map(k => `${k}(${result[k]!.length})`).join(', '))
  return result
}

/** 解析 Python 脚本中可配置项区域的变量 */
function parseScriptVars(scriptPath: string, currentEnv?: string): { key: string; value: string; comment: string; options?: { label: string; value: string }[] | null }[] {
  try {
    const { dirname } = require('path')
    const fullPath = join(dirname(getScriptsDir()), scriptPath)
    if (!existsSync(fullPath)) {
      console.warn('[parseScriptVars] File not found:', fullPath)
      return []
    }
    const content = readFileSync(fullPath, 'utf-8')
    const lines = content.split('\n')

    // 用宽松匹配找标记行
    let startLine = -1
    let endLine = -1
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      if (l.includes('可配置项') && l.includes('统一在这里修改') && !l.includes('结束')) {
        startLine = i
      }
      if (l.includes('可配置项结束')) {
        endLine = i
        break
      }
    }
    if (startLine === -1 || endLine === -1) {
      console.warn('[parseScriptVars] Markers not found, start:', startLine, 'end:', endLine)
      return []
    }

    const vars: { key: string; value: string; comment: string; options?: { label: string; value: string }[] | null }[] = []

    let skipBranch = false       // 当前分支是否跳过
    let branchMatched = false    // 是否已有 if/elif 匹配
    let ifEnvIndent = -1         // if/elif/else 块的缩进级别

    for (let i = startLine + 1; i < endLine; i++) {
      const rawLine = lines[i]
      const line = rawLine.trim()
      const indent = rawLine.length - rawLine.trimStart().length
      if (line === '' || line.startsWith('#') || line.startsWith('===')) continue

      // 退出 if/elif/else 块（缩进回到同级或更浅）
      if (ifEnvIndent >= 0 && indent <= ifEnvIndent && line !== '' && !/^(elif|else)\b/.test(line)) {
        ifEnvIndent = -1
        skipBranch = false
        branchMatched = false
      }

      // 检测 if env == 'X': 分支
      const ifMatch = line.match(/^if\s+env\s*==\s*['"]([^'"]+)['"]/)
      if (ifMatch) {
        ifEnvIndent = indent
        if (currentEnv) {
          skipBranch = ifMatch[1] !== currentEnv
          if (!skipBranch) branchMatched = true
        }
        continue
      }
      // 检测 elif env == 'X': 分支
      const elifMatch = line.match(/^elif\s+env\s*==\s*['"]([^'"]+)['"]/)
      if (elifMatch) {
        if (currentEnv && !branchMatched) {
          skipBranch = elifMatch[1] !== currentEnv
          if (!skipBranch) branchMatched = true
        } else {
          skipBranch = true  // 已匹配过，后续 elif 跳过
        }
        continue
      }
      // 检测 else: 分支
      if (/^else\s*:/.test(line)) {
        if (currentEnv && !branchMatched) {
          skipBranch = false
          branchMatched = true
        } else if (currentEnv) {
          skipBranch = true
        }
        continue
      }

      // 跳过不匹配的 env 分支
      if (skipBranch && currentEnv) continue

      // 跳过其他控制流语句
      if (/^(for|while|try|except|finally|with|def|class|return|break|continue|pass|import|from)\b/.test(line)) continue

      // 解析注释（# 后面的内容），提取选项标记
      const commentIdx = line.indexOf('#')
      let comment = ''
      let code = line
      let options: { label: string; value: string }[] | null = null
      if (commentIdx !== -1) {
        const rawComment = line.substring(commentIdx + 1).trim()
        // 检测「选项:02=客户经理,01=客户自主」格式（允许前面有其他文字）
        const optMatch = rawComment.match(/选项:\s*(.+)$/)
        if (optMatch) {
          comment = ''
          const pairs = optMatch[1].split(',')
          options = []
          for (const p of pairs) {
            const eq = p.indexOf('=')
            if (eq !== -1) {
              options.push({ value: p.substring(0, eq).trim(), label: p.substring(eq + 1).trim() })
            }
          }
        } else {
          comment = rawComment
        }
        code = line.substring(0, commentIdx)
      }

      // 解析简单赋值: var = 'value' 或 var = "value"
      const eqIdx = code.indexOf('=')
      if (eqIdx === -1) continue

      const key = code.substring(0, eqIdx).trim()
      let value = code.substring(eqIdx + 1).trim()

      // 去掉开头结尾的引号
      if ((value.startsWith("'") && value.endsWith("'")) ||
          (value.startsWith('"') && value.endsWith('"'))) {
        value = value.slice(1, -1)
      }

      // 跳过 CONFIG 字典定义行
      if (key === 'CONFIG') {
        // 解析字典内的键值对
        for (let j = i + 1; j < endLine; j++) {
          const innerLine = lines[j].trim()
          if (innerLine.startsWith('}')) break
          const dictMatch = innerLine.match(/["'](.+?)["']\s*:\s*["'](.+?)["']/)
          if (dictMatch) {
            const innerCommentIdx = innerLine.indexOf('#')
            vars.push({
              key: dictMatch[1],
              value: dictMatch[2],
              comment: innerCommentIdx !== -1 ? innerLine.substring(innerCommentIdx + 1).trim() : '',
            })
          }
        }
        continue
      }

      if (key && key !== 'CONFIG') {
        vars.push({ key, value, comment, options })
      }
    }

    // 去重：同名变量只保留第一个（if/elif 分支中的重复定义）
    const seen = new Set<string>()
    const deduped = vars.filter(v => {
      if (seen.has(v.key)) return false
      seen.add(v.key)
      return true
    })

    console.log('[parseScriptVars] Found', deduped.length, 'vars:', deduped.map(v => `${v.key}=${v.value}`))
    return deduped
  } catch (err) {
    console.error('[parseScriptVars] Error:', err)
    return []
  }
}

app.whenReady().then(() => {
  const scriptsDir = getScriptsDir()

  // 确保脚本目录存在（Windows 上由 NSIS 安装程序创建，这里是 Mac 兜底）
  if (!existsSync(scriptsDir)) {
    try {
      mkdirSync(scriptsDir, { recursive: true })
      console.log('[init] Created scripts dir:', scriptsDir)
    } catch (e: any) {
      console.error('[init] Failed to create scripts dir:', e.message)
    }
  }

  console.log('[init] Scripts dir:', scriptsDir, 'exists:', existsSync(scriptsDir))

  buildMenu()
  loadAIConfig()
  testRunner.setAIService(aiService)
  registerIpcHandlers()
  createWindow()
  initAutoUpdater(mainWindow!)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeBrowser().catch(() => {})
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  closeBrowser().catch(() => {})
  stopLanServer()
})
