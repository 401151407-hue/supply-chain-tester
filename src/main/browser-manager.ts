/**
 * 浏览器管理模块 - 基于 Playwright，供 AI Agent 操控浏览器
 * Chromium 浏览器已打包在 resources/ms-playwright/ 中
 */
import type { Browser, BrowserContext, Page } from 'playwright'
import { join } from 'path'
import { app } from 'electron'

let chromium: any = null
let browser: Browser | null = null
let context: BrowserContext | null = null
let page: Page | null = null
let playwrightAvailable = false

// 将打包的 Chromium 路径注入 Playwright 查找路径
function setupPlaywrightBrowsersPath() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return
  const base = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  process.env.PLAYWRIGHT_BROWSERS_PATH = join(base, 'ms-playwright')
}

// 异步加载 playwright（避免阻塞启动）
async function loadPlaywright(): Promise<boolean> {
  if (playwrightAvailable) return true
  try {
    setupPlaywrightBrowsersPath()
    const pw = await import('playwright')
    chromium = pw.chromium
    playwrightAvailable = true
    return true
  } catch {
    return false
  }
}

/** 获取或创建浏览器实例 */
async function getPage(): Promise<Page> {
  if (!(await loadPlaywright())) {
    throw new Error('Playwright 未安装，浏览器功能不可用')
  }
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN',
    })
    page = await context.newPage()
  }

  if (!page || page.isClosed()) {
    if (!context) {
      context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        locale: 'zh-CN',
      })
    }
    page = await context.newPage()
  }

  return page
}

/** 关闭浏览器 */
export async function closeBrowser(): Promise<void> {
  try {
    if (page && !page.isClosed()) await page.close().catch(() => {})
    if (context) await context.close().catch(() => {})
    if (browser && browser.isConnected()) await browser.close().catch(() => {})
  } finally {
    page = null
    context = null
    browser = null
  }
}

/** 打开/导航到 URL */
export async function browserOpen(url: string): Promise<{ ok: boolean; title: string; url: string }> {
  try {
    const p = await getPage()
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    return { ok: true, title: await p.title(), url: p.url() }
  } catch (err: any) {
    return { ok: false, title: '', url, error: err.message || String(err) }
  }
}

/** 读取页面可见文本 */
export async function browserRead(): Promise<{ ok: boolean; text: string; title: string; url: string }> {
  try {
    const p = await getPage()
    const text = await p.evaluate(() => document.body.innerText || '')
    return {
      ok: true,
      text: text.slice(0, 8000),
      title: await p.title(),
      url: p.url(),
    }
  } catch (err: any) {
    return { ok: false, text: '', title: '', url: '', error: err.message || String(err) }
  }
}

/** 点击元素（按文本或 CSS 选择器） */
export async function browserClick(
  target: { text?: string; selector?: string; nth?: number },
): Promise<{ ok: boolean; message: string }> {
  try {
    const p = await getPage()
    const n = target.nth ?? 0

    if (target.text) {
      // 按文本查找并点击
      const elements = p.locator(`text="${target.text}"`)
      const count = await elements.count()
      if (count === 0) {
        return { ok: false, message: `未找到包含文本 "${target.text}" 的元素` }
      }
      if (n >= count) {
        return { ok: false, message: `找到 ${count} 个匹配元素，索引 ${n} 超出范围` }
      }
      await elements.nth(n).click({ timeout: 10000 })
      return { ok: true, message: `已点击第 ${n + 1}/${count} 个匹配 "${target.text}" 的元素` }
    }

    if (target.selector) {
      await p.click(target.selector, { timeout: 10000 })
      return { ok: true, message: `已点击选择器 "${target.selector}"` }
    }

    return { ok: false, message: '请提供 text 或 selector 参数' }
  } catch (err: any) {
    return { ok: false, message: err.message || String(err) }
  }
}

