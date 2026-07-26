/**
 * Ollama 本地大模型服务
 * 
 * 通过 Ollama REST API (默认 http://localhost:11434) 管理本地模型：
 * - 检测 Ollama 是否安装并运行
 * - 列出已下载的模型
 * - 下载/拉取模型（带进度）
 * - 删除模型
 * - 获取模型详情
 * 
 * DeepSeek 可用模型（免费开源）：
 *   deepseek-r1:1.5b  ~1.1GB  最小，CPU 可跑
 *   deepseek-r1:7b    ~4.7GB  推荐入门
 *   deepseek-r1:8b    ~4.9GB
 *   deepseek-r1:14b   ~9.0GB  推荐
 *   deepseek-r1:32b   ~20GB   需要大显存
 *   deepseek-r1:70b   ~43GB   多卡
 *   deepseek-v3       ~???    最新旗舰
 */

import { EventEmitter } from 'events'
import * as http from 'http'

export interface OllamaModel {
  name: string
  modified_at: string
  size: number           // 字节
  digest: string
  details?: {
    format: string
    family: string
    parameter_size: string
    quantization_level: string
  }
}

export interface OllamaModelDetail {
  license?: string
  modelfile?: string
  parameters?: string
  template?: string
  details?: {
    format: string
    family: string
    parameter_size: string
    quantization_level: string
    parent_model?: string
  }
  model_info?: Record<string, any>
}

export interface OllamaStatus {
  installed: boolean
  running: boolean
  version?: string
  error?: string
}

export interface PullProgress {
  status: string          // 状态描述
  completed?: number      // 已下载字节
  total?: number          // 总字节
  percent?: number        // 百分比 0-100
  digest?: string         // 当前层 digest
}

// 预配置的 DeepSeek 免费模型（社区推荐）
export const DEEPSEEK_MODELS = [
  { name: 'deepseek-r1:1.5b', label: 'DeepSeek R1 · 1.5B', size: '~1.1GB', desc: '最小模型，CPU 可跑，适合简单问答', tier: '入门' },
  { name: 'deepseek-r1:7b',   label: 'DeepSeek R1 · 7B',   size: '~4.7GB', desc: '推荐入门，消费级显卡，日常够用', tier: '推荐' },
  { name: 'deepseek-r1:8b',   label: 'DeepSeek R1 · 8B',   size: '~4.9GB', desc: '7B 升级版，效果更好', tier: '进阶' },
  { name: 'deepseek-r1:14b',  label: 'DeepSeek R1 · 14B',  size: '~9.0GB', desc: '推荐主力，8G 显存可跑', tier: '推荐' },
  { name: 'deepseek-r1:32b',  label: 'DeepSeek R1 · 32B',  size: '~20GB',  desc: '需要 RTX 4090 / 多卡', tier: '高端' },
  { name: 'deepseek-r1:70b',  label: 'DeepSeek R1 · 70B',  size: '~43GB',  desc: '多卡并行，接近 API 效果', tier: '旗舰' },
  { name: 'deepseek-v3:latest', label: 'DeepSeek V3',       size: '~???',   desc: '最新旗舰模型（如有）', tier: '旗舰' },
]

// 其他推荐的免费模型
export const OTHER_FREE_MODELS = [
  { name: 'qwen2.5:7b',       label: '通义千问 2.5 · 7B',  size: '~4.7GB', desc: '阿里开源，中文能力强' },
  { name: 'qwen2.5:14b',      label: '通义千问 2.5 · 14B', size: '~9.0GB', desc: '中文推理优秀' },
  { name: 'llama3:8b',        label: 'Llama 3 · 8B',       size: '~4.7GB', desc: 'Meta 开源，通用能力强' },
  { name: 'codellama:7b',     label: 'Code Llama · 7B',    size: '~3.8GB', desc: 'Meta 代码专用模型' },
]

export class OllamaService extends EventEmitter {
  private baseUrl: string
  private AbortController: typeof AbortController | null = null

  constructor(baseUrl?: string) {
    super()
    this.baseUrl = baseUrl || 'http://localhost:11434'
  }

