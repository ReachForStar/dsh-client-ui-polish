// Shared git-panel HTTP client: plain fetch helpers for the /git/* routes.
// Used by both the Git view tab and the file view tab.

/** Query-encode the cwd into a `/git` URL. */
export function gitUrl(path: string, cwd: string, params?: Record<string, string>): string {
  const search = new URLSearchParams({ cwd, ...params })
  return `${path}?${search.toString()}`
}

/** Fetch JSON from a git panel endpoint, throwing on HTTP or body errors. */
export async function gitFetch<T>(path: string, cwd: string, init?: RequestInit): Promise<T> {
  const body = init?.body
  const response = await fetch(gitUrl(path, cwd), {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
    ...typeof body === 'string' ? { body: JSON.stringify({ ...JSON.parse(body), cwd }) } : {},
  })
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : `git panel: HTTP ${response.status}`)
  }
  return payload as unknown as T
}