/** 输入文本 */
export async function browserType(
  target: { text?: string; selector?: string; value: string },
): Promise<{ ok: boolean; message: string }> {
  try {
    const p = await getPage()

    let locator
    if (target.text) {
      // 查找包含该文本的 input/textarea 前一个 label，或直接找 placeholder
      locator = p.locator(`input[placeholder*="${target.text}"], textarea[placeholder*="${target.text}"]`)
      const cnt = await locator.count()
      if (cnt === 0) {
        // 尝试找 label 包含文本的 input
        const labelEl = p.locator(`text="${target.text}"`).first()
        const forAttr = await labelEl.getAttribute('for').catch(() => null)
        if (forAttr) {
          locator = p.locator(`#${forAttr}`)
        } else {
          // 找 label 的同级 input
          locator = labelEl.locator('..').locator('input, textarea').first()
        }
      }
    } else if (target.selector) {
      locator = p.locator(target.selector)
    } else {
      // 默认聚焦到当前活跃元素
      locator = p.locator(':focus')
    }

    await locator.fill(target.value, { timeout: 10000 })
    return { ok: true, message: `已输入 "${target.value}"` }
  } catch (err: any) {
    return { ok: false, message: err.message || String(err) }
  }
}

/** 截图（返回 base64） */
export async function browserScreenshot(): Promise<{ ok: boolean; dataUrl: string; error?: string }> {
  try {
    const p = await getPage()
    const buffer = await p.screenshot({ type: 'png', fullPage: false })
    const base64 = buffer.toString('base64')
    return { ok: true, dataUrl: `data:image/png;base64,${base64}` }
  } catch (err: any) {
    return { ok: false, dataUrl: '', error: err.message || String(err) }
  }
}

/** 获取当前页面 URL 和标题 */
export async function browserInfo(): Promise<{ url: string; title: string }> {
  try {
    const p = await getPage()
    return { url: p.url(), title: await p.title() }
  } catch {
    return { url: '', title: '' }
  }
}

/** 检测请求/响应体是否为加密数据（应跳过捕获） */
function isEncryptedPayload(body: string): boolean {
  if (!body || body.length < 20) return false
  try {
    const parsed = JSON.parse(body)
    // 模式: {"xn": "hex|hex"} — 仅有一个 xn 字段且值为长 hex 字符串
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const keys = Object.keys(parsed)
      if (keys.length === 1 && keys[0] === 'xn') {
        const val = parsed.xn
        if (typeof val === 'string' && val.length > 64 && /^[0-9a-fA-F|]+$/.test(val)) {
          return true
        }
      }
    }
  } catch {}
  // 纯 hex 字符串（加密响应体常见）
  if (/^[0-9a-fA-F]{64,}$/.test(body.trim())) {
    return true
  }
  return false
}

// ============================================================
// 可视化录制引擎
// ============================================================

type RecordEventCallback = (step: {
  type: string
  selector?: string
  selectorLabel?: string
  value?: string
  url?: string
  description: string
  // API 捕获字段
  apiMethod?: string
  apiUrl?: string
  apiHeaders?: Record<string, string>
  apiBody?: string
  apiStatus?: number
  apiResponse?: string
  traceId?: string
}) => void

let recordCallback: RecordEventCallback | null = null
let isRecording = false
let capturedApiUrls = new Set<string>()  // 去重（网络请求）
let capturedConsoleKeys = new Set<string>()  // 去重（Console 消息）

/** 生成元素的可读描述标签 */
function buildSelectorLabel(el: any): string {
  const tag = (el.tagName || '').toLowerCase()
  const text = (el.innerText || '').trim().slice(0, 40)
  const placeholder = el.placeholder || ''
  const ariaLabel = el.getAttribute?.('aria-label') || ''
  const title = el.title || ''
  const label = placeholder || ariaLabel || title || text || tag
  return label.length > 30 ? label.slice(0, 30) + '…' : label
}

