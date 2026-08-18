// @vitest-environment jsdom
/** ui-polish apply wiring: dictionaries, declaration-aware registrations, the
 * background row's inject → runtime → store projection, and teardown. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { SettingsScopeBinder } from '@deepseek-ai/dsh-client-ui-settings/client'
import { apply, inject, NS } from '@deepseek-ai/dsh-client-ui-polish/client'
import type { BackgroundRowInjected } from '@deepseek-ai/dsh-client-ui-polish/client'
import { BACKGROUND_SETTINGS_NAMESPACE, PolishSettingsSchema } from '../src/background-settings.ts'
import { BackgroundRow } from '../src/client/BackgroundRow.tsx'
import { StatsFloat } from '../src/client/StatsFloat.tsx'
import { MutationDiffPanel } from '../src/client/MutationDiffPanel.tsx'
import type { createBackgroundRowStore } from '../src/client/settings-store.ts'

const GENERAL = 'settings.general.item'
const DOCK = 'conversation.composer.dock'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  let backgroundImage: string | undefined
  const namespace = () => ({
    ns: BACKGROUND_SETTINGS_NAMESPACE,
    schema: PolishSettingsSchema.toJSON(),
    value: backgroundImage === undefined ? {} : { backgroundImage },
    applies: 'live' as const,
    secrets: [],
    revision: 0,
  })
  const describe = vi.fn(() => Promise.resolve({
    rpcId: 'polish-describe' as never,
    result: { ok: true as const, value: { writable: true, hasDocument: true, namespaces: [namespace()] } },
  }))
  const mutate = vi.fn((request: { ops: { value: unknown }[] }) => {
    backgroundImage = request.ops[0]!.value === null ? undefined : String(request.ops[0]!.value)
    return Promise.resolve({ rpcId: 'polish-mutate' as never, result: { ok: true as const, value: namespace() } })
  })
  ctx.provide('connection', { api: { settings: { describe, mutate } }, isLoopback: true } as never)
  new TestRemote(ctx)
  await ctx.plugin(SettingsScopeBinder).await()
  const slots = ctx.get('slots') as SlotRegistry
  slots.register(
    { name: 'root', children: { [GENERAL]: { kind: 'list', scope: 'root' }, [DOCK]: { kind: 'list', scope: 'session' } } } as never,
    () => null,
  )
  return { ctx, slots, locale }
}

afterEach(() => {
  document.head.querySelectorAll('style[data-ui-polish-ambient]').forEach((node) => { node.remove() })
  document.body.removeAttribute('data-ds-bg-image')
  document.body.removeAttribute('style')
})

describe('ui-polish apply', () => {
  it('declares the required services', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection', 'remote', 'settingsScope'])
  })

  it('registers the background row and both dock entries, and unwinds on dispose', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(GENERAL).map(e => e.options.id)).toEqual(['polish-background'])
    expect(b.slots.entries(DOCK).map(e => e.options.id)).toEqual(['polish-stats', 'polish-diff'])
    expect(b.slots.entries(GENERAL).find(e => e.component === BackgroundRow)!.locale).toBe(NS)
    expect(b.slots.entries(DOCK).find(e => e.component === StatsFloat)!.locale).toBe(NS)
    expect(b.slots.entries(DOCK).find(e => e.component === MutationDiffPanel)!.locale).toBe(NS)
    expect(document.head.querySelector('style[data-ui-polish-ambient]')).not.toBeNull()
    await fiber.dispose()
    expect(b.slots.entries(GENERAL)).toHaveLength(0)
    expect(b.slots.entries(DOCK)).toHaveLength(0)
    expect(document.head.querySelector('style[data-ui-polish-ambient]')).toBeNull()
  })

  it('the background row inject writes through the runtime and syncs the store', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const entry = b.slots.entries(GENERAL).find(e => e.component === BackgroundRow)!
    const handle = entry.store as ReturnType<typeof createBackgroundRowStore>
    const instance = handle.create()
    const face = (entry.inject as unknown as (a: typeof instance.actions) => BackgroundRowInjected)(instance.actions)
    face.setBackgroundImage('data:image/png;base64,QUJD')
    await vi.waitFor(() => { expect(instance.getSnapshot().backgroundImage).toBe('data:image/png;base64,QUJD') })
    await fiber.dispose()
    expect(document.body.hasAttribute('data-ds-bg-image')).toBe(false)
  })
})
