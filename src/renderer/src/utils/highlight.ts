/** 对 Python 脚本输出文本做变量高亮，返回 HTML 字符串 */

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// 内联样式
const S = {
  danger: 'color:#f87171;font-weight:600',
  muted: 'color:rgba(255,255,255,0.25)',
  accent: 'color:#fbbf24;font-weight:600',
  valGold: 'color:#fbbf24;font-weight:700;background:rgba(251,191,36,0.15);padding:1px 3px;border-radius:3px',
}

export function highlightOutput(text: string, _knownVarKeys: string[] = [], knownVarValues: string[] = []): string {
  const lines = text.split('\n')
  const out: string[] = []

  const valueSet = new Set(knownVarValues.filter(v => v && v.length >= 2))

  for (const line of lines) {
    // 1. 错误行
    if (/^[❌⏹]/.test(line.trim())) {
      out.push(`<span style="${S.danger}">${esc(line)}</span>`)
      continue
    }

    // 2. 分隔线
    if (/^─{10,}$/.test(line.trim())) {
      out.push(`<span style="${S.muted}">${esc(line)}</span>`)
      continue
    }

    // 3. 环境标记
    const envMatch = line.match(/^(\s*>>>\s*.+)$/)
    if (envMatch) {
      out.push(`<span style="${S.accent}">${esc(line)}</span>`)
      continue
    }

    // 4. !! 或 ！！强制高亮标记
    if (line.startsWith('!!') || line.startsWith('！！')) {
      // !!- 前缀：注入但不显示
      if (line.match(/^[!！]{2}-/)) continue
      const rest = line.replace(/^\s*[!！]{2}\s*/, '')
      const kv2 = rest.match(/^([^:：\n]+)([：:])\s*(.+)$/)
      if (kv2) {
        out.push(
          `${esc(kv2[1])}${esc(kv2[2])} <span style="${S.valGold}">${esc(kv2[3])}</span>`
        )
      } else if (valueSet.size > 0) {
        // 高亮匹配到的具体变量值
        let html = esc(rest)
        for (const v of valueSet) {
          const ev = esc(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          html = html.replace(new RegExp(ev, 'g'), `<span style="${S.valGold}">${esc(v)}</span>`)
        }
        out.push(html)
      } else {
        // 没有已知变量值时，正常显示，不高亮整行
        out.push(esc(rest))
      }
      continue
    }

    // 5. 普通行
    out.push(esc(line))
  }

  return out.join('\n')
}