/** 生成最佳 CSS 选择器 */
function buildSelector(el: any): string {
  if (el.id) return `#${el.id}`
  if (el.getAttribute?.('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`
  if (el.name) return `[name="${el.name}"]`

  const tag = (el.tagName || '').toLowerCase()
  const cls = (el.className || '').toString().trim()
  if (cls) {
    const classes = cls.split(/\s+/).filter((c: string) => c && !c.includes(':')).slice(0, 2).join('.')
    if (classes) return `${tag}.${classes}`
  }

  // 尝试 nth-child 回退
  const parent = el.parentElement
  if (parent) {
    const siblings = Array.from(parent.children).filter((c: any) => c.tagName === el.tagName)
    if (siblings.length > 1) {
      const idx = siblings.indexOf(el) + 1
      return `${tag}:nth-of-type(${idx})`
    }
  }
  return tag
}

/** 注入录制脚本到页面 */
async function injectRecordingScript(): Promise<void> {
  const p = await getPage()

  await p.evaluate(() => {
    if ((window as any).__supplyChainRecorder) return
    ;(window as any).__supplyChainRecorder = true

    let lastClickTime = 0

    function sendEvent(data: any) {
      ;(window as any).__recordEvent?.(data)
    }

    document.addEventListener('click', (e) => {
      const now = Date.now()
      const el = e.target as HTMLElement
      if (!el || el === document.body || el === document.documentElement) return
      // 去重：200ms 内同一元素只记录一次
      const selector = (window as any).__buildSelector?.(el)
      if (now - lastClickTime < 200 && (window as any).__lastSelector === selector) return
      lastClickTime = now
      ;(window as any).__lastSelector = selector
      sendEvent({
        type: 'click',
        selector,
        selectorLabel: (window as any).__buildSelectorLabel?.(el),
        description: `点击 ${(window as any).__buildSelectorLabel?.(el)}`,
      })
    }, true)

    document.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement
      if (!el || !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return
      const tag = el.tagName.toLowerCase()
      const type = tag === 'select' ? 'select' : 'type'
      sendEvent({
        type,
        selector: (window as any).__buildSelector?.(el),
        selectorLabel: (window as any).__buildSelectorLabel?.(el),
        value: tag === 'select' ? (el as HTMLSelectElement).value : el.value,
        description: tag === 'select'
          ? `选择 ${(el as HTMLSelectElement).value}`
          : `输入 ${el.value}`,
      })
    }, true)
  })

  // 注入辅助函数
  await p.evaluate(() => {
    ;(window as any).__buildSelectorLabel = (el: any) => {
      const tag = (el.tagName || '').toLowerCase()
      const text = (el.innerText || '').trim().slice(0, 40)
      const placeholder = el.placeholder || ''
      const ariaLabel = el.getAttribute?.('aria-label') || ''
      const title = el.title || ''
      const label = placeholder || ariaLabel || title || text || tag
      return label.length > 30 ? label.slice(0, 30) + '…' : label
    }
    ;(window as any).__buildSelector = (el: any) => {
      if (el.id) return `#${el.id}`
      if (el.getAttribute?.('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`
      if (el.name) return `[name="${el.name}"]`
      const tag = (el.tagName || '').toLowerCase()
      const cls = (el.className || '').toString().trim()
      if (cls) {
        const classes = cls.split(/\s+/).filter((c: string) => c && !c.includes(':')).slice(0, 2).join('.')
        if (classes) return `${tag}.${classes}`
      }
      return tag
    }
  })

  // 暴露回调函数
  await p.exposeFunction('__recordEvent', (data: any) => {
    if (recordCallback && isRecording) {
      recordCallback(data)
    }
  })
}

/**
 * 尝试从 Console 消息中提取 API 调用数据
 * 支持常见模式：
 *   1. JSON 对象含 url/method/status/response 等字段（JSBridge 风格）
 *   2. JSON 对象含 code/data/msg（业务响应风格）
 *   3. JSON 字符串包裹的 API 数据
 */
function tryToExtractApiFromConsole(text: string, onStep: RecordEventCallback): void {
  // 尝试多种 JSON 提取方式
  const candidates: any[] = []

  // 方式1: 直接解析整条消息为 JSON
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      candidates.push(parsed)
    }
  } catch {}

  // 方式2: 提取消息中嵌入的 JSON 对象 {...}
  const jsonBlockRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g
  let match: RegExpExecArray | null
  while ((match = jsonBlockRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[0])
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        candidates.push(parsed)
      }
    } catch {}
  }

  for (const data of candidates) {
    // 检测是否是 API 相关数据
    const apiInfo = detectApiPattern(data)
    if (!apiInfo) continue

    const dedupKey = `${apiInfo.method || '?'}:${apiInfo.url || apiInfo.apiPath || ''}:${text.length}`
    if (capturedConsoleKeys.has(dedupKey)) continue
    capturedConsoleKeys.add(dedupKey)

    const description = apiInfo.url
      ? `${apiInfo.method || 'CALL'} ${apiInfo.url.replace(/^https?:\/\/[^\/]+/, '')}`
      : `${apiInfo.method || 'CALL'} [Console] ${apiInfo.apiPath || text.slice(0, 40)}`

    console.log('[recorder:console] TRACE:', description)

    onStep({
      type: 'api',
      description,
      apiMethod: apiInfo.method || 'UNKNOWN',
      apiUrl: apiInfo.url || apiInfo.apiPath || '',
      traceId: apiInfo.traceId || undefined,
    })
  }
}

