/**
 * Host admission for the plugin's HTTP surfaces.
 *
 * The Host web server delegates request trust to the connection service:
 * `connection.requestRejection(request)` returns 401/403 for requests that must
 * not be dispatched. Plugin routes are mounted next to the Host's own routes,
 * so they must apply the same decision before running their handler.
 *
 * A legacy Host without the connection service keeps dispatching as before
 * (never fail closed); see upstream `9752f6d` and its compatibility follow-up
 * `522c79c`.
 *
 * @module
 */
import type { ConnectionRequestRejection, ConnectionTrustRequest } from '@deepseek-ai/dsh-client-connection'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'

/** Host-owned admission decision for one incoming request. */
export type WebAdmission = (request: ConnectionTrustRequest) => ConnectionRequestRejection

/** Wrap one route so the Host's rejection short-circuits its handler. */
export function withWebAdmission(route: WebRoute, admission: () => WebAdmission | undefined): WebRoute {
  return {
    ...route,
    handler: (req, res) => {
      const rejection = admission()?.(req)
      if (rejection === undefined) return route.handler(req, res)
      res.writeHead(rejection, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: rejection === 401 ? 'unauthorized' : 'forbidden' }))
    },
  }
}
