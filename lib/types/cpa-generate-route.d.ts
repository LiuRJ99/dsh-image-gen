/** Same-origin CPA-only generation route used by provider-independent Gallery actions. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type { CpaImageGenerationService } from '@LiuRJ99/dsh-cpa-plugin/image-generation';
export { CPA_GENERATE_ROUTE } from './shared.js';
export interface CpaGenerateRouteDeps {
    getService(): CpaImageGenerationService | undefined;
    saveImage(input: {
        data: Uint8Array;
        mediaType: ImageAttachmentRef['mediaType'];
        name?: string;
    }): Promise<ImageAttachmentRef>;
    /** Read the normalized attachment bytes for a workspace copy. */
    readImage?(ref: ImageAttachmentRef, signal?: AbortSignal): Promise<{
        ref: ImageAttachmentRef;
        data: Uint8Array;
    }>;
    /** Optional session-scoped workspace persistence; never accepts arbitrary roots. */
    getWorkspaceOptions?(): {
        enabled: boolean;
        folder?: string | undefined;
        activeRoot?: string | undefined;
    };
    getAllowedWorkspaceRoots?(): Promise<Iterable<string>> | Iterable<string>;
    saveToWorkspace?(options: {
        workspaceRoot: string;
        folder?: string | undefined;
        attachmentId: string;
        mediaType: ImageAttachmentRef['mediaType'];
        data: Uint8Array;
        signal: AbortSignal;
    }): Promise<string>;
    maxImageBytes: number;
    mediaTypes: readonly string[];
}
/** Handle a browser-initiated CPA generation without exposing credentials. */
export declare function serveCpaGenerate(req: IncomingMessage, res: ServerResponse, deps: CpaGenerateRouteDeps): Promise<void>;