/**
 * 检测 JSON 对象是否包含 API 调用特征
 * 返回提取到的 API 信息，或 null（不是 API 数据）
 */
function detectApiPattern(data: any): {
  method?: string
  url?: string
  apiPath?: string
  headers?: Record<string, string>
  requestBody?: string
  status?: number
  code?: number
  body?: any
  response?: any
  traceId?: string
} | null {
  if (!data || typeof data !== 'object') return null
  const keys = Object.keys(data)

  // 模式-A: 完整请求日志格式（H5 供应链接口日志）
  // {requestUri, requestHeaders, requestBody, responseBody: {respCode, respMsg, traceId}, ...}
  if (data.requestUri && (data.requestBody !== undefined || data.responseBody !== undefined)) {
    const resBody = data.responseBody || {}
    const rawStatus = resBody['respCode'] ?? data['respCode'] ?? data['code']
    let httpStatus = 0
    if (rawStatus !== undefined && rawStatus !== null) {
      const s = String(rawStatus)
      if (s === '10000' || s === '0' || s === '00000') httpStatus = 200
      else httpStatus = parseInt(s) || 0
    }

    // 提取请求头（token 等）
    const reqHeaders: Record<string, string> = {}
    if (data.requestHeaders && typeof data.requestHeaders === 'object') {
      for (const [k, v] of Object.entries(data.requestHeaders)) {
        if (k.toLowerCase() !== 'cookie' && k.toLowerCase() !== 'host') {
          reqHeaders[k] = String(v || '')
        }
      }
    }

    let reqBody = ''
    try {
      const body = data.requestBody
      reqBody = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : ''
      if (reqBody.length > 5000) reqBody = reqBody.slice(0, 5000) + '…(截断)'
    } catch {}

    return {
      method: data.method || 'POST',
      url: data.requestUri,
      headers: reqHeaders,
      requestBody: reqBody,
      status: httpStatus,
      code: rawStatus,
      body: data.responseBody || data,
      response: data.responseBody || data,
      traceId: resBody['traceId'] || data['traceId'] || undefined,
    }
  }

  // 模式0: 中文 key 格式（JSBridge 常见）
  // {响应: {…}, 请求: {…}, url: '/api/xxx', respCode: '10000', traceId: '...'}
  const hasChineseKeys = keys.some(k => k === '响应' || k === '请求' || k === 'respCode' || k === 'respMsg')
  if (hasChineseKeys && data.url) {
    const reqData = data['请求'] || data['请求参数'] || data['request']
    const resData = data['响应'] || data['返回'] || data['response']
    const method = data['method'] || data['请求方式'] || (reqData ? 'POST' : 'GET')
    const rawStatus = data['respCode'] ?? data['code'] ?? data['status']
    const statusMsg = data['respMsg'] || data['msg'] || data['message'] || ''

    // 标准化 respCode -> HTTP 状态码: '10000'/'0'=成功(200), 其他=业务错误(仍记录原值)
    let httpStatus = 0
    if (rawStatus !== undefined && rawStatus !== null) {
      const s = String(rawStatus)
      if (s === '10000' || s === '0' || s === '00000') httpStatus = 200
      else httpStatus = parseInt(s) || 0
    }

    let reqBody = ''
    try {
      reqBody = reqData ? (typeof reqData === 'string' ? reqData : JSON.stringify(reqData)) : ''
      if (reqBody.length > 5000) reqBody = reqBody.slice(0, 5000) + '…(截断)'
    } catch {}

    // 提取请求头（token 等）—— 兼容完整日志中附带的 requestHeaders
    const reqHeaders: Record<string, string> = {}
    const hdrSource = data['requestHeaders'] || data['headers'] || data['header']
    if (hdrSource && typeof hdrSource === 'object') {
      for (const [k, v] of Object.entries(hdrSource)) {
        if (k.toLowerCase() !== 'cookie' && k.toLowerCase() !== 'host') {
          reqHeaders[k] = String(v || '')
        }
      }
    }

    return {
      method,
      url: data.url,
      headers: Object.keys(reqHeaders).length > 0 ? reqHeaders : undefined,
      requestBody: reqBody,
      status: httpStatus,
      code: rawStatus,
      body: resData || data,
      response: resData || data,
      traceId: data['traceId'] || data['traceid'] || data['trace_id'] || undefined,
    }
  }

  // 模式1: 标准 API 调用日志 {url, method, status, response/body/data}
  if (data.url && (data.method || data.status !== undefined || data.response !== undefined || data.data !== undefined)) {
    return {
      method: data.method || (data.request?.method),
      url: data.url,
      headers: data.headers || data.requestHeaders,
      requestBody: typeof data.requestBody === 'string' ? data.requestBody : JSON.stringify(data.requestBody || data.params || data.request || ''),
      status: data.status ?? data.statusCode ?? data.httpStatus,
      body: data.response || data.data || data.body || data.result,
    }
  }

  // 模式2: 业务响应格式 {code, data, msg}（常见于国内接口）
  if ((data.code !== undefined || data.errcode !== undefined) && (data.data !== undefined || data.result !== undefined || data.msg !== undefined || data.message !== undefined)) {
    const code = data.code ?? data.errcode ?? data.status
    return {
      method: 'RESPONSE',
      apiPath: data.api || data.path || data.url || `code=${code}`,
      status: typeof code === 'number' ? code : 0,
      body: data.data || data.result || data,
      response: data,
    }
  }

  // 模式3: 含 request + response 结构（axios/fetch 拦截器日志）
  if (data.request && (data.response || data.data)) {
    const req = data.request
    const res = data.response || data
    return {
      method: req.method || data.method,
      url: req.url || data.url,
      headers: req.headers,
      requestBody: typeof req.body === 'string' ? req.body : JSON.stringify(req.body || req.data || ''),
      status: res.status ?? res.statusCode ?? data.status ?? data.code,
      body: res.data || res.body || data.data || data.response,
    }
  }

  // 模式4: 含 path/api/endpoint + data/response
  const apiPath = data.path || data.api || data.endpoint || data.url
  const responseData = data.data || data.response || data.result || data.body
  if (apiPath && responseData) {
    return {
      method: data.method || data.type,
      apiPath,
      status: data.status ?? data.code,
      body: responseData,
    }
  }

  // 模式5: 仅含 status + body/data（响应片段）
  if ((data.status !== undefined || data.code !== undefined) && keys.length <= 5 && (data.body || data.data || data.result || data.message)) {
    return {
      method: data.method,
      status: data.status ?? data.code,
      body: data.body || data.data || data.result || data,
    }
  }

  // 模式6: 兜底 — Console 模式下，任何含 url/api/path/code/status 字段的对象都捕获
  const hasUrl = data.url || data.api || data.path || data.requestUrl
  const hasData = data.data || data.body || data.response || data.result || data.msg
  if (hasUrl || (hasData && keys.length <= 10)) {
    return {
      method: data.method || data.type || 'LOG',
      url: hasUrl || '',
      apiPath: hasUrl || '',
      status: data.status ?? data.code ?? data.respCode,
      body: data.data || data.body || data.response || data.result || data,
      response: data,
    }
  }

  return null
}

