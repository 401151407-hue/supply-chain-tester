// ============================================================
// 供应链测试工具 - 共享类型定义
// ============================================================

/** 测试类型 */
export type TestType = 'api' | 'business-flow'

/** API 请求方法 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

/** 测试步骤状态 */
export type StepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped'

/** 测试用例状态 */
export type TestCaseStatus = 'draft' | 'ready' | 'running' | 'passed' | 'failed'

/** API 测试步骤 */
export interface ApiTestStep {
  id: string
  name: string
  method: HttpMethod
  url: string
  headers: Record<string, string>
  body?: string
  expectedStatus: number
  expectedBody?: string        // JSON schema 或部分匹配
  extractVars?: Record<string, string>  // 从响应中提取变量，key=变量名, value=JSONPath
  timeout: number              // 毫秒
}

/** 业务流程测试步骤 */
export interface BusinessFlowStep {
  id: string
  name: string
  action: string               // 自然语言描述的动作，如 "创建采购订单"
  apiCalls: ApiTestStep[]      // 该步骤包含的 API 调用
  assertions: string[]         // 断言描述
  dependsOn: string[]          // 依赖的前序步骤 ID
}

/** API 测试用例 */
export interface ApiTestCase {
  id: string
  type: 'api'
  name: string
  description: string
  tags: string[]
  steps: ApiTestStep[]
  variables: Record<string, string>
  status: TestCaseStatus
  createdAt: string
  updatedAt: string
}

/** 业务流程测试用例 */
export interface BusinessFlowTestCase {
  id: string
  type: 'business-flow'
  name: string
  description: string
  tags: string[]
  steps: BusinessFlowStep[]
  variables: Record<string, string>
  status: TestCaseStatus
  createdAt: string
  updatedAt: string
}

/** 统一测试用例类型 */
export type TestCase = ApiTestCase | BusinessFlowTestCase

/** 步骤执行结果 */
export interface StepResult {
  stepId: string
  stepName: string
  status: StepStatus
  duration: number             // 毫秒
  request?: {
    method: string
    url: string
    headers: Record<string, string>
    body?: string
  }
  response?: {
    status: number
    body: string
    headers: Record<string, string>
  }
  error?: string
  extractedVars?: Record<string, string>
  assertionResults?: AssertionResult[]
}

/** 断言结果 */
export interface AssertionResult {
  description: string
  passed: boolean
  expected: string
  actual: string
}

/** 测试执行报告 */
export interface TestReport {
  id: string
  testCaseId: string
  testCaseName: string
  testType: TestType
  status: TestCaseStatus
  startedAt: string
  finishedAt?: string
  totalSteps: number
  passedSteps: number
  failedSteps: number
  skippedSteps: number
  totalDuration: number        // 毫秒
  stepResults: StepResult[]
  aiSuggestions?: string[]     // AI 给出的改进建议
}

/** 测试套件（批量执行） */
export interface TestSuite {
  id: string
  name: string
  testCaseIds: string[]
  createdAt: string
}

/** AI 配置 */
export interface AIConfig {
  apiBase: string
  apiKey: string
  analysisModel: string
  generationModel: string
  enabled: boolean
}

/** AI 生成步骤结果 */
export interface AIGeneratedStep {
  name: string
  method: string
  url: string
  headers: Record<string, string>
  body?: string
  expectedStatus: number
  expectedBody?: string
  extractVars?: Record<string, string>
}

/** API 并发测试请求 */
export interface ApiBatchRequest {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
  concurrency: number
  totalRequests: number
  timeout?: number
}

/** 单次请求结果 */
export interface ApiBatchItem {
  index: number
  status?: number
  duration: number
  body?: string
  error?: string
}

/** API 并发测试结果 */
export interface ApiBatchResult {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
  total: number
  success: number
  failed: number
  totalDuration: number
  minDuration: number
  maxDuration: number
  avgDuration: number
  p50Duration: number
  p95Duration: number
  p99Duration: number
  qps: number
  statusDistribution: Record<number, number>
  items: ApiBatchItem[]
}

// ============================================================
// 可视化录制
// ============================================================

/** 录制步骤类型 */
export type RecordStepType = 'navigate' | 'click' | 'type' | 'wait' | 'screenshot' | 'scroll' | 'hover' | 'select' | 'press' | 'api'

