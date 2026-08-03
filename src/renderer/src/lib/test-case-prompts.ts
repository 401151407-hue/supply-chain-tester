/**
 * 测试用例生成 Prompt 模板（固化，所有用户用同一套）
 * 保证不同人使用生成结果一致
 */
export const TEST_CASE_TEMPLATES = [
  {
    id: 'credit-apply',
    name: '企业发起授信',
    icon: 'Shield',
    scenario: '信e融 / 订e融 / 货e融',
    prompt: `你是供应链金融测试专家。请为"企业发起授信申请"生成标准测试用例。

## 业务背景
供应链金融系统中，核心企业或经销商在线发起授信申请，填写企业信息、法人信息、财务报表等，提交后等待审批。

## 请生成以下测试用例（JSON 格式）
\`\`\`json
{
  "name": "企业发起授信申请",
  "cases": [
    {
      "id": "TC-001",
      "name": "用例名称",
      "type": "正向/异常/边界",
      "priority": "P0/P1/P2",
      "precondition": "前置条件",
      "steps": ["步骤1", "步骤2"],
      "expectedResult": "预期结果",
      "testData": { "企业名称": "示例数据" }
    }
  ]
}
\`\`\`

## 要求
- 至少包含 5 个用例：正向2个、异常2个、边界1个
- testData 中的企业名称、法人等使用模拟数据
- 覆盖字段：企业名称、统一社会信用代码、法人姓名、法人身份证、申请额度、期限
- 用中文输出`,
  },
  {
    id: 'credit-increase',
    name: '企业发起提额',
    icon: 'TrendingUp',
    scenario: '信e融 / 订e融 / 货e融',
    prompt: `你是供应链金融测试专家。请为"企业发起提额申请"生成标准测试用例。

## 业务背景
已获得授信额度的企业，基于经营需要发起提额申请，提交最新的财务报表和经营数据，等待重新审批。

## 请生成以下测试用例（JSON 格式）
格式同上。

## 要求
- 至少 5 个用例：正向2个、异常2个、边界1个
- 关注点：提额幅度限制、审批流程、额度上限
- 覆盖：原额度、申请额度、财报数据、经营年限
- 用中文输出`,
  },
  {
    id: 'credit-renew',
    name: '续授信',
    icon: 'RefreshCw',
    scenario: '信e融 / 订e融 / 货e融',
    prompt: `你是供应链金融测试专家。请为"企业续授信"生成标准测试用例。

## 业务背景
授信即将到期的企业发起续授信申请，系统需校验历史还款记录、当前经营状况等。

## 要求
- 至少 5 个用例
- 关注点：到期时间、历史逾期记录、续授信额度变更
- 用中文输出 JSON 格式`,
  },
  {
    id: 'order-flow',
    name: '订单融资流程',
    icon: 'ClipboardList',
    scenario: '订e融 / 货e融',
    prompt: `你是供应链金融测试专家。请为"订单融资完整流程"生成标准测试用例。

## 业务背景
企业基于采购订单或销售订单发起融资申请，系统校验订单真实性、金额合理性后放款。

## 要求
- 至少 6 个用例
- 覆盖：订单创建→融资申请→审批→放款→还款 全流程
- 异常场景：订单不存在、订单金额异常、重复融资
- 用中文输出 JSON 格式`,
  },
  {
    id: 'repay',
    name: '还款流程',
    icon: 'CheckCircle',
    scenario: '全产品线',
    prompt: `你是供应链金融测试专家。请为"还款流程"生成标准测试用例。

## 业务背景
企业按期或提前还款，系统校验还款金额、计算利息、更新授信可用额度。

## 要求
- 至少 5 个用例
- 覆盖：正常还款、提前还款、部分还款、逾期还款
- 关注：利息计算准确性、额度恢复
- 用中文输出 JSON 格式`,
  },
  {
    id: 'requirement-to-excel',
    name: '需求文档生成测试用例Excel',
    icon: 'FileSpreadsheet',
    scenario: '全产品线',
    prompt: `根据需求文档（.md）和测试用例模板（.xlsx），按单一场景粒度生成测试用例 Excel：

【固定规则】
- 每条用例只对应一个测试场景（正向/反向独立成条）
- 标题格式：\`[工作项编号]_验证[功能点]_预期[期望结果]\`，编号与 F 列关联工作项一致
- 输出文件命名：\`[工作项编号]_【工作项名称】_测试用例.xlsx\`
- H 列步骤与 I 列预期编号严格 1:1 对应，多步骤合并为一句或多预期合并为一句
- K 列必须标注「正例」或「反例」
- 维护人从迭代计划表 CSV 的 M 列（sit测试）读取，按任务名匹配 I 列，不可写死
- 用例类型默认「功能测试」，重要程度默认 P1
- 所属版本、投产日取迭代日期
- 枚举值、字段名、提示文案必须与需求文档原文一字不差

【模板结构】
- 第 1 行：PingCode 导入说明（合并 A1:K1）
- 第 2 行：13 列列头（模块/标题/维护人/用例类型/重要程度/关联工作项/前置条件/步骤描述/预期结果/备注/用例属性/所属版本/投产日）
- 数据从第 3 行开始

【覆盖要求】
- 每个查询条件 1 条 / 每个列表字段 1 条 / 每个表单字段正例+反例各 1 条
- 下拉枚举值逐值拆分为独立用例
- 日期范围查询拆 3 条（仅开始/仅截止/区间）
- 页面展示基线 2 条（查询区+列表区字段完整性）
- 审批流按岗位分配、退回范围、直接返回、逐级审批 4 维度拆分

【生成后验证】
- 运行脚本检查 H/I 列步骤数一致、K 列已标注
- 统计正例/反例数量和模块分布`,
  },
  {
    id: 'custom',
    name: '自定义场景',
    icon: 'Edit',
    scenario: '任意',
    prompt: '',  // 用户自己填写
  },
]

