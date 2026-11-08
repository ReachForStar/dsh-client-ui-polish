/**
 * Wire format shared by the host-side PTY event route and the browser half.
 * It stays free of `node:http` so the client program can import it.
 */

/** Route path of the PTY event stream. */
export const SSH_EVENTS_PATH = '/ssh-events'

/** One frame of the PTY event stream. */
export type SshPtyFrame =
  | { type: 'ssh/pty/output'; ptyId: string; data: string }
  | { type: 'ssh/pty/exit'; ptyId: string }
