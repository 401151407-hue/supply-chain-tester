/**
 * 全局状态管理 (Zustand)
 */
import { create } from 'zustand'
import type { TestCase, TestReport, StepResult, AIConfig, AIGeneratedStep } from '@shared/types'

interface AppState {
  // 主题
  theme: 'light' | 'dark'
  toggleTheme: () => void

  // 环境配置
  env: 'SIT' | 'UAT' | 'DEV'
  setEnv: (env: 'SIT' | 'UAT' | 'DEV') => void

  // 导航
  activeTab: 'xinerong' | 'dingerong' | 'huoerong' | 'zhangerong' | 'piaoerong' | 'editor' | 'reports' | 'apidebug' | 'script' | 'aiassistant' | 'utils'
  setActiveTab: (tab: AppState['activeTab']) => void
  navKey: number  // 每次导航递增，触发页面切换动画
  navigateTo: (tab: AppState['activeTab'], sub?: string | null) => void

  // 动态子产品选择（用于扫描发现的新子产品，如 货e融/测试专用）
  selectedSubProduct: string | null
  setSelectedSubProduct: (sub: string | null) => void

  // 脚本运行参数
  scriptParams: { product: string; subProduct: string; scriptName: string; scriptPath: string; vars: Record<string, string> } | null
  openScript: (product: string, subProduct: string, scriptName: string, scriptPath: string, vars?: Record<string, string>) => void

  // 脚本运行状态（key 为 scriptPath，跨 tab 持久化）
  scriptRunStates: Record<string, { output: string; isRunning: boolean; hasRun: boolean }>
  setScriptRunState: (scriptPath: string, state: Partial<{ output: string; isRunning: boolean; hasRun: boolean }>) => void
  clearScriptRunState: (scriptPath: string) => void

  // 测试用例
  testCases: TestCase[]
  currentCase: TestCase | null
  setTestCases: (cases: TestCase[]) => void
  setCurrentCase: (tc: TestCase | null) => void
  saveCurrentCase: () => Promise<void>
  deleteCase: (id: string) => Promise<void>

  // 执行状态
  isRunning: boolean
  currentReport: TestReport | null
  liveResults: StepResult[]
  setIsRunning: (v: boolean) => void
  setCurrentReport: (r: TestReport | null) => void
  setLiveResults: (r: StepResult[]) => void

  // 报告
  reports: TestReport[]
  setReports: (r: TestReport[]) => void

  // AI 配置
  aiConfig: AIConfig | null
  setAIConfig: (c: AIConfig) => void
  loadAIConfig: () => Promise<void>
  saveAIConfig: (c: AIConfig) => Promise<void>

  // AI 生成状态
  isAiGenerating: boolean
  setIsAiGenerating: (v: boolean) => void
}

const api = () => (window as any).supplyChainTester

export const useAppStore = create<AppState>((set, get) => ({
  // 主题 — 从 localStorage 读取初始值
  theme: ((typeof window !== 'undefined' && localStorage.getItem('theme')) || 'dark') as 'light' | 'dark',
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('theme', next)
    set({ theme: next })
  },

  // 环境配置
  env: ((typeof window !== 'undefined' && localStorage.getItem('env')) || 'UAT') as 'SIT' | 'UAT' | 'DEV',
  setEnv: (env) => {
    localStorage.setItem('env', env)
    set({ env })
  },

  // 导航
  activeTab: 'editor',
  setActiveTab: (tab) => set({ activeTab: tab }),

  navKey: 0,
  navigateTo: (tab, sub) => set(s => ({
    navKey: s.navKey + 1,
    activeTab: tab,
    selectedSubProduct: sub ?? null,
  })),

  selectedSubProduct: null,
  setSelectedSubProduct: (sub) => set({ selectedSubProduct: sub }),

  // 脚本参数
  scriptParams: null,
  openScript: (product, subProduct, scriptName, scriptPath, vars = {}) => set({
    activeTab: 'script',
    scriptParams: { product, subProduct, scriptName, scriptPath, vars },
  }),

  // 脚本运行状态（跨 tab 持久化，key 为 scriptPath）
  scriptRunStates: {},
  setScriptRunState: (scriptPath, state) => set(s => ({
    scriptRunStates: {
      ...s.scriptRunStates,
      [scriptPath]: {
        output: '',
        isRunning: false,
        hasRun: false,
        ...s.scriptRunStates[scriptPath],
        ...state,
      },
    },
  })),
  clearScriptRunState: (scriptPath) => set(s => {
    const { [scriptPath]: _, ...rest } = s.scriptRunStates
    return { scriptRunStates: rest }
  }),
  clearAllScriptRunStates: () => set({ scriptRunStates: {} }),

  // 测试用例
  testCases: [],
  currentCase: null,
  setTestCases: (cases) => set({ testCases: cases }),
  setCurrentCase: (tc) => set({ currentCase: tc }),
  saveCurrentCase: async () => {
    const tc = get().currentCase
    if (!tc) return
    await api().saveTestCase(tc)
    const cases = await api().loadTestCases()
    set({ testCases: cases })
  },
  deleteCase: async (id) => {
    await api().deleteTestCase(id)
    const cases = await api().loadTestCases()
    set({ testCases: cases, currentCase: null })
  },

  // 执行状态
  isRunning: false,
  currentReport: null,
  liveResults: [],
  setIsRunning: (v) => set({ isRunning: v }),
  setCurrentReport: (r) => set({ currentReport: r }),
  setLiveResults: (r) => set({ liveResults: r }),

  // 报告
  reports: [],
  setReports: (r) => set({ reports: r }),

  // AI 配置
  aiConfig: null,
  setAIConfig: (c) => set({ aiConfig: c }),
  loadAIConfig: async () => {
    try {
      const config = await api().getAIConfig()
      set({ aiConfig: config })
    } catch (err) {
      console.error('加载 AI 配置失败:', err)
    }
  },
  saveAIConfig: async (c) => {
    await api().saveAIConfig(c)
    set({ aiConfig: c })
  },

  // AI 生成状态
  isAiGenerating: false,
  setIsAiGenerating: (v) => set({ isAiGenerating: v }),
}))
