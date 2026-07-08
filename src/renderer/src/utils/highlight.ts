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

export function highlightOutput(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []

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

    // 4. !!- 前缀：注入但不显示（兼容旧脚本）
    if (line.match(/^[!！]{2}-/)) continue

    // 5. 高亮行中 !!...!! 包裹的内容
    let processed = esc(line)
    processed = processed.replace(
      /[!！]{2}(.+?)[!！]{2}/g,
      `<span style="${S.valGold}">$1</span>`
    )
    out.push(processed)
  }

  return out.join('\n')
}
