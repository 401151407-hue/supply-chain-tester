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
  customModels?: { value: string; label: string }[]
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
    message: { role: string; content: string; reasoning_content?: string }
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
  customModels: [],
}

/** 已知模型 → API 地址 + 默认 Key（与渲染进程 MODEL_INFO 保持一致） */
const MODEL_INFO: Record<string, { base: string; key: string }> = {
  'llm-pro':           { base: 'http://10.100.22.203:30080/llmsec/wxsllm/v1', key: 'llm-sk-y2ZW6Gvm-bQjif7EsrmsVg' },
  'llm-plus':          { base: 'http://10.100.22.203:30080/llmsec/wxsllm/v1', key: 'llm-sk-y2ZW6Gvm-bQjif7EsrmsVg' },
  'llm-flash':         { base: 'http://10.100.22.203:30080/llmsec/wxsllm/v1', key: 'llm-sk-y2ZW6Gvm-bQjif7EsrmsVg' },
  'deepseek-v4-pro':   { base: 'https://api.deepseek.com/v1', key: '' },
  'deepseek-v4-flash': { base: 'https://api.deepseek.com/v1', key: '' },
  'qwen-max':          { base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', key: '' },
  'qwen-plus':         { base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', key: '' },
  'qwen-turbo':        { base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', key: '' },
  'moonshot-v1':       { base: 'https://api.moonshot.cn/v1', key: '' },
  'hy3':               { base: 'https://tokenhub.tencentmaas.com/v1', key: 'sk-RwmJqgUJkBUAsPT7Vl7fHWZ292uUkOMxFN3AHScpfsbnrhx7' },
  'qwen2.5:7b':        { base: 'http://localhost:11434/v1', key: 'ollama' },
  'llama3:8b':         { base: 'http://localhost:11434/v1', key: 'ollama' },
  'deepseek-r1:7b':    { base: 'http://localhost:11434/v1', key: 'ollama' },
  'codellama:7b':      { base: 'http://localhost:11434/v1', key: 'ollama' },
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

  /** 根据模型解析请求地址和 Key：优先模型内置映射，其次使用当前配置 */
  private resolveEndpoint(model?: string): { url: string; apiKey: string } {
    const m = model || this.config.analysisModel
    const info = MODEL_INFO[m]
    if (info) {
      return {
        url: `${info.base}/chat/completions`,
        apiKey: info.key || this.config.apiKey,
      }
    }
    // 自定义模型：使用当前配置的地址和 Key
    return {
      url: `${this.config.apiBase}/chat/completions`,
      apiKey: this.config.apiKey,
    }
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

    const { url, apiKey } = this.resolveEndpoint(options?.model)
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
        'Authorization': `Bearer ${apiKey}`,
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
              || chunk.choices?.[0]?.delta?.reasoning_content
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

    const { url, apiKey } = this.resolveEndpoint(options?.model)
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
        'Authorization': `Bearer ${apiKey}`,
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
    console.log('[AIService] 响应结构:', JSON.stringify(data).slice(0, 500))

    const content = data.choices?.[0]?.message?.content
      || data.choices?.[0]?.message?.reasoning_content
    if (!content) {
      console.error('[AIService] 响应无内容，完整响应:', JSON.stringify(data).slice(0, 1000))
      throw new Error('AI 返回内容为空，请检查模型配置或切换模型重试')
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
   * 测试连接（最多重试 2 次）
   */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    let lastError: string = ''
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await this.chat(
          [{ role: 'user', content: 'hi' }],
          { model: this.config.analysisModel || undefined, maxTokens: 100, temperature: 0 },
        )
        const content = (response || '').trim()
        if (!content) {
          lastError = 'API 返回为空，请检查模型名和 Key 是否正确'
          continue
        }
        return { ok: true, message: `连接成功 ✓ (${content.slice(0, 20)})` }
      } catch (err: any) {
        lastError = err.message || String(err)
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 500 * attempt))
        }
      }
    }
    return { ok: false, message: lastError || '连接失败' }
  }
}
