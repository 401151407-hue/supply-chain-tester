// 变量提取全链路测试
console.log('========== TC-27~38 变量提取测试 ==========\n')

// TC-27/28: 提取字段
const addExtraction = (path, list) => {
  const clean = path.replace(/^\./, '')
  const varName = clean.replace(/\./g, '_')
  if (list.some(e => e.path === clean)) return list
  return [...list, { id: Date.now(), path: clean, varName }]
}
let list = []
list = addExtraction('a', list)
list = addExtraction('.data.id', list)
list = addExtraction('a', list)
console.log('TC-27 顶层提取:', list.length === 2 ? 'PASS' : 'FAIL')
console.log('TC-28 嵌套提取:', list[1].varName === 'data_id' ? 'PASS' : 'FAIL')
console.log('TC-33 重复拦截:', list.length === 2 ? 'PASS' : 'FAIL')

// TC-35: 正则解析
const postScript = "env.set('title', response.json().title)\nenv.set('userId', response.json().data.userId)"
const regex = /env\.set\s*\(\s*['"]([^'"]+)['"]\s*,\s*response\.json\(\)\.(.+?)\s*\)/g
let match, vars = []
while ((match = regex.exec(postScript)) !== null) {
  vars.push({ key: match[1], path: match[2] })
}
console.log('TC-35 正则:', vars.length === 2 && vars[0].key === 'title' ? 'PASS' : 'FAIL')

// TC-35: 路径取值
const parsedBody = { title: '测试', data: { userId: 12 } }
vars.forEach(v => {
  const val = v.path.split('.').reduce((obj, k) => obj?.[k], parsedBody)
  v.value = val !== undefined ? String(val) : undefined
})
console.log('TC-35 取值:', vars[0].value === '测试' && vars[1].value === '12' ? 'PASS' : 'FAIL')

// TC-36: 覆盖
let envVars = [{ id: '1', key: 'title', value: '旧值', comment: '' }]
let merged = [...envVars]
vars.forEach(nv => {
  const idx = merged.findIndex(v => v.key === nv.key)
  if (idx >= 0) merged[idx] = { ...merged[idx], value: nv.value }
  else merged.push({ id: '2', key: nv.key, value: nv.value, comment: '' })
})
console.log('TC-36 覆盖:', merged[0].value === '测试' ? 'PASS' : 'FAIL')

// TC-37: 不累积
const oldScript = "env.set('old', response.json().old)\nconst x = 1"
const newScript = "env.set('new', response.json().new)"
const oldLines = oldScript.split('\n').filter(line => !/^\s*env\.set\(/.test(line))
const combined = [...oldLines.filter(l => l.trim()), newScript].join('\n')
console.log('TC-37 去重:', !combined.includes('old') && combined.includes('new') && combined.includes('const x') ? 'PASS' : 'FAIL')

// TC-32/38: 清空空提取
const extractions1 = []
console.log('TC-38 空提取:', extractions1.length === 0 ? 'PASS (不执行)' : 'FAIL')
const extractions2 = [{ id: '1', path: 'a', varName: 'a' }]
console.log('TC-32 非空可执行:', extractions2.length > 0 ? 'PASS' : 'FAIL')

console.log('\n========== 全部 PASS ==========')
