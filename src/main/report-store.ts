/**
 * 报告与测试用例持久化存储
 * 使用本地 JSON 文件存储
 */
import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import type { TestReport, TestCase, AIConfig } from '../shared/types'

export class ReportStore {
  private get dataDir(): string {
    const dir = join(app.getPath('userData'), 'supply-chain-data')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return dir
  }

  private get reportsPath(): string {
    return join(this.dataDir, 'reports.json')
  }

  private get casesPath(): string {
    return join(this.dataDir, 'test-cases.json')
  }

  private get aiConfigPath(): string {
    return join(this.dataDir, 'ai-config.json')
  }

  // ---- 报告 ----

  getAll(): TestReport[] {
    return this.readJson<TestReport[]>(this.reportsPath, [])
  }

  get(id: string): TestReport | null {
    const all = this.getAll()
    return all.find(r => r.id === id) || null
  }

  save(report: TestReport): void {
    const all = this.getAll()
    const idx = all.findIndex(r => r.id === report.id)
    if (idx >= 0) {
      all[idx] = report
    } else {
      all.unshift(report)
      if (all.length > 200) all.length = 200 // 最多保留 200 条
    }
    this.writeJson(this.reportsPath, all)
  }

  // ---- 测试用例 ----

  saveCase(testCase: TestCase): void {
    const all = this.loadCases()
    const idx = all.findIndex(c => c.id === testCase.id)
    const now = new Date().toISOString()
    const saved = {
      ...testCase,
      updatedAt: now,
      createdAt: testCase.createdAt || now,
    }
    if (idx >= 0) {
      all[idx] = saved
    } else {
      all.push(saved)
    }
    this.writeJson(this.casesPath, all)
  }

  loadCases(): TestCase[] {
    return this.readJson<TestCase[]>(this.casesPath, [])
  }

  deleteCase(id: string): void {
    const all = this.loadCases().filter(c => c.id !== id)
    this.writeJson(this.casesPath, all)
  }

  // ---- AI 配置 ----

  getAIConfig(): AIConfig | null {
    return this.readJson<AIConfig | null>(this.aiConfigPath, null)
  }

  saveAIConfig(config: AIConfig): void {
    this.writeJson(this.aiConfigPath, config)
  }

  // ---- 工具 ----

  private readJson<T>(filePath: string, fallback: T): T {
    try {
      if (existsSync(filePath)) {
        return JSON.parse(readFileSync(filePath, 'utf-8'))
      }
    } catch {
      // 文件损坏时返回默认值
    }
    return fallback
  }

  private writeJson(filePath: string, data: unknown): void {
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  }
}