/** 开始录制：启动浏览器，注入 UI 监听 + 网络拦截 */
export async function startRecording(
  startUrl: string,
  onStep: RecordEventCallback,
  apiOnly = false,
  captureMode: 'network' | 'console' = 'network',
): Promise<{ ok: boolean; error?: string }> {
  try {
    const p = await getPage()
    isRecording = true
    recordCallback = onStep
    capturedApiUrls = new Set()
    capturedConsoleKeys = new Set()

    console.log('[recorder] startRecording mode:', captureMode, 'apiOnly:', apiOnly)

    // 网络请求拦截 - 仅在 network 模式下捕获
    if (captureMode === 'network') {
    p.on('response', async (response) => {
      if (!isRecording) return
      const req = response.request()
      const resType = req.resourceType()
      if (resType !== 'xhr' && resType !== 'fetch') return

      const url = response.url()
      const dedupKey = `${req.method()}:${url}`
      // 每个 XHR/fetch 都记录，方便排查
      console.log('[recorder:net] EVENT', dedupKey, 'isRecording:', isRecording)
      if (capturedApiUrls.has(dedupKey)) {
        console.log('[recorder:net] SKIP dedup:', dedupKey)
        return
      }
      capturedApiUrls.add(dedupKey)

      try {
        // 提取 traceId、响应状态、响应体
        let traceId = ''
        let resBody = ''
        const resHeaders = response.headers()
        const httpStatus = response.status()
        traceId = resHeaders['x-trace-id'] || resHeaders['traceid'] || resHeaders['x-request-id'] || ''

        try {
          const body = await response.text()
          if (body && !isEncryptedPayload(body) && body.length < 100000) {
            resBody = body
            if (!traceId) {
              try {
                const parsed = JSON.parse(body)
                traceId = parsed['traceId'] || parsed['traceid'] || parsed['trace_id'] || ''
              } catch {}
            }
          }
        } catch {}

        // 提取请求头、请求体
        const reqHeaders: Record<string, string> = {}
        const rawHeaders = req.headers()
        for (const [k, v] of Object.entries(rawHeaders)) {
          if (k.toLowerCase() !== 'cookie' && k.toLowerCase() !== 'host') {
            reqHeaders[k] = String(v || '')
          }
        }
        let reqBody = ''
        try {
          const postData = req.postDataBuffer()
          if (postData) {
            reqBody = Buffer.from(postData).toString('utf-8')
            if (reqBody.length > 50000) reqBody = reqBody.slice(0, 50000) + '…(截断)'
          }
        } catch {}

        console.log('[recorder:net] TRACE:', dedupKey, traceId ? traceId.slice(0, 16) : 'no-traceId')

        onStep({
          type: 'api',
          description: `${req.method()} ${url.replace(/^https?:\/\/[^\/]+/, '')}`,
          apiMethod: req.method(),
          apiUrl: url,
          apiHeaders: Object.keys(reqHeaders).length > 0 ? reqHeaders : undefined,
          apiBody: reqBody || undefined,
          apiStatus: httpStatus,
          apiResponse: resBody || undefined,
          traceId: traceId || undefined,
        })
      } catch {}
    })
    } // end captureMode === 'network'

    // Console 消息拦截 - 仅在 console 模式下捕获
    if (captureMode === 'console') {
    p.on('console', async (msg) => {
      if (!isRecording) return

      // 优先从 args 中提取 JS 对象（最完整），失败则回退到 text
      let captured = false
      try {
        const args = msg.args()
        for (const arg of args) {
          try {
            const jsonValue = await arg.jsonValue()
            if (jsonValue && typeof jsonValue === 'object' && !Array.isArray(jsonValue)) {
              const beforeCount = capturedConsoleKeys.size
              tryToExtractApiFromConsole(JSON.stringify(jsonValue), onStep)
              if (capturedConsoleKeys.size > beforeCount) captured = true
            }
          } catch {}
        }
      } catch {}

      // 回退：从 text 提取
      if (!captured) {
        const text = msg.text().trim()
        if (text && text.length >= 10) {
          tryToExtractApiFromConsole(text, onStep)
        }
      }
    })
    } // end captureMode === 'console'

    // 监控页面导航（排查是否跳到了新页面/新窗口导致监听丢失）
    p.on('framenavigated', (frame) => {
      if (frame === p.mainFrame()) {
        console.log('[recorder:nav] MAIN frame navigated to:', frame.url())
      }
    })
    if (context) {
      context.on('page', (newPage) => {
        console.log('[recorder:nav] NEW PAGE opened:', newPage.url())
        // 根据 captureMode 给新页面加上对应监听
        if (captureMode === 'console') {
        newPage.on('console', async (msg) => {
          if (!isRecording) return

          // 优先 args，失败回退 text
          let captured = false
          try {
            const args = msg.args()
            for (const arg of args) {
              try {
                const jsonValue = await arg.jsonValue()
                if (jsonValue && typeof jsonValue === 'object' && !Array.isArray(jsonValue)) {
                  const beforeCount = capturedConsoleKeys.size
                  tryToExtractApiFromConsole(JSON.stringify(jsonValue), onStep)
                  if (capturedConsoleKeys.size > beforeCount) captured = true
                }
              } catch {}
            }
          } catch {}
          if (!captured) {
            const text = msg.text().trim()
            if (text && text.length >= 10) {
              tryToExtractApiFromConsole(text, onStep)
            }
          }
        })
        }
        if (captureMode === 'network') {
        newPage.on('response', async (response) => {
          if (!isRecording) return
          const req = response.request()
          if (req.resourceType() !== 'xhr' && req.resourceType() !== 'fetch') return
          try {
            let traceId = ''
            let resBody = ''
            const resHeaders = response.headers()
            const httpStatus = response.status()
            traceId = resHeaders['x-trace-id'] || resHeaders['traceid'] || ''
            try {
              const body = await response.text()
              if (body && !isEncryptedPayload(body) && body.length < 100000) {
                resBody = body
                if (!traceId) {
                  try {
                    const parsed = JSON.parse(body)
                    traceId = parsed['traceId'] || parsed['traceid'] || ''
                  } catch {}
                }
              }
            } catch {}
            const reqHeaders: Record<string, string> = {}
            const rawHeaders = req.headers()
            for (const [k, v] of Object.entries(rawHeaders)) {
              if (k.toLowerCase() !== 'cookie' && k.toLowerCase() !== 'host') {
                reqHeaders[k] = String(v || '')
              }
            }
            let reqBody = ''
            try {
              const postData = req.postDataBuffer()
              if (postData) {
                reqBody = Buffer.from(postData).toString('utf-8')
                if (reqBody.length > 50000) reqBody = reqBody.slice(0, 50000) + '…(截断)'
              }
            } catch {}
            onStep({
              type: 'api', description: req.method() + ' ' + response.url().replace(/^https?:\/\/[^\/]+/, ''),
              apiMethod: req.method(), apiUrl: response.url(),
              apiHeaders: Object.keys(reqHeaders).length > 0 ? reqHeaders : undefined,
              apiBody: reqBody || undefined,
              apiStatus: httpStatus,
              apiResponse: resBody || undefined,
              traceId: traceId || undefined,
            })
          } catch {}
        })
        }
      })
    }
    console.log('[recorder:nav] Current page URL:', p.url())

    // 监听页面关闭 → 自动停止录制
    p.on('close', () => {
      console.log('[recorder] Browser page closed, auto-stopping recording')
      isRecording = false
      if (recordCallback) {
        recordCallback({ type: 'recording_stopped', description: '浏览器已关闭' })
        recordCallback = null
      }
    })

    // 如果不在目标URL，先导航
    if (!p.url().startsWith(startUrl) && startUrl) {
      await p.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    }

    // API-only 模式：只注入网络拦截，不注入 UI 事件监听
    if (!apiOnly) {
      await injectRecordingScript()
    }

    // 录制初始导航步骤
    if (startUrl) {
      onStep({
        type: 'navigate',
        url: startUrl,
        description: `打开 ${startUrl}`,
      })
    }

    return { ok: true }
  } catch (err: any) {
    isRecording = false
    recordCallback = null
    return { ok: false, error: err.message || String(err) }
  }
}

