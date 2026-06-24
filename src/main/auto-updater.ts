/**
 * 自动更新模块
 * 双路更新：GitHub Releases（主） + 局域网 P2P（备）
 * GitHub 不可用时自动切换局域网检测，同一网络下有人更新了就能同步
 */
import electronUpdater from 'electron-updater'
const { autoUpdater } = electronUpdater
import type { UpdateCheckResult } from 'electron-updater'
import { BrowserWindow, app } from 'electron'
import { checkLanForUpdates, startLanServer, stopLanServer } from './lan-updater'
import { createWriteStream, unlinkSync, existsSync, renameSync } from 'fs'
import { join } from 'path'

// 更新状态枚举
export type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

let updateStatus: UpdateStatus = 'idle'
let updateInfo: { version?: string; releaseDate?: string; releaseNotes?: string } | null = null
let downloadProgress = 0
let lanDownloadUrl: string | null = null // 局域网下载地址

/** 获取当前更新状态 */
export function getUpdateState() {
  return {
    status: updateStatus,
    info: updateInfo,
    progress: downloadProgress,
    currentVersion: autoUpdater.currentVersion.version,
  }
}

/** 初始化自动更新器 */
export function initAutoUpdater(mainWindow: BrowserWindow) {
  // 公开仓库不需要 GH_TOKEN，但保留兼容私有仓库的 token 注入
  // @ts-ignore __EMBEDDED_GH_TOKEN__ 由构建时 electron.vite.config.ts 的 define 注入
  const embeddedToken: string = typeof __EMBEDDED_GH_TOKEN__ !== 'undefined' ? __EMBEDDED_GH_TOKEN__ : ''
  if (!process.env.GH_TOKEN && embeddedToken && embeddedToken !== '') {
    process.env.GH_TOKEN = embeddedToken
  }

  // 启动局域网更新服务器（让同网络其他人能发现本机版本）
  startLanServer()

  // 设置更新源（由 electron-builder 的 latest.yml 提供）
  // 开发环境不检查更新，局域网更新始终可用
  if (process.env.NODE_ENV === 'development' || !autoUpdater.isUpdaterActive()) {
    console.log('[AutoUpdater] Updater inactive (dev mode or config), LAN still active')
    return
  }

  // 检查更新出错（不通知 UI，因为还有回退逻辑）
  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err.message)
    // 只在最终失败时才设 error，这里不通知
  })

  // 正在检查更新
  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for update...')
    updateStatus = 'checking'
    notifyRenderer(mainWindow)
  })

  // 发现新版本
  autoUpdater.on('update-available', (info: UpdateCheckResult) => {
    console.log('[AutoUpdater] Update available:', info.updateInfo.version)
    updateStatus = 'available'
    updateInfo = {
      version: info.updateInfo.version,
      releaseDate: info.updateInfo.releaseDate,
      releaseNotes: typeof info.updateInfo.releaseNotes === 'string'
        ? info.updateInfo.releaseNotes
        : Array.isArray(info.updateInfo.releaseNotes)
          ? info.updateInfo.releaseNotes.map(n => typeof n === 'string' ? n : n.note).join('\n')
          : undefined,
    }
    notifyRenderer(mainWindow)
  })

  // 没有更新
  autoUpdater.on('update-not-available', () => {
    console.log('[AutoUpdater] No update available')
    updateStatus = 'not-available'
    notifyRenderer(mainWindow)
  })

  // 下载进度
  autoUpdater.on('download-progress', (progress) => {
    downloadProgress = Math.round(progress.percent)
    updateStatus = 'downloading'
    notifyRenderer(mainWindow)
  })

  // 下载完成，等待安装
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Download complete:', info.updateInfo.version)
    updateStatus = 'downloaded'
    downloadProgress = 100
    updateInfo = {
      ...updateInfo,
      version: info.updateInfo.version,
    }
    notifyRenderer(mainWindow)
  })
}

