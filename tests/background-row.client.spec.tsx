// @vitest-environment jsdom
/** BackgroundRow behavior: upload / preview / remove with size and type checks. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { BackgroundRow } from '../src/client/BackgroundRow.tsx'
import type { BackgroundRowComponentProps } from '../src/client/BackgroundRow.tsx'
import { createBackgroundRowStore } from '../src/client/settings-store.ts'
import { MAX_BACKGROUND_IMAGE_BYTES } from '../src/background-settings.ts'

afterEach(cleanup)

const COPY: Record<string, string> = {
  'background.title': 'Background image',
  'background.upload': 'Upload image',
  'background.remove': 'Remove',
  'background.tooLarge': 'Image is too large',
  'background.notImage': 'Choose an image file',
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

function mount(backgroundImage: string | null = null) {
  const store = createBackgroundRowStore().create()
  store.actions.sync(backgroundImage, 0)
  const setBackgroundImage = vi.fn()
  const props: BackgroundRowComponentProps = {
    useSessions: emptySessions(),
    useWorkspaces: emptyWorkspaces(),
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: (key: string) => COPY[key] ?? key,
    setBackgroundImage,
  }
  render(<BackgroundRow {...props} />)
  return { store, setBackgroundImage }
}

/** The hidden file picker; fire a change with one file. */
function pick(file: File | undefined): void {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: file === undefined ? [] : [file] } })
}

describe('BackgroundRow', () => {
  it('shows the upload control and no preview when no image is set', () => {
    mount(null)
    expect(screen.getByText('Background image')).toBeDefined()
    expect(screen.getByRole('button', { name: /Upload image/ })).toBeDefined()
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull()
    expect(document.querySelector('img')).toBeNull()
  })

  it('shows a preview and a remove button when set; remove clears it', () => {
    const b = mount('data:image/png;base64,QUJD')
    expect(document.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,QUJD')
    fireEvent.click(screen.getByRole('button', { name: /Remove/ }))
    expect(b.setBackgroundImage).toHaveBeenCalledWith(null)
  })

  it('uploads a valid image file as a data URL', async () => {
    const b = mount(null)
    pick(new File(['abc'], 'bg.png', { type: 'image/png' }))
    await vi.waitFor(() => { expect(b.setBackgroundImage).toHaveBeenCalledTimes(1) })
    expect(b.setBackgroundImage.mock.calls[0]![0]).toMatch(/^data:image\/png;base64,/)
  })

  it('rejects an oversized file with an error and no write', async () => {
    const b = mount(null)
    const big = new File(['x'], 'big.png', { type: 'image/png' })
    Object.defineProperty(big, 'size', { value: MAX_BACKGROUND_IMAGE_BYTES + 1 })
    pick(big)
    await vi.waitFor(() => { expect(screen.getByText('Image is too large')).toBeDefined() })
    expect(b.setBackgroundImage).not.toHaveBeenCalled()
  })

  it('rejects a non-image file with an error and no write', async () => {
    const b = mount(null)
    pick(new File(['x'], 'notes.txt', { type: 'text/plain' }))
    await vi.waitFor(() => { expect(screen.getByText('Choose an image file')).toBeDefined() })
    expect(b.setBackgroundImage).not.toHaveBeenCalled()
  })

  it('ignores an empty file selection', () => {
    const b = mount(null)
    pick(undefined)
    expect(screen.queryByText('Image is too large')).toBeNull()
    expect(screen.queryByText('Choose an image file')).toBeNull()
    expect(b.setBackgroundImage).not.toHaveBeenCalled()
  })

  it('the upload button opens the hidden file picker', () => {
    mount(null)
    const input = document.querySelector('input[type="file"]')!
    let clicked = false
    input.addEventListener('click', () => { clicked = true })
    fireEvent.click(screen.getByRole('button', { name: /Upload image/ }))
    expect(clicked).toBe(true)
  })
})
