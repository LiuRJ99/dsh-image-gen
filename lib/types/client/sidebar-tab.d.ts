/**
 * Optional DSH-better-sidebar integration for dsh-image-gen.
 *
 * Exposes the Gallery view as a first-class tab in dsh-better-sidebar.
 * Interacts with the host through ctx.get('betterSidebar').
 *
 * @module dsh-image-gen/client/sidebar-tab
 */
import type { BetterSidebarService } from 'dsh-better-sidebar/client/service';
import { type LocaleService } from './gallery-view.js';
/** The stable tab type owned by this plugin. */
export declare const GALLERY_TAB_ID = "dsh-image-gen:gallery";
/** Minimal context face shared with Cordis runtime. */
export interface SidebarTabContextFace {
    get?(name: string): unknown;
    effect?(fn: () => unknown, label?: string): void;
}
/** Result of probing/registering the optional service. */
export interface BetterSidebarRegistration {
    /** Whether the service was present and the tab registration was attempted. */
    available: boolean;
    /** The service instance used for this registration. */
    service?: BetterSidebarService;
    /** Disposer for the registered tab. */
    disposer?: () => void;
}
/** Safely read the optional service from a Cordis context. */
export declare function getBetterSidebarService(ctx: {
    get?(name: string): unknown;
}): BetterSidebarService | undefined;
/**
 * Register the Gallery as one Better Sidebar tab when the optional plugin is present.
 */
export declare function registerBetterSidebarTab(ctx: SidebarTabContextFace, locale?: LocaleService): BetterSidebarRegistration;
