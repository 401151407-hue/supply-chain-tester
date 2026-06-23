/**
 * 局域网更新模块
 * 不依赖 GitHub，同一局域网内自动发现并下载更新
 *
 * 工作原理：
 *   1. 每台电脑启动后开一个微型 HTTP 服务器（端口 19876）
 *   2. 暴露 /version 接口返回当前版本号
 *   3. 检查更新时，扫描同网段 IP 的 19876 端口
 *   4. 发现新版本后直接下载安装包
 */
import { createServer, type Server } from 'http'
import { networkInterfaces, type NetworkInterfaceInfo } from 'os'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { app } from 'electron'

const LAN_PORT = 19876
const LAN_SCAN_TIMEOUT = 2000 // 每个 IP 的超时（ms）
const LAN_MAX_CONCURRENT = 20 // 并发扫描数

let lanServer: Server | null = null
let localVersion = ''

interface LanVersionInfo {
  version: string
  appName: string
  ip: string
  port: number
}

/** 获取本机所有局域网 IPv4 地址 */
function getLocalIps(): string[] {
  const ips: string[] = []
  const nets = networkInterfaces()
  for (const [, netList] of Object.entries(nets)) {
    if (!netList) continue
    for (const info of netList) {
      if (info.family === 'IPv4' && !info.internal) {
        ips.push(info.address)
      }
    }
  }
  return ips
}

/** 根据 IP 和子网掩码推导网段（如 192.168.1.x） */
function getSubnetPrefix(ip: string, netmask: string): string {
  const ipParts = ip.split('.').map(Number)
  const maskParts = netmask.split('.').map(Number)
  const prefix: number[] = []
  for (let i = 0; i < 4; i++) {
    prefix.push(ipParts[i] & maskParts[i])
  }
  return prefix.join('.')
}

/** 获取本机可能的局域网网段列表 */
function getLanSubnets(): string[] {
  const nets = networkInterfaces()
  const subnets = new Set<string>()
  for (const [, netList] of Object.entries(nets)) {
    if (!netList) continue
    for (const info of netList) {
      if (info.family === 'IPv4' && !info.internal && info.netmask) {
        const prefix = getSubnetPrefix(info.address, info.netmask)
        subnets.add(prefix)
      }
    }
  }
  return [...subnets]
}

/**
 * 启动局域网更新 HTTP 服务器
 * 其他电脑通过访问 http://本机IP:19876/version 获取版本信息
 */
export function startLanServer(): void {
  localVersion = app.getVersion()
  const localIps = getLocalIps()

  if (lanServer) return

  lanServer = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')

    if (req.url === '/version') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        version: localVersion,
        appName: app.getName(),
        platform: process.platform,
      }))
      return
    }

    // 下载安装包（如果有的话）
    if (req.url === '/download') {
      // 打包后 EXE 同目录下找安装包
      const exeDir = app.isPackaged ? join(process.resourcesPath, '..') : join(app.getAppPath(), 'dist')
      const exeName = `SupplyChainTester Setup ${localVersion}.exe`
      const filePath = join(exeDir, exeName)
      if (existsSync(filePath)) {
        const data = readFileSync(filePath)
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(data.length),
          'Content-Disposition': `attachment; filename="${exeName}"`,
        })
        res.end(data)
      } else {
        res.writeHead(404)
        res.end('Installer not found')
      }
      return
    }

    res.writeHead(404)
    res.end('Not found')
  })

  lanServer.listen(LAN_PORT, '0.0.0.0', () => {
    console.log(`[LAN] Update server started on port ${LAN_PORT}, IPs: ${localIps.join(', ')}`)
  })

  lanServer.on('error', (err) => {
    console.warn('[LAN] Server error:', err.message)
  })
}

/** 停止局域网更新服务器 */
export function stopLanServer(): void {
  if (lanServer) {
    lanServer.close()
    lanServer = null
    console.log('[LAN] Server stopped')
  }
}

