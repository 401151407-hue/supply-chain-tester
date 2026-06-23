/**
 * AI 服务模块 - 接入内部 LLM 算力（OpenAI 兼容接口）
 *
 * 模型：
 *   llm-pro   (集团) - 用于测试分析和建议
 *   llm-plus  (锡商) - 通用
 *   llm-flash (锡商) - 快速/低成本，用于步骤生成
 *
 * API Base: http://10.100.22.203:30080/llmsec/wxsllm/v1
 */

export interface AIConfig {
  apiBase: string
  apiKey: string
  analysisModel: string    // 用于分析报告（默认 llm-pro）
  generationModel: string  // 用于生成步骤（默认 llm-flash）
  enabled: boolean
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  temperature?: number
  max_tokens?: number
  stream?: boolean
}

export interface ChatCompletionResponse {
  id: string
  object: string
  model: string
  choices: {
    index: number
    message: { role: string; content: string }
    finish_reason: string
  }[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/** 默认 AI 配置 */
export const DEFAULT_AI_CONFIG: AIConfig = {
  apiBase: 'http://10.100.22.203:30080/llmsec/wxsllm/v1',
  apiKey: 'llm-sk-y2ZW6Gvm-bQjif7EsrmsVg',
  analysisModel: 'llm-pro',
  generationModel: 'llm-flash',
  enabled: true,
}

export class AIService {
  private config: AIConfig

  constructor(config?: Partial<AIConfig>) {
    this.config = { ...DEFAULT_AI_CONFIG, ...config }
  }

  /** 更新配置 */
  updateConfig(partial: Partial<AIConfig>): void {
    this.config = { ...this.config, ...partial }
  }

  /** 获取当前配置 */
  getConfig(): AIConfig {
    return { ...this.config }
  }

  /**
   * 流式调用 LLM 聊天补全，通过回调逐 token 推送
   */
  async chatStream(
    messages: ChatMessage[],
    onToken: (token: string) => void,
    options?: { model?: string; temperature?: number; maxTokens?: number },
  ): Promise<string> {
    if (!this.config.enabled) {
      throw new Error('AI 服务未启用，请在设置中开启')
    }

    const url = `${this.config.apiBase}/chat/completions`
    const body: ChatCompletionRequest = {
      model: options?.model || this.config.analysisModel,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2048,
      stream: true,
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(
        `AI API 调用失败 (HTTP ${response.status}): ${errorText.substring(0, 300)}`,
      )
    }

    // 解析 SSE 流
    const reader = response.body?.getReader()
    if (!reader) throw new Error('无法读取流式响应')

    const decoder = new TextDecoder()
    let fullContent = ''
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        // 最后一个可能不完整，保留到下次
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data:')) continue

          const jsonStr = trimmed.slice(5).trim()
          if (jsonStr === '[DONE]') continue

          try {
            const chunk = JSON.parse(jsonStr)
            const delta = chunk.choices?.[0]?.delta?.content
            if (delta) {
              fullContent += delta
              onToken(delta)
            }
          } catch {
            // 忽略解析失败的行
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {})
    }

    if (!fullContent) {
      throw new Error('AI 返回内容为空')
    }

    return fullContent
  }

  /**
   * 调用 LLM 聊天补全
   */
  async chat(
    messages: ChatMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number },
  ): Promise<string> {
    if (!this.config.enabled) {
      throw new Error('AI 服务未启用，请在设置中开启')
    }

    const url = `${this.config.apiBase}/chat/completions`
    const body: ChatCompletionRequest = {
      model: options?.model || this.config.analysisModel,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2048,
      stream: false,
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(
        `AI API 调用失败 (HTTP ${response.status}): ${errorText.substring(0, 300)}`,
      )
    }

    const data: ChatCompletionResponse = await response.json()

    const content = data.choices?.[0]?.message?.content
    if (!content) {
      throw new Error('AI 返回内容为空')
    }

    return content
  }

  /**
   * 分析测试报告，返回改进建议
   */
  async analyzeReport(reportJson: string): Promise<string[]> {
    const systemPrompt = `你是一位资深的供应链系统测试专家。你会收到一份测试执行报告的 JSON 数据。
请分析测试结果，给出具体的改进建议。要求：
1. 用中文回答
2. 如果全部通过，给出优化建议
3. 如果有失败步骤，分析可能的原因并给出修复方案
4. 每条建议简洁明了，以 "- " 开头
5. 返回纯文本，不要 markdown 代码块`

    const userPrompt = `请分析以下供应链测试报告，给出改进建议：\n\n${reportJson}`

    const response = await this.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { model: this.config.analysisModel, temperature: 0.5, maxTokens: 2048 },
    )

    // 解析为数组，每行以 - 开头的是建议
    return response
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('-') || line.startsWith('•'))
      .map(line => line.replace(/^[-•]\s*/, ''))
      .filter(Boolean)
  }

  /**
   * 根据自然语言描述生成测试步骤（JSON 格式）
   */
  async generateTestSteps(description: string): Promise<string> {
    const systemPrompt = `你是一位供应链系统测试自动化专家。用户会描述一个供应链测试场景，你需要生成对应的 API 测试步骤。

请以 JSON 数组格式返回测试步骤，每个步骤包含：
- name: 步骤名称
- method: HTTP 方法 (GET/POST/PUT/DELETE/PATCH)
- url: 请求 URL（变量用 {{变量名}} 表示）
- headers: 请求头对象
- body: 请求体（JSON 字符串，POST/PUT 时使用）
- expectedStatus: 期望的 HTTP 状态码
- expectedBody: 期望的响应体部分匹配（JSON 字符串）
- extractVars: 从响应提取的变量映射（如 {"orderId": "$.data.id"}）

示例格式：
[
  {
    "name": "创建采购订单",
    "method": "POST",
    "url": "https://api.example.com/purchase/orders",
    "headers": {"Content-Type": "application/json", "Authorization": "Bearer {{token}}"},
    "body": "{\\"supplierId\\": \\"SUP001\\", \\"items\\": [{\\"sku\\": \\"SKU-001\\", \\"qty\\": 100}]}",
    "expectedStatus": 201,
    "expectedBody": "{\\"status\\": \\"created\\"}",
    "extractVars": {"orderId": "$.data.id"}
  }
]

要求：
1. 只返回 JSON 数组，不要其他文字
2. 步骤要覆盖正向和异常场景
3. URL 中使用合理的 RESTful 路径
4. 供应链相关：采购、库存、物流、仓储、质检等`

    const userPrompt = `请为以下供应链测试场景生成 API 测试步骤：\n\n${description}`

    const response = await this.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { model: this.config.generationModel, temperature: 0.3, maxTokens: 4096 },
    )

    return response
  }

  /**
   * 测试连接是否可用
   */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await this.chat(
        [
          { role: 'system', content: '你是一个测试助手。' },
          { role: 'user', content: '请回复 "OK"' },
        ],
        { maxTokens: 16, temperature: 0 },
      )
      return { ok: true, message: `连接成功。模型回复: ${response.substring(0, 100)}` }
    } catch (err: any) {
      return { ok: false, message: err.message || String(err) }
    }
  }
}
