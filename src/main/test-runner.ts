/**
 * 测试执行引擎
 * 负责执行 API 测试和业务流程测试
 */
import type {
  TestCase,
  ApiTestCase,
  BusinessFlowTestCase,
  ApiTestStep,
  TestReport,
  StepResult,
  StepStatus,
  AssertionResult,
  AIGeneratedStep,
} from '../shared/types'
import type { AIService } from './ai-service'

export class TestRunner {
  private variables: Record<string, string> = {}
  private aiService: AIService | null = null

  /** 注入 AI 服务 */
  setAIService(ai: AIService): void {
    this.aiService = ai
  }

  /** 执行测试用例，返回报告 */
  async run(testCase: TestCase): Promise<TestReport> {
    this.variables = { ...testCase.variables }

    const report: TestReport = {
      id: crypto.randomUUID(),
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      testType: testCase.type,
      status: 'running',
      startedAt: new Date().toISOString(),
      totalSteps: 0,
      passedSteps: 0,
      failedSteps: 0,
      skippedSteps: 0,
      totalDuration: 0,
      stepResults: [],
    }

    const startTime = Date.now()

    if (testCase.type === 'api') {
      report.stepResults = await this.runApiSteps((testCase as ApiTestCase).steps)
    } else {
      report.stepResults = await this.runBusinessFlow((testCase as BusinessFlowTestCase).steps)
    }

    report.totalSteps = report.stepResults.length
    report.passedSteps = report.stepResults.filter(s => s.status === 'passed').length
    report.failedSteps = report.stepResults.filter(s => s.status === 'failed').length
    report.skippedSteps = report.stepResults.filter(s => s.status === 'skipped').length
    report.totalDuration = Date.now() - startTime
    report.finishedAt = new Date().toISOString()

    if (report.failedSteps === 0 && report.skippedSteps === 0) {
      report.status = 'passed'
    } else if (report.passedSteps === 0) {
      report.status = 'failed'
    } else {
      report.status = 'failed'
    }

    return report
  }

  /** 执行 API 测试步骤 */
  private async runApiSteps(steps: ApiTestStep[]): Promise<StepResult[]> {
    const results: StepResult[] = []

    for (const step of steps) {
      const start = Date.now()
      const result: StepResult = {
        stepId: step.id,
        stepName: step.name,
        status: 'running',
        duration: 0,
        request: {
          method: step.method,
          url: this.interpolate(step.url),
          headers: this.interpolateHeaders(step.headers),
          body: step.body ? this.interpolate(step.body) : undefined,
        },
      }

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), step.timeout || 30000)

        const fetchOptions: RequestInit = {
          method: step.method,
          headers: result.request!.headers,
          signal: controller.signal,
        }

        if (step.body && step.method !== 'GET') {
          fetchOptions.body = result.request!.body
        }

        const response = await fetch(result.request!.url, fetchOptions)
        clearTimeout(timeoutId)

        const responseBody = await response.text()

        result.response = {
          status: response.status,
          body: responseBody,
          headers: Object.fromEntries(response.headers.entries()),
        }

        // 提取变量
        if (step.extractVars && responseBody) {
          result.extractedVars = this.extractVariables(step.extractVars, responseBody)
          Object.assign(this.variables, result.extractedVars)
        }