/** 单个录制步骤 */
export interface RecordStep {
  id: string
  type: RecordStepType
  selector?: string
  selectorLabel?: string        // 用户可读的元素描述
  value?: string                // 输入值 / URL
  url?: string
  description: string
  timestamp: number
  // API 捕获字段
  apiMethod?: string            // GET/POST/PUT/DELETE
  apiUrl?: string               // 完整的请求 URL
  apiHeaders?: Record<string, string>
  apiBody?: string              // 请求体
  apiStatus?: number            // 响应状态码
  apiResponse?: string          // 响应体（截断）
}

/** 录制会话保存格式 */
export interface RecordSession {
  id: string
  name: string
  steps: RecordStep[]
  createdAt: string
  updatedAt: string
}

/** IPC 通道定义 */
export const IPC_CHANNELS = {
  RUN_TEST: 'test:run',
  RUN_SUITE: 'test:run-suite',
  GET_REPORTS: 'test:get-reports',
  GET_REPORT: 'test:get-report',
  SAVE_TEST_CASE: 'test:save-case',
  LOAD_TEST_CASES: 'test:load-cases',
  DELETE_TEST_CASE: 'test:delete-case',
  AI_ANALYZE: 'test:ai-analyze',
  AI_GENERATE_STEPS: 'test:ai-generate-steps',
  AI_GET_CONFIG: 'test:ai-get-config',
  AI_SAVE_CONFIG: 'test:ai-save-config',
  AI_TEST_CONNECTION: 'test:ai-test-connection',
  AI_CHAT: 'test:ai-chat',
  AI_CHAT_STREAM: 'test:ai-chat-stream',
  AI_CHAT_STREAM_TOKEN: 'test:ai-chat-stream-token',
  RUN_SCRIPT: 'script:run',
  CHECK_PYTHON: 'script:check-python',
  PARSE_SCRIPT_VARS: 'script:parse-vars',
  API_DEBUG: 'api:debug',
  // 自动更新
  UPDATE_GET_STATE: 'update:get-state',
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_INSTALL_LAN: 'update:install-lan',
  // 脚本扫描
  SCAN_SCRIPTS: 'script:scan',
  GET_SCRIPTS_PATH: 'script:get-path',
  STOP_SCRIPT: 'script:stop',
  // API 并发性能测试
  API_DEBUG_BATCH: 'api:debug-batch',
  // 文件操作（AI Agent 用）
  FILE_READ: 'file:read',
  FILE_WRITE: 'file:write',
  FILE_LIST: 'file:list',
  // 浏览器操作（AI Agent 用）
  BROWSER_OPEN: 'browser:open',
  BROWSER_READ: 'browser:read',
  BROWSER_CLICK: 'browser:click',
  BROWSER_TYPE: 'browser:type',
  BROWSER_SCREENSHOT: 'browser:screenshot',
  BROWSER_CLOSE: 'browser:close',
  // 可视化录制
  RECORDER_START: 'recorder:start',
  RECORDER_STOP: 'recorder:stop',
  RECORDER_PLAY: 'recorder:play',
  RECORDER_SCREENSHOT: 'recorder:screenshot',
  RECORDER_NAVIGATE: 'recorder:navigate',
  RECORDER_EVENT: 'recorder:event',
  RECORDER_API_EVENT: 'recorder:api-event',
  // API 录制（独立）
  APIRECORDER_START: 'apirecorder:start',
  APIRECORDER_STOP: 'apirecorder:stop',
  APIRECORDER_EVENT: 'apirecorder:event',
  APIRECORDER_CLEAR: 'apirecorder:clear',
  APIRECORDER_SAVE_TRACE: 'apirecorder:save-trace',
  APIRECORDER_IMPORT_TRACE: 'apirecorder:import-trace',
  APIRECORDER_PICK_FILE: 'apirecorder:pick-file',
  APIRECORDER_LIST_SYSTEMS: 'apirecorder:list-systems',
  RECORDER_SAVE_SESSION: 'recorder:save-session',
  RECORDER_LOAD_SESSIONS: 'recorder:load-sessions',
  RECORDER_DELETE_SESSION: 'recorder:delete-session',
} as const
