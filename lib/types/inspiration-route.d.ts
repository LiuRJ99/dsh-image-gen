/** Same-origin host routes for the provider-neutral Inspiration Library. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { INSPIRATION_CACHE_CLEAR_ROUTE, INSPIRATION_CATALOG_ROUTE, INSPIRATION_IMAGE_ROUTE, INSPIRATION_ROUTE_PREFIX, INSPIRATION_REFRESH_ROUTE, type InspirationCatalog, type InspirationDiskCache } from './inspiration.js';
/** Prefix used when registering this handler with DSH's web server. */
export declare const INSPIRATION_ROUTE = "/plugins/dsh-image-gen/inspiration";
export { INSPIRATION_CACHE_CLEAR_ROUTE, INSPIRATION_CATALOG_ROUTE, INSPIRATION_IMAGE_ROUTE, INSPIRATION_REFRESH_ROUTE, INSPIRATION_ROUTE_PREFIX, };
export declare const INSPIRATION_ROUTES: {
    readonly prefix: "/plugins/dsh-image-gen/inspiration";
    readonly catalog: "/plugins/dsh-image-gen/inspiration/catalog";
    readonly refresh: "/plugins/dsh-image-gen/inspiration/refresh";
    readonly cacheClear: "/plugins/dsh-image-gen/inspiration/cache-clear";
    readonly image: "/plugins/dsh-image-gen/inspiration/image";
};
interface RouteState {
    catalog: InspirationCatalog | undefined;
}
export interface InspirationRouteDeps {
    /** Optional isolated cache, useful for tests and host lifecycle ownership. */
    cache?: InspirationDiskCache;
    /** Injectable fetch implementation; production defaults to global fetch. */
    fetch?: typeof globalThis.fetch;
    /** Injectable clock used for deterministic catalog metadata in tests. */
    now?: () => number;
    /** Internal state hook used by `createInspirationRoute`; not needed by callers. */
    state?: RouteState;
}
/**
 * Handle every Inspiration route. Register the prefix with the host web server;
 * this function performs its own exact path dispatch and same-origin check.
 */
export declare function serveInspirationRoute(req: IncomingMessage, res: ServerResponse, deps?: InspirationRouteDeps): Promise<void>;
/** Alias for hosts that name route handlers by resource. */
export declare const serveInspiration: typeof serveInspirationRoute;
export declare const inspirationRouteHandler: typeof serveInspirationRoute;
/** Return a DSH-compatible prefix registration object. */
export declare function inspirationRouteRegistration(deps?: InspirationRouteDeps): {
    kind: "prefix";
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
};
/** Build an isolated route handler with its own in-memory catalog state. */
export declare function createInspirationRoute(deps?: InspirationRouteDeps): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
export declare function serveInspirationImage(req: IncomingMessage, res: ServerResponse, deps?: InspirationRouteDeps): Promise<void>;
