/** Git panel host service: route dispatch, body parsing, and path validation. */
import { describe, expect, it } from 'vitest'
import { handleGitRequest } from '../src/git-service.ts'

/** In-memory response double capturing status and JSON body (getters are live). */
function responseDouble() {
  let statusCode = 0
  let body = ''
  return {
    res: {
      writeHead(status: number) { statusCode = status },
      end(payload: string) { body = payload },
    },
    get status(): number { return statusCode },
    get body(): Record<string, unknown> { return JSON.parse(body) },
  }
}

/** Minimal request double: URL + method + optional JSON body. */
function requestDouble(path: string, method: string, body?: unknown) {
  return {
    url: path,
    method,
    on(event: 'data' | 'end' | 'error', fn: (chunk?: Buffer) => void) {
      if (event === 'data' && body !== undefined) fn(Buffer.from(JSON.stringify(body)))
      if (event === 'end') fn()
    },
  }
}

describe('git panel host service', () => {
  it('rejects unknown routes with 404', async () => {
    const double = responseDouble()
    await handleGitRequest(process.cwd(), requestDouble('/git/nope', 'GET') as never, double.res as never)
    expect(double.status).toBe(404)
    expect(double.body.error).toContain('unknown route')
  })

  it('rejects a non-object JSON body', async () => {
    const double = responseDouble()
    const req = {
      url: '/git/commit',
      method: 'POST',
      on(event: 'data' | 'end', fn: (chunk?: Buffer) => void) {
        if (event === 'data') fn(Buffer.from('[1,2]'))
        if (event === 'end') fn()
      },
    }
    await handleGitRequest(process.cwd(), req as never, double.res as never)
    expect(double.status).toBe(500)
    expect(double.body.error).toContain('JSON body must be an object')
  })

  it('rejects commit messages that are not strings', async () => {
    const double = responseDouble()
    await handleGitRequest(
      process.cwd(),
      requestDouble('/git/commit', 'POST', { message: 42 }) as never,
      double.res as never,
    )
    expect(double.status).toBe(500)
    expect(double.body.error).toContain('non-empty string')
  })

  it('rejects diff paths that escape the repository', async () => {
    for (const bad of ['../outside', '/etc/passwd', 'sub\\..\\escape']) {
      const double = responseDouble()
      await handleGitRequest(
        process.cwd(),
        requestDouble('/git/diff', 'POST', { path: bad }) as never,
        double.res as never,
      )
      expect(double.status).toBe(500)
      expect(double.body.error).toContain('invalid path')
    }
  })

  it('serves /git/status as JSON', async () => {
    const double = responseDouble()
    await handleGitRequest(process.cwd(), requestDouble('/git/status', 'GET') as never, double.res as never)
    expect(double.status).toBe(200)
    expect(double.body).toHaveProperty('branch')
    expect(double.body).toHaveProperty('entries')
    expect(double.body).toHaveProperty('isRepo')
  })
})