/** 停止录制 */
export function stopRecording(): void {
  isRecording = false
  recordCallback = null
  capturedConsoleKeys = new Set()
  // 关闭浏览器
  closeBrowser().catch(() => {})
}

/** 清空去重集合（不清空录制状态，允许已捕获过的 URL 再次被捕获） */
export function clearRecordingDedup(): void {
  console.log('[recorder] clearRecordingDedup called, isRecording=', isRecording)
  capturedApiUrls = new Set()
  capturedConsoleKeys = new Set()
}

/** 是否正在录制 */
export function getIsRecording(): boolean {
  return isRecording
}

/** 回放单个步骤 */
export async function replayStep(step: {
  type: string
  selector?: string
  value?: string
  url?: string
}): Promise<{ ok: boolean; message: string }> {
  const p = await getPage()

  switch (step.type) {
    case 'navigate':
      if (step.url) {
        await p.goto(step.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        return { ok: true, message: `已导航至 ${step.url}` }
      }
      return { ok: false, message: '缺少 URL' }

    case 'click':
      if (step.selector) {
        await p.click(step.selector, { timeout: 10000 })
        return { ok: true, message: `已点击 ${step.selector}` }
      }
      return { ok: false, message: '缺少选择器' }

    case 'type':
      if (step.selector && step.value !== undefined) {
        await p.fill(step.selector, step.value, { timeout: 10000 })
        return { ok: true, message: `已在 ${step.selector} 输入 "${step.value}"` }
      }
      return { ok: false, message: '缺少选择器或值' }

    case 'select':
      if (step.selector && step.value !== undefined) {
        await p.selectOption(step.selector, step.value, { timeout: 10000 })
        return { ok: true, message: `已选择 ${step.value}` }
      }
      return { ok: false, message: '缺少选择器或值' }

    case 'wait':
      await p.waitForTimeout(1000)
      return { ok: true, message: '等待 1s' }

    case 'scroll':
      if (step.selector) {
        await p.locator(step.selector).scrollIntoViewIfNeeded({ timeout: 5000 })
        return { ok: true, message: `已滚动至 ${step.selector}` }
      }
      return { ok: false, message: '缺少选择器' }

    case 'hover':
      if (step.selector) {
        await p.hover(step.selector, { timeout: 5000 })
        return { ok: true, message: `已悬停 ${step.selector}` }
      }
      return { ok: false, message: '缺少选择器' }

    default:
      return { ok: false, message: `未知步骤类型: ${step.type}` }
  }
}