/** 手动检查更新（GitHub → GitHub API → 局域网 三层回退） */
export async function checkForUpdates(): Promise<ReturnType<typeof getUpdateState>> {
  lanDownloadUrl = null
  try {
    updateStatus = 'checking'
    downloadProgress = 0
    await autoUpdater.checkForUpdates()
  } catch (err: any) {
    // 第一层回退：GitHub API 直接查询
    console.log('[AutoUpdater] electron-updater failed, trying GitHub API:', err.message)
    try {
      await checkForUpdatesViaGitHub()
    } catch (ghErr: any) {
      // 第二层回退：局域网检测
      console.log('[AutoUpdater] GitHub API failed, trying LAN:', ghErr.message)
      try {
        const lanResult = await checkLanForUpdates()
        if (lanResult && lanResult.hasUpdate) {
          updateStatus = 'available'
          lanDownloadUrl = lanResult.downloadUrl
          updateInfo = {
            version: lanResult.latestVersion!,
            releaseDate: undefined,
            releaseNotes: `🌐 局域网发现新版本（来自 ${lanResult.peers.find(p => p.version === lanResult.latestVersion)?.ip || '未知'}）\n当前版本: ${app.getVersion()} → 最新版本: ${lanResult.latestVersion}`,
          }
          console.log('[AutoUpdater] LAN update available:', lanResult.latestVersion)
        } else if (lanResult) {
          updateStatus = 'not-available'
          updateInfo = null
          console.log('[AutoUpdater] LAN: already up to date')
        } else {
          updateStatus = 'error'
          updateInfo = null
          console.error('[AutoUpdater] LAN: no peers found')
        }
      } catch (lanErr: any) {
        updateStatus = 'error'
        updateInfo = null
        console.error('[AutoUpdater] All update methods failed:', lanErr.message)
      }
    }
  }
  return getUpdateState()
}

