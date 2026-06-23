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
