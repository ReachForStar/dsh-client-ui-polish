/**
 * Server-Sent Events bridge for SSH PTY frames. The official harness forwards
 * only the events in `@deepseek-ai/dsh-api-remotes`'s allowlist, which has no
 * `ssh/*` entry, so a plugin cannot read PTY output through `ctx.remote.$on`.
 * The host half re-publishes the in-process PTY events on this route instead.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the ssh/pty/* event declarations into the host program.
import type {} from '@reachforstar/dsh-host-ssh-remotes/types'
import { type SshPtyFrame } from './ssh-events-protocol.ts'

export { SSH_EVENTS_PATH, type SshPtyFrame } from './ssh-events-protocol.ts'

/**
 * Hold one SSE response open and forward every PTY output chunk and exit
 * report emitted while it is connected.
 * @param ctx - Host context that carries the ssh/pty events.
 * @param req - The stream request; its close ends the subscription.
 * @param res - The response, owned for the lifetime of the stream.
 */
export function handleSshEventsRequest(ctx: Context, req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    'connection': 'keep-alive',
    'x-accel-buffering': 'no',
  })
  res.flushHeaders()
  const send = (frame: SshPtyFrame): void => {
    res.write(`data: ${JSON.stringify(frame)}\n\n`)
  }
  const offOutput = ctx.on('ssh/pty/output', (event) => {
    send({ type: 'ssh/pty/output', ptyId: event.ptyId, data: event.data })
  })
  const offExit = ctx.on('ssh/pty/exit', (event) => {
    send({ type: 'ssh/pty/exit', ptyId: event.ptyId })
  })
  req.on('close', () => {
    offOutput()
    offExit()
    res.end()
  })
}
