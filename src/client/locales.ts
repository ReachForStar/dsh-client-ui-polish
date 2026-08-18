/** `ui-polish` namespace dictionaries (stats float, background row, diff panel). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  // Stats float groups (mirrors the conversation namespace's stats labels).
  'stats.counts': '{turns} 轮 · {steps} 步',
  'stats.llm': 'LLM {duration}',
  'stats.toolCall': '工具调用 {duration}',
  'stats.ttftAverage': '首 token 平均 {duration}',
  'stats.tokensPerSecond': '{throughput} tok/s',
  'stats.cacheHit': '缓存命中 {percent}%',
  'stats.tokens': '输入 {input} tok · 输出 {output} tok',
  'stats.cost': '费用 {cost}',
  'stats.costDetail': '输入 {input} · 缓存命中 {cache} · 输出 {output}',
  'stats.costModels': '模型 {models}',
  // Background image row.
  'background.title': '背景图片',
  'background.upload': '上传图片',
  'background.remove': '移除',
  'background.tooLarge': '图片过大，请选择不超过 2MB 的图片',
  'background.notImage': '请选择图片文件',
  // Floating mutation-diff panel.
  'diff.title': '文件修改',
  'diff.close': '关闭',
} satisfies Record<string, string>

/** The ui-polish namespace key union. */
export type PolishKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'stats.counts': '{turns} turns · {steps} steps',
  'stats.llm': 'LLM {duration}',
  'stats.toolCall': 'Tool call {duration}',
  'stats.ttftAverage': 'TTFT avg {duration}',
  'stats.tokensPerSecond': '{throughput} tok/s',
  'stats.cacheHit': 'Cache hit {percent}%',
  'stats.tokens': 'Input {input} tok · Output {output} tok',
  'stats.cost': 'Cost {cost}',
  'stats.costDetail': 'Input {input} · Cache hit {cache} · Output {output}',
  'stats.costModels': 'Models {models}',
  'background.title': 'Background image',
  'background.upload': 'Upload image',
  'background.remove': 'Remove',
  'background.tooLarge': 'Image is too large; choose one under 2MB',
  'background.notImage': 'Choose an image file',
  'diff.title': 'File changes',
  'diff.close': 'Close',
} satisfies Record<PolishKey, string>
