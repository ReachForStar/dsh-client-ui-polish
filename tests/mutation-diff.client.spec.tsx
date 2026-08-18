// @vitest-environment jsdom
/** MutationDiffPanel: history absorption, showing newly settled mutations, and the close button. */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import {
  createSnapshotStore, type ConversationSnapshot, type SessionId,
  type SessionListState, type ToolResultNode, type WorkspaceListState,
} from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { MutationDiffPanel, type MutationDiffPanelProps } from '../src/client/MutationDiffPanel.tsx'
import { zh } from '../src/client/locales.ts'

const SID = 's1' as SessionId
const t = makeTranslate(zh, commonZh)

function diffResult(callId: string, name = 'write'): ToolResultNode {
  return {
    kind: 'tool-result', seq: 1, time: 1_000, callId,
    call: { name, argsRaw: '{}' }, callTime: 500,
    content: [], isError: false, callView: null,
    resultView: { card: 'diff', title: 'Write', diffs: [{ path: 'a.txt', oldText: null, newText: 'x' }] },
    subCalls: [],
  }
}

function makeSource(initial: readonly unknown[] = []) {
  let roots = [...initial]
  const nodes = {
    values: () => roots.map((root, index) => ({
      key: `t:${index}`, id: String(index), target: 'chat', kind: 'tool-call',
      anchorSeq: index, location: { kind: 'session' }, visibility: 'visible',
      data: { root },
    })),
  }
  let snap = { sessionId: SID, chat: { nodes } } as unknown as ConversationSnapshot
  const subs = new Set<() => void>()
  return {
    set: (next: readonly unknown[]): void => {
      roots = [...next]
      snap = { sessionId: SID, chat: { nodes } } as unknown as ConversationSnapshot
      for (const fn of [...subs]) fn()
    },
    source: {
      getSnapshot: () => snap,
      subscribe: (fn: () => void): (() => void) => { subs.add(fn); return () => subs.delete(fn) },
    },
  }
}

function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  return bindSnapshotSelector(store)
}
function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceListState>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined,
  })
  return bindSnapshotSelector(store)
}

function props(
  source: { getSnapshot(): ConversationSnapshot; subscribe(fn: () => void): () => void },
): MutationDiffPanelProps {
  return {
    useSession: bindSnapshotSelector(source),
    sessionId: SID,
    useProjection: (() => undefined),
    useInput: (() => undefined) as never,
    inputActions: {} as never,
    useSessions: emptySessions(),
    useWorkspaces: emptyWorkspaces(),
    t,
    session: {} as ConversationSnapshot,
    input: {} as never,
  }
}

afterEach(cleanup)

describe('MutationDiffPanel', () => {
  it('absorbs mutations present at open and renders nothing', () => {
    const { source } = makeSource([diffResult('w')])
    const view = render(<MutationDiffPanel {...props(source)} />)
    expect(view.container.querySelector('[role="region"]')).toBeNull()
  })

  it('shows a mutation that settles after open, with a close button', () => {
    const h = makeSource()
    const view = render(<MutationDiffPanel {...props(h.source)} />)
    expect(view.container.querySelector('[role="region"]')).toBeNull()
    act(() => { h.set([diffResult('w', 'write')]) })
    const region = view.container.querySelector('[role="region"]')
    expect(region).not.toBeNull()
    expect(region?.textContent).toContain('文件修改')
    expect(region?.textContent).toContain('write')
    fireEvent.click(view.getByRole('button', { name: '关闭' }))
    expect(view.container.querySelector('[role="region"]')).toBeNull()
  })

  it('replaces the panel with a later mutation', () => {
    const h = makeSource()
    const view = render(<MutationDiffPanel {...props(h.source)} />)
    act(() => { h.set([diffResult('a', 'write')]) })
    expect(view.container.querySelector('[role="region"]')?.textContent).toContain('write')
    act(() => { h.set([diffResult('a', 'write'), diffResult('b', 'edit')]) })
    expect(view.container.querySelector('[role="region"]')?.textContent).toContain('edit')
  })

  it('stays quiet when a window change carries no new mutation', () => {
    const h = makeSource([diffResult('a', 'write')])
    const view = render(<MutationDiffPanel {...props(h.source)} />)
    // The seeded mutation is removed: the effect re-runs with no fresh calls.
    act(() => { h.set([]) })
    expect(view.container.querySelector('[role="region"]')).toBeNull()
  })
})