        // 断言
        result.assertionResults = this.runAssertions(step, response.status, responseBody)
        result.status = this.evaluateStatus(result.assertionResults)
      } catch (err: any) {
        result.status = 'failed'
        result.error = err.message || String(err)
      }

      result.duration = Date.now() - start
      results.push(result)
    }

    return results
  }

  /** 执行业务流程步骤 */
  private async runBusinessFlow(steps: BusinessFlowTestCase['steps']): Promise<StepResult[]> {
    const results: StepResult[] = []
    const completed = new Set<string>()

    for (const step of steps) {
      // 检查依赖
      const unmet = step.dependsOn.filter(d => !completed.has(d))
      if (unmet.length > 0) {
        results.push({
          stepId: step.id,
          stepName: step.name,
          status: 'skipped',
          duration: 0,
          error: `依赖步骤未完成: ${unmet.join(', ')}`,
        })
        continue
      }

      const apiResults = await this.runApiSteps(step.apiCalls)
      const allPassed = apiResults.every(r => r.status === 'passed')

      results.push({
        stepId: step.id,
        stepName: step.name,
        status: allPassed ? 'passed' : 'failed',
        duration: apiResults.reduce((sum, r) => sum + r.duration, 0),
        assertionResults: apiResults.flatMap(r => r.assertionResults || []),
        extractedVars: apiResults.reduce((acc, r) => ({ ...acc, ...r.extractedVars }), {}),
        error: allPassed ? undefined : '部分 API 调用失败',
      })

      if (allPassed) completed.add(step.id)
    }

    return results
  }

  // ---- 辅助方法 ----

  private interpolate(text: string): string {
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => this.variables[key] || `{{${key}}}`)
  }

  private interpolateHeaders(headers: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {}
    for (const [k, v] of Object.entries(headers)) {
      result[k] = this.interpolate(v)
    }
    return result
  }

  private extractVariables(
    mapping: Record<string, string>,
    responseBody: string,
  ): Record<string, string> {
    const result: Record<string, string> = {}
    try {
      const json = JSON.parse(responseBody)
      for (const [varName, jsonPath] of Object.entries(mapping)) {
        const value = this.resolveJsonPath(json, jsonPath)
        if (value !== undefined) result[varName] = String(value)
      }
    } catch {
      // 非 JSON 响应，跳过变量提取
    }
    return result
  }

  private resolveJsonPath(obj: any, path: string): any {
    const parts = path.replace(/^\$\.?/, '').split('.')
    let current = obj
    for (const part of parts) {
      if (current == null) return undefined
      // 支持数组索引 data[0]
      const match = part.match(/^(\w+)\[(\d+)\]$/)
      if (match) {
        current = current[match[1]]?.[Number(match[2])]
      } else {
        current = current[part]
      }
    }
    return current
  }

  private runAssertions(
    step: ApiTestStep,
    actualStatus: number,
    responseBody: string,
  ): AssertionResult[] {
    const assertions: AssertionResult[] = []

    // 状态码断言
    assertions.push({
      description: `HTTP 状态码应为 ${step.expectedStatus}`,
      passed: actualStatus === step.expectedStatus,
      expected: String(step.expectedStatus),
      actual: String(actualStatus),
    })

    // 响应体断言
    if (step.expectedBody && responseBody) {
      try {
        const expected = JSON.parse(step.expectedBody)
        const actual = JSON.parse(responseBody)
        const match = this.deepPartialMatch(expected, actual)
        assertions.push({
          description: '响应体应包含预期字段',
          passed: match.passed,
          expected: match.expected,
          actual: match.actual,
        })
      } catch {
        assertions.push({
          description: '响应体匹配',
          passed: responseBody.includes(step.expectedBody),
          expected: step.expectedBody,
          actual: responseBody.substring(0, 200),
        })
      }
    }

    return assertions
  }

  private deepPartialMatch(
    expected: any,
    actual: any,
    path = '$',
  ): { passed: boolean; expected: string; actual: string } {
    if (expected === null || expected === undefined) {
      return { passed: true, expected: String(expected), actual: String(actual) }
    }

    if (typeof expected !== typeof actual) {
      return {
        passed: false,
        expected: `${path}: ${JSON.stringify(expected)}`,
        actual: `${path}: ${JSON.stringify(actual)}`,
      }
    }

    if (typeof expected === 'object' && !Array.isArray(expected)) {
      for (const key of Object.keys(expected)) {
        if (!(key in actual)) {
          return {
            passed: false,
            expected: `${path}.${key}: ${JSON.stringify(expected[key])}`,
            actual: `${path}.${key}: <missing>`,
          }
        }
        const sub = this.deepPartialMatch(expected[key], actual[key], `${path}.${key}`)
        if (!sub.passed) return sub
      }
    } else if (Array.isArray(expected)) {
      if (!Array.isArray(actual) || actual.length < expected.length) {
        return { passed: false, expected: JSON.stringify(expected), actual: JSON.stringify(actual) }
      }
      for (let i = 0; i < expected.length; i++) {
        const sub = this.deepPartialMatch(expected[i], actual[i], `${path}[${i}]`)
        if (!sub.passed) return sub
      }
    } else if (expected !== actual) {
      return { passed: false, expected: `${path}: ${expected}`, actual: `${path}: ${actual}` }
    }

    return { passed: true, expected: '', actual: '' }
  }

  private evaluateStatus(assertions: AssertionResult[]): StepStatus {
    if (!assertions || assertions.length === 0) return 'passed'
    return assertions.every(a => a.passed) ? 'passed' : 'failed'
  }

  // ---- AI 功能 ----

  /** AI 分析报告，返回改进建议列表 */
  async aiAnalyze(reportJson: string): Promise<string[]> {
    if (!this.aiService) {
      return ['AI 服务未配置，请在设置中启用 AI 功能。']
    }
    try {
      const suggestions = await this.aiService.analyzeReport(reportJson)
      return suggestions.length > 0
        ? suggestions
        : ['AI 分析完成，未发现需要特别关注的问题。']
    } catch (err: any) {
      return [`AI 分析失败: ${err.message || String(err)}`]
    }
  }

  /** AI 生成测试步骤，返回解析后的步骤对象数组 */
  async aiGenerateSteps(description: string): Promise<AIGeneratedStep[]> {
    if (!this.aiService) {
      throw new Error('AI 服务未配置，请在设置中启用 AI 功能。')
    }
    const rawResponse = await this.aiService.generateTestSteps(description)

    // 尝试从 AI 回复中提取 JSON 数组
    let jsonStr = rawResponse.trim()

    // 去掉可能的 markdown 代码块包裹
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim()
    }

    // 如果以 [ 开头直接解析，否则尝试找到第一个 [ 的位置
    if (!jsonStr.startsWith('[')) {
      const bracketStart = jsonStr.indexOf('[')
      const bracketEnd = jsonStr.lastIndexOf(']')
      if (bracketStart >= 0 && bracketEnd > bracketStart) {
        jsonStr = jsonStr.substring(bracketStart, bracketEnd + 1)
      }
    }

    try {
      const steps: AIGeneratedStep[] = JSON.parse(jsonStr)
      if (!Array.isArray(steps) || steps.length === 0) {
        throw new Error('AI 未生成有效的步骤')
      }
      return steps
    } catch {
      throw new Error(`AI 生成步骤解析失败，原始响应:\n${rawResponse.substring(0, 500)}`)
    }
  }
}