  /** 设置 API 地址 */
  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, '')
  }

  /** 通用 HTTP 请求 */
  private async request<T>(
    method: string,
    path: string,
    body?: any,
    timeout = 10000,
  ): Promise<T> {
    const url = new URL(path, this.baseUrl)
    
    return new Promise((resolve, reject) => {
      const req = http.request(
        url.toString(),
        {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          timeout,
        },
        (res) => {
          let data = ''
          res.on('data', (chunk: Buffer) => (data += chunk.toString()))
          res.on('end', () => {
            try {
              if (res.statusCode && res.statusCode >= 400) {
                reject(new Error(`Ollama API 错误 (${res.statusCode}): ${data.slice(0, 200)}`))
                return
              }
              resolve(data ? JSON.parse(data) : ({} as T))
            } catch (err) {
              reject(new Error(`Ollama 响应解析失败: ${(err as Error).message}`))
            }
          })
        },
      )
      req.on('error', (err: Error) => reject(err))
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Ollama 请求超时'))
      })
      if (body) req.write(JSON.stringify(body))
      req.end()
    })
  }

  /** 检测 Ollama 状态 */
  async checkStatus(): Promise<OllamaStatus> {
    try {
      // 先尝试访问根端点获取版本
      const verData = await this.request<{ version: string }>('GET', '/api/version', undefined, 3000)
      return {
        installed: true,
        running: true,
        version: verData.version || 'unknown',
      }
    } catch (err: any) {
      const msg = err.message || String(err)
      // 连接被拒绝 = Ollama 未运行
      if (msg.includes('ECONNREFUSED') || msg.includes('connect')) {
        return {
          installed: false,
          running: false,
          error: 'Ollama 未安装或未启动。请先安装 Ollama: https://ollama.com/download',
        }
      }
      // 超时
      if (msg.includes('timeout') || msg.includes('超时')) {
        return {
          installed: false,
          running: false,
          error: '连接 Ollama 超时，请确认 Ollama 正在运行',
        }
      }
      return {
        installed: false,
        running: false,
        error: `检测失败: ${msg}`,
      }
    }
  }

  /** 列出本地已安装的模型 */
  async listModels(): Promise<OllamaModel[]> {
    const data = await this.request<{ models: OllamaModel[] }>('GET', '/api/tags')
    return data.models || []
  }

  /** 获取模型详情 */
  async showModel(name: string): Promise<OllamaModelDetail> {
    return this.request<OllamaModelDetail>('POST', '/api/show', { name })
  }

  /**
   * 拉取模型（流式进度）
   * 返回一个 abort 函数用于取消下载
   */
  pullModel(modelName: string, onProgress?: (progress: PullProgress) => void): { abort: () => void } {
    const url = new URL('/api/pull', this.baseUrl)
    let aborted = false

    const run = async () => {
      const req = http.request(
        url.toString(),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        (res) => {
          let buffer = ''
          res.on('data', (chunk: Buffer) => {
            if (aborted) {
              req.destroy()
              return
            }
            buffer += chunk.toString()
            // Ollama 返回 NDJSON（每行一个 JSON）
            const lines = buffer.split('\n')
            buffer = lines.pop() || '' // 保留最后一个不完整的行
            for (const line of lines) {
              if (!line.trim() || aborted) continue
              try {
                const event = JSON.parse(line)
                if (onProgress) {
                  onProgress({
                    status: event.status || '',
                    completed: event.completed,
                    total: event.total,
                    percent: event.total ? Math.round((event.completed / event.total) * 100) : undefined,
                    digest: event.digest,
                  })
                }
                this.emit('pull-progress', modelName, {
                  status: event.status || '',
                  completed: event.completed,
                  total: event.total,
                  percent: event.total ? Math.round((event.completed / event.total) * 100) : undefined,
                })
                // 下载完成
                if (event.status === 'success') {
                  this.emit('pull-done', modelName)
                }
              } catch {
                // 忽略解析失败
              }
            }
          })
          res.on('end', () => {
            // 处理剩余 buffer
            if (buffer.trim() && !aborted) {
              try {
                const event = JSON.parse(buffer)
                if (event.status === 'success') {
                  this.emit('pull-done', modelName)
                }
              } catch {}
            }
            this.emit('pull-end', modelName)
          })
          res.on('error', (err) => {
            if (!aborted) {
              this.emit('pull-error', modelName, err.message)
            }
          })
        },
      )
      req.on('error', (err: Error) => {
        if (!aborted) {
          this.emit('pull-error', modelName, err.message)
        }
      })
      req.write(JSON.stringify({ name: modelName, stream: true }))
      req.end()
    }

    run()

    return {
      abort: () => {
        aborted = true
        this.emit('pull-aborted', modelName)
      },
    }
  }

  /** 删除模型 */
  async deleteModel(name: string): Promise<void> {
    await this.request('DELETE', `/api/delete`, { name })
  }

  /** 复制模型（创建别名） */
  async copyModel(source: string, destination: string): Promise<void> {
    await this.request('POST', '/api/copy', { source, destination })
  }

  /** 生成文本补全（非流式，用于内嵌调用） */
  async generate(
    model: string,
    prompt: string,
    options?: { system?: string; temperature?: number; max_tokens?: number },
  ): Promise<string> {
    const data = await this.request<{ response: string }>('POST', '/api/generate', {
      model,
      prompt,
      system: options?.system,
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.max_tokens ?? 2048,
      },
    })
    return data.response || ''
  }

  /** 聊天补全（OpenAI 兼容端点 /v1/chat/completions） */
  async chat(
    model: string,
    messages: { role: string; content: string }[],
    options?: { temperature?: number; max_tokens?: number },
  ): Promise<string> {
    const data = await this.request<{
      choices: { message: { content: string } }[]
    }>('POST', '/v1/chat/completions', {
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 2048,
      stream: false,
    }, 60000)
    return data.choices?.[0]?.message?.content || ''
  }
}

/** 默认单例 */
export const ollamaService = new OllamaService()
