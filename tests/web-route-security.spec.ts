import { describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { withWebAdmission } from '../src/web-route.js'

function request(): IncomingMessage {
  return { url: '/plugins/dsh-image-gen/image', headers: {} } as unknown as IncomingMessage
}

interface FakeResponse {
  statusCode: number
  headers: Record<string, string>
  body: string
  writeHead(code: number, headers?: Record<string, string>): FakeResponse
  end(body?: string): void
}

function response(): FakeResponse & ServerResponse {
  const res: FakeResponse = {
    statusCode: 200,
    headers: {},
    body: '',
    writeHead(code, headers) {
      this.statusCode = code
      Object.assign(this.headers, headers ?? {})
      return this
    },
    end(body) {
      this.body = body ?? ''
    },
  }
  return res as FakeResponse & ServerResponse
}

describe('plugin web route admission', () => {
  it('keeps dispatching when the Host exposes no admission service', () => {
    const handler = vi.fn()
    const route = withWebAdmission({ kind: 'exact', path: '/legacy-host', handler }, () => undefined)
    const res = response()
    route.handler(request(), res)
    expect(handler).toHaveBeenCalledOnce()
  })

  it.each([401, 403] as const)('applies Host rejection %i before dispatch', rejection => {
    const handler = vi.fn()
    const route = withWebAdmission({ kind: 'exact', path: '/protected', handler }, () => () => rejection)
    const res = response()
    route.handler(request(), res)
    expect(handler).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(rejection)
    expect(res.headers['content-type']).toContain('application/json')
    expect(JSON.parse(res.body).error).toBe(rejection === 401 ? 'unauthorized' : 'forbidden')
  })

  it('dispatches when the Host admits the request', () => {
    const handler = vi.fn()
    const route = withWebAdmission({ kind: 'exact', path: '/admitted', handler }, () => () => undefined)
    const res = response()
    route.handler(request(), res)
    expect(handler).toHaveBeenCalledOnce()
  })
})
