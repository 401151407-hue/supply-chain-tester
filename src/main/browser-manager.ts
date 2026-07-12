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
}) => void

let recordCallback: RecordEventCallback | null = null
let isRecording = false
let capturedApiUrls = new Set<string>()  // 去重

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

/** 开始录制：启动浏览器，注入 UI 监听 + 网络拦截 */
export async function startRecording(
  startUrl: string,
  onStep: RecordEventCallback,
  apiOnly = false,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const p = await getPage()
    isRecording = true
    recordCallback = onStep
    capturedApiUrls = new Set()

    // 网络请求拦截 - 捕获 XHR/Fetch API 调用（UI 和 API 模式都开启）
    p.on('response', async (response) => {
      if (!isRecording) return
      const req = response.request()
      const resType = req.resourceType()
      if (resType !== 'xhr' && resType !== 'fetch') return

      const url = response.url()
      const dedupKey = `${req.method()}:${url}`
      if (capturedApiUrls.has(dedupKey)) return
      capturedApiUrls.add(dedupKey)

      try {
        const reqHeaders = req.headers()
        delete reqHeaders['cookie']
        delete reqHeaders['authorization']

        let reqBody = req.postData() || ''
        if (reqBody.length > 2000) reqBody = reqBody.slice(0, 2000) + '…(截断)'

        let resBody = ''
        try {
          const body = await response.text()
          resBody = body.length > 2000 ? body.slice(0, 2000) + '…(截断)' : body
        } catch {}

        const shortUrl = url.replace(/^https?:\/\/[^\/]+/, '')
        onStep({
          type: 'api',
          description: `${req.method()} ${shortUrl}`,
          apiMethod: req.method(),
          apiUrl: url,
          apiHeaders: reqHeaders as Record<string, string>,
          apiBody: reqBody,
          apiStatus: response.status(),
          apiResponse: resBody,
        })
      } catch {}
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