/** 检查单个 IP 是否有更新服务器 */
function probeLanIp(ip: string, port: number, timeout: number): Promise<LanVersionInfo | null> {
  return new Promise((resolve) => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
      resolve(null)
    }, timeout)

    fetch(`http://${ip}:${port}/version`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    })
      .then(res => {
        clearTimeout(timer)
        if (!res.ok) { resolve(null); return }
        return res.json()
      })
      .then((data: any) => {
        if (data && data.version) {
          resolve({ ...data, ip, port })
        } else {
          resolve(null)
        }
      })
      .catch(() => {
        clearTimeout(timer)
        resolve(null)
      })
  })
}

/** 批量探测网段内的 IP */
async function scanSubnet(subnet: string, port: number): Promise<LanVersionInfo[]> {
  const results: LanVersionInfo[] = []
  const ips: string[] = []

  // 扫描 .1 ~ .254 的常见 IP（跳过 .0 和 .255）
  // 优化：先扫描常见网关附近的 IP
  const priorityIps = [1, 2, 100, 101, 102, 103, 104, 105, 200]
  const otherIps: number[] = []
  for (let i = 1; i <= 254; i++) {
    if (!priorityIps.includes(i)) otherIps.push(i)
  }
  const orderedHosts = [...priorityIps, ...otherIps]

  for (const host of orderedHosts) {
    ips.push(`${subnet}.${host}`)
  }

  // 并发扫描，限制并发数
  const localIps = getLocalIps()
  for (let i = 0; i < ips.length; i += LAN_MAX_CONCURRENT) {
    const batch = ips.slice(i, i + LAN_MAX_CONCURRENT)
      .filter(ip => !localIps.includes(ip)) // 跳过本机
    const batchResults = await Promise.all(
      batch.map(ip => probeLanIp(ip, port, LAN_SCAN_TIMEOUT))
    )
    for (const r of batchResults) {
      if (r) results.push(r)
    }
    // 找到至少一个就继续扫描完当前批次，但不强求全部
  }

  return results
}

/** 比较版本号：返回 true 表示 remote > local */
function isNewerVersion(remote: string, local: string): boolean {
  const r = remote.split('.').map(Number)
  const l = local.split('.').map(Number)
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] || 0
    const lv = l[i] || 0
    if (rv > lv) return true
    if (rv < lv) return false
  }
  return false
}

/**
 * 局域网检查更新
 * 扫描同网段所有 IP，寻找更新服务器
 */
export async function checkLanForUpdates(): Promise<{
  hasUpdate: boolean
  latestVersion: string | null
  downloadUrl: string | null
  peers: LanVersionInfo[]
} | null> {
  const subnets = getLanSubnets()
  if (subnets.length === 0) {
    console.log('[LAN] No LAN subnet detected')
    return null
  }

  console.log('[LAN] Scanning subnets:', subnets.join(', '))
  const currentVersion = app.getVersion()
  const allPeers: LanVersionInfo[] = []

  for (const subnet of subnets) {
    const peers = await scanSubnet(subnet, LAN_PORT)
    allPeers.push(...peers)
  }

  // 去重（同一 IP 可能被多次发现）
  const uniquePeers = allPeers.filter(
    (p, i, arr) => arr.findIndex(x => x.ip === p.ip) === i
  )

  console.log('[LAN] Found peers:', uniquePeers.length)

  // 找最新版本
  let bestPeer: LanVersionInfo | null = null
  for (const peer of uniquePeers) {
    if (isNewerVersion(peer.version, currentVersion)) {
      if (!bestPeer || isNewerVersion(peer.version, bestPeer.version)) {
        bestPeer = peer
      }
    }
  }

  if (bestPeer) {
    return {
      hasUpdate: true,
      latestVersion: bestPeer.version,
      downloadUrl: `http://${bestPeer.ip}:${bestPeer.port}/download`,
      peers: uniquePeers,
    }
  }

  return {
    hasUpdate: false,
    latestVersion: null,
    downloadUrl: null,
    peers: uniquePeers,
  }
}
