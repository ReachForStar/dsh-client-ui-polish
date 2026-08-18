// Floating file-mutation diff panel: a composer.dock contribution pinned to the
// right edge (position:fixed) that shows the latest file modification which
// settles while the session is being viewed. History is absorbed on load so a
// reopened session stays quiet; each new write/edit that lands an applied diff
// replaces the panel's content. This is the plugin-owned stand-in for the core
// details panel, which a standalone plugin cannot drive.

import { useEffect, useRef, useState } from 'react'
import { DiffBlock, IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { settledDiffCalls } from './settled-diffs.ts'
import css from './MutationDiffPanel.module.css'

/** Full component props: session runtime share + the ui-polish locale seat. */
export type MutationDiffPanelProps = PropsRuntime<'conversation.composer.dock'> & PropsLocale<'ui-polish'>

/** One shown mutation: the applied hunks plus the tool name for the header. */
interface ShownMutation {
  callId: string
  name: string
  diffs: import('@deepseek-ai/dsh-client-ui-primitives').DiffHunk[]
}

/** Equality over the settled-call identity list: re-render only on set changes. */
function sameCalls(
  a: ReturnType<typeof settledDiffCalls>,
  b: ReturnType<typeof settledDiffCalls>,
): boolean {
  return a.length === b.length
    && a.every((call, i) => call.callId === b[i]!.callId && call.name === b[i]!.name)
}

/**
 * Render the floating mutation-diff panel.
 * @param props - composed slot props.
 * @returns the panel element tree, or nothing until a mutation settles in-view.
 */
export function MutationDiffPanel({ useSession, sessionId, t }: MutationDiffPanelProps) {
  const calls = useSession(s => settledDiffCalls(s), sameCalls)
  const [shown, setShown] = useState<ShownMutation | null>(null)
  const seenRef = useRef<{ session: SessionId; seen: Set<string> } | null>(null)
  useEffect(() => {
    const current = seenRef.current
    if (current === null || current.session !== sessionId) {
      // Fresh session (or history still landing): absorb existing mutations.
      seenRef.current = { session: sessionId, seen: new Set(calls.map(call => call.callId)) }
      return
    }
    const fresh = calls.filter(call => !current.seen.has(call.callId))
    if (fresh.length === 0) return
    for (const call of fresh) current.seen.add(call.callId)
    const latest = fresh[fresh.length - 1]!
    setShown({ callId: latest.callId, name: latest.name, diffs: latest.diffs })
  }, [calls, sessionId])

  if (shown === null) return null
  return (
    <div className={css.root} role="region" aria-label={t('diff.title')} data-ui-polish-diff="">
      <div className={css.header}>
        <span className={css.title}>{t('diff.title')} · {shown.name}</span>
        <button
          type="button" className={css.close} aria-label={t('diff.close')}
          onClick={() => { setShown(null) }}
        >
          <IconCloseOutline16 size={12} />
        </button>
      </div>
      <DiffBlock diffs={shown.diffs} className={css.body} />
    </div>
  )
}
