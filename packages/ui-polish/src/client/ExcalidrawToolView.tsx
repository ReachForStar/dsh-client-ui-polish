// Excalidraw tool call view: a dedicated card for `excalidraw_draw` /
// `excalidraw_write` / `excalidraw_export` that renders the call's title, a
// short argument summary, and an inline SVG thumbnail of the resulting scene.
// The canvas itself is the `excalidraw` conversation view tab; a tool view
// cannot select that tab because the published Tool owner props carry no
// view-selection callback.

import { IconInspectOutlineRegular, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ExcalidrawToolView.module.css'

/** Full component props: the keyed toolview payload plus the ui-polish locale seat. */
export type ExcalidrawToolViewProps = ToolCallViewProps & PropsLocale<'ui-polish'>

/** Locale key for the per-tool title, falling back to a generic label. */
function titleKeyOf(toolName: string): 'excalidraw.drawTitle' | 'excalidraw.writeTitle' | 'excalidraw.exportTitle' {
  if (toolName === 'excalidraw_write') return 'excalidraw.writeTitle'
  if (toolName === 'excalidraw_export') return 'excalidraw.exportTitle'
  return 'excalidraw.drawTitle'
}

/** Extract the preview SVG string from a tool result's `meta` payload, if present. */
function previewSvgOf(meta: unknown): string | null {
  if (typeof meta !== 'object' || meta === null) return null
  const svg = (meta as Record<string, unknown>)['previewSvg']
  return typeof svg === 'string' ? svg : null
}

/**
  * Build a short argument summary for the running/start card.
  * @param t - the ui-polish dictionary seat.
  * @param toolName - the called Excalidraw tool.
  * @param argsRaw - the call's raw JSON arguments.
  * @returns the localized summary, or an empty string for unparseable drawings.
  */
function argsSummary(t: ExcalidrawToolViewProps['t'], toolName: string, argsRaw: string): string {
  if (toolName === 'excalidraw_write') {
    return t('excalidraw.argsChars', { count: argsRaw.length })
  }
  try {
    const parsed = JSON.parse(argsRaw) as { elements?: unknown[] }
    return t('excalidraw.argsShapes', { count: parsed.elements?.length ?? 0 })
  } catch {
    return ''
  }
}

/**
 * Render one Excalidraw tool call as a dedicated card with an optional SVG
 * thumbnail of the scene it produced.
 * @param props - keyed toolview payload plus the ui-polish locale seat.
 * @returns the dedicated Excalidraw tool card.
 */
export function ExcalidrawToolView(props: ExcalidrawToolViewProps) {
  const { phase, block, toolName, t } = props

  const titleKey = titleKeyOf(toolName)
  const previewSvg = phase === 'result' ? previewSvgOf(block.meta) : null

  if (phase === 'preparing') {
    return (
      <div className={css.card} data-tool={toolName} data-state="preparing">
        <div className={css.row}>
          <span className={css.leading}><IconInspectOutlineRegular size={14} /></span>
          <TextShimmer active>
            <span className={css.title}>{t(titleKey)}</span>
          </TextShimmer>
        </div>
      </div>
    )
  }

  if (phase === 'start') {
    const summary = argsSummary(t, toolName, block.argsRaw)
    return (
      <div className={css.card} data-tool={toolName} data-state="running">
        <div className={css.row}>
          <span className={css.leading}><IconInspectOutlineRegular size={14} /></span>
          <TextShimmer active>
            <span className={css.title}>{t(titleKey)}</span>
            {summary !== '' && <span className={css.summary}> · {summary}</span>}
          </TextShimmer>
        </div>
      </div>
    )
  }

  // phase === 'result'
  const errorSummary = block.isError ? t('excalidraw.toolFailed') : null
  return (
    <div className={css.card} data-tool={toolName} data-state={block.isError ? 'error' : 'ok'}>
      <div className={css.row}>
        <span className={css.leading}><IconInspectOutlineRegular size={14} /></span>
        <span className={css.title}>{t(titleKey)}</span>
        {errorSummary !== null && <span className={`${css.summary} ${css.errorSummary}`}>{errorSummary}</span>}
      </div>
      {previewSvg !== null && (
        <img
          className={css.preview}
          src={`data:image/svg+xml;utf8,${encodeURIComponent(previewSvg)}`}
          alt=""
        />
      )}
    </div>
  )
}