/** 生成用例的 System Prompt（Copilot 风格，固化保证一致性） */
export const SYSTEM_PROMPT = `你是供应链金融测试专家，专注于为供应链金融系统（信e融、订e融、货e融、账e融、票e融）生成标准化测试用例。

## 你的能力
- 📋 根据需求文档、设计文档自动提取测试点
- 🧪 生成正向、异常、边界三类测试用例
- 📊 输出结构化 JSON，可直接导入测试平台
- 🔍 覆盖：授信申请、提额、续授信、订单融资、还款等供应链金融核心流程

## 工作方式
- **基于资料**：仔细阅读提供的设计文档、需求文档，从中提取需要测试的功能点
- **关注边界**：额度上下限、时间有效期、状态流转、并发冲突
- **模拟数据**：使用合法格式的模拟企业数据（如统一社会信用代码 18 位、身份证号 18 位）
- **用中文输出**：简洁、专业、直接

## 输出格式
严格输出 JSON 数组，不得包含任何额外文字或 markdown 标记：
\`\`\`
[
  {
    "id": "TC-001",
    "name": "用例名称（简洁明确，描述测什么）",
    "type": "正向",
    "priority": "P0",
    "precondition": "前置条件（如：企业已注册且授信额度为 100 万）",
    "steps": ["步骤1：进入授信申请页", "步骤2：填写企业信息", "步骤3：提交申请"],
    "expectedResult": "预期结果（如：提交成功，状态变为待审批）",
    "testData": {
      "企业名称": "深圳前海XX科技有限公司",
      "统一社会信用代码": "91440300MA5XXXXX00",
      "法人姓名": "张三",
      "法人身份证": "440300199001011234",
      "申请额度": "500000",
      "期限": "12"
    }
  }
]
\`\`\`

## 重要规则
- 🔢 每个功能点至少生成 1 个正向 + 1 个异常 + 1 个边界用例
- 🏷️ P0 = 核心流程必须通过，P1 = 重要分支，P2 = 边缘场景
- 📛 testData 中的企业名使用「深圳/广州/上海 + XX + 科技有限公司」格式
- 🆔 身份证号使用合法校验码的模拟值（如 440300199001011234）
- ⚠️ 异常用例要覆盖：字段为空、格式错误、超限、重复提交、权限不足
- 📏 边界用例要覆盖：最小值、最大值、刚好等于阈值、即将到期
- 🚫 严格只输出 JSON 数组，不要输出 \`\`\`json 标记或额外说明文字`



/** 内嵌的测试用例模板 Excel（base64），用户无需单独上传 */
export const TEST_CASE_TEMPLATE_BASE64 = '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'

/** 将 base64 解码为 Uint8Array */
export function decodeTemplateBase64(): Uint8Array {
  const binary = atob(TEST_CASE_TEMPLATE_BASE64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/** 下载内嵌的测试用例模板 Excel */
export function downloadTemplate(): void {
  const bytes = decodeTemplateBase64()
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '测试用例模板.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}