/** 通过 GitHub Releases API 检查最新版本 */
async function checkForUpdatesViaGitHub(): Promise<void> {
  const owner = '401151407-hue'
  const repo = 'supply-chain-tester'
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`

  console.log('[AutoUpdater] Fetching latest release from GitHub:', url)
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'SupplyChainTester',
    },
  })

  if (!response.ok) {
    // 404：私有仓库未认证时 GitHub API 也会返回 404，不代表没有 Release
    // 交给调用方（electron-updater）原生逻辑处理
    if (response.status === 404) {
      console.log('[AutoUpdater] GitHub API 返回 404（可能是私有仓库需要认证），回退到 electron-updater')
      throw new Error('GitHub API 不可用（私有仓库需认证）')
    }
    throw new Error(`GitHub API 返回 ${response.status}: ${response.statusText}`)
  }

  const release = await response.json()
  const latestVersion = (release.tag_name || '').replace(/^v/, '')
  const currentVersion = autoUpdater.currentVersion.version

  console.log('[AutoUpdater] Latest:', latestVersion, 'Current:', currentVersion)

  // 解析版本号并比较
  const latestParts = latestVersion.split('.').map(Number)
  const currentParts = currentVersion.split('.').map(Number)

  let isNewer = false
  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const l = latestParts[i] || 0
    const c = currentParts[i] || 0
    if (l > c) { isNewer = true; break }
    if (l < c) break
  }

  if (isNewer) {
    updateStatus = 'available'
    updateInfo = {
      version: latestVersion,
      releaseDate: release.published_at,
      releaseNotes: release.body || '',
    }
    console.log('[AutoUpdater] New version available:', latestVersion)
  } else {
    updateStatus = 'not-available'
    updateInfo = null
    console.log('[AutoUpdater] Already up to date')
  }
}

/** 下载更新（支持 GitHub + 局域网两种来源） */
export async function downloadUpdate(): Promise<ReturnType<typeof getUpdateState>> {
  // 如果是局域网更新，走 HTTP 下载
  if (lanDownloadUrl) {
    return downloadFromLan(lanDownloadUrl)
  }

  try {
    updateStatus = 'downloading'
    await autoUpdater.downloadUpdate()
  } catch (err: any) {
    // 开发模式下 electron-updater 无法下载，打开 GitHub Releases 页面
    console.log('[AutoUpdater] Download via electron-updater failed:', err.message)
    try {
      const { shell } = await import('electron')
      await shell.openExternal('https://github.com/401151407-hue/supply-chain-tester/releases/latest')
      updateStatus = 'idle'
    } catch (e: any) {
      updateStatus = 'error'
      console.error('[AutoUpdater] Download fallback failed:', e.message)
    }
  }
  return getUpdateState()
}

/** 从局域网下载安装包 */
async function downloadFromLan(url: string): Promise<ReturnType<typeof getUpdateState>> {
  console.log('[AutoUpdater] Downloading from LAN:', url)
  updateStatus = 'downloading'
  downloadProgress = 0

  return new Promise((resolve) => {
    const tmpDir = app.getPath('temp')
    const fileName = `SupplyChainTester-Setup-LAN-${Date.now()}.exe`
    const tmpPath = join(tmpDir, fileName)

    fetch(url)
      .then(res => {
        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`)
        }

        const total = parseInt(res.headers.get('content-length') || '0', 10)
        let downloaded = 0
        const fileStream = createWriteStream(tmpPath)

        // 用 ReadableStream 读取并写文件
        const reader = res.body.getReader()
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            downloaded += value.length
            fileStream.write(Buffer.from(value))
            if (total > 0) {
              downloadProgress = Math.round((downloaded / total) * 100)
            }
          }
          fileStream.end()
        }

        pump().then(() => {
          console.log('[AutoUpdater] LAN download complete:', tmpPath)
          downloadProgress = 100
          updateStatus = 'downloaded'

          // 把下载的文件移到安装包旁边，方便 quitAndInstall 使用
          const destDir = app.isPackaged ? join(process.resourcesPath, '..') : join(app.getAppPath(), 'dist')
          const destPath = join(destDir, 'SupplyChainTester-Setup-LAN.exe')
          try {
            if (existsSync(destPath)) unlinkSync(destPath)
            renameSync(tmpPath, destPath)
            console.log('[AutoUpdater] Installer saved to:', destPath)
          } catch {
            console.log('[AutoUpdater] Installer kept at:', tmpPath)
          }

          resolve(getUpdateState())
        }).catch((err) => {
          updateStatus = 'error'
          console.error('[AutoUpdater] LAN download error:', err.message)
          resolve(getUpdateState())
        })

        return undefined
      })
      .catch((err) => {
        updateStatus = 'error'
        console.error('[AutoUpdater] LAN download failed:', err.message)
        resolve(getUpdateState())
      })
  })
}

/** 安装更新并重启（GitHub 更新用） */
export function quitAndInstall() {
  autoUpdater.quitAndInstall(false, true)
}

/** 安装局域网下载的更新 */
export function installLanUpdate() {
  const destDir = app.isPackaged ? join(process.resourcesPath, '..') : join(app.getAppPath(), 'dist')
  const installerPath = join(destDir, 'SupplyChainTester-Setup-LAN.exe')
  if (existsSync(installerPath)) {
    const { exec } = require('child_process')
    console.log('[AutoUpdater] Launching LAN installer:', installerPath)
    exec(`"${installerPath}"`, (err: any) => {
      if (err) console.error('[AutoUpdater] Failed to launch installer:', err.message)
    })
    // 延迟退出让安装程序启动
    setTimeout(() => app.quit(), 1000)
  } else {
    console.error('[AutoUpdater] LAN installer not found')
  }
}

/** 导出给 main/index.ts 在退出时清理 */
export { stopLanServer }

/** 通知渲染进程状态变化 */
function notifyRenderer(win: BrowserWindow) {
  if (!win.isDestroyed()) {
    win.webContents.send('update:state-changed', getUpdateState())
  }
}
