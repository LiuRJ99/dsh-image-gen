import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
/**
 * Build the deterministic file name for a generated image:
 * `image-<digest>.<ext>` for canonical SHA-256 IDs (and the historical
 * eight-character prefix for legacy IDs). The digest comes from the
 * content-addressed attachment id, so the same image bytes always map to the
 * same file name regardless of when they were generated, and re-saving simply
 * overwrites the previous copy in place.
 * @param attachmentId - durable attachment id (`sha256:<hex>`).
 * @param mediaType - verified image media type.
 * @returns the file name (no directory).
 */
export declare function workspaceImageName(attachmentId: string, mediaType: ImageAttachmentRef['mediaType']): string;
/**
 * Resolve the configured image folder inside the session workspace. The
 * folder may nest, but must stay inside the workspace: absolute paths and
 * parent-traversal segments are rejected for both separator styles.
 *
 * This lexical pass is necessary but not sufficient: `saveImageToWorkspace`
 * additionally verifies the on-disk resolution so symlinked folders cannot
 * escape the workspace.
 * @param workspaceRoot - the session workspace directory.
 * @param folder - configured subfolder; empty/blank means the workspace root.
 * @returns the absolute image directory.
 * @throws when the folder would escape the workspace root.
 */
export declare function workspaceImageDir(workspaceRoot: string, folder: string | undefined): string;
/**
 * Write one generated image durably under the session workspace.
 *
 * Containment is enforced twice: lexically by `workspaceImageDir`, then
 * against real paths, so a configured folder (or any intermediate segment)
 * that is a symlink pointing outside the workspace is rejected before and
 * after anything is created.
 *
 * The bytes are written to a same-directory staging file and renamed onto the
 * target, so a crash never leaves a half-written image under its final name.
 * Re-saving identical bytes rewrites the same file (the name is content-
 * addressed), which keeps repeated generations idempotent. A cancellation is
 * honoured up to and including the final rename: an aborted save never
 * resolves successfully and never leaves the image behind under its final
 * name.
 * @param options - workspace root, configured folder, attachment identity, and image bytes.
 * @returns the absolute path of the written file.
 */
export declare function saveImageToWorkspace(options: {
    workspaceRoot: string;
    folder?: string | undefined;
    attachmentId: string;
    mediaType: ImageAttachmentRef['mediaType'];
    data: Uint8Array;
    signal?: AbortSignal;
}): Promise<string>;
/** A workspace row persisted in DSH's local workspace table. */
export interface DshWorkspaceInfo {
    workspaceId: string;
    path: string;
    title: string;
    sessionIds: string[];
}
/** Discover all workspace paths currently recorded in ~/.dsh/storages/workspace.json. */
export declare function getDshWorkspaceRoots(): Promise<string[]>;
/** Discover detailed workspace records without exposing provider or credential state. */
export declare function getDshWorkspacesFull(): Promise<DshWorkspaceInfo[]>;
/**
 * Resolve a candidate path and prove that it is inside one of the caller's
 * explicitly supplied workspace roots. No implicit process.cwd() root is used.
 */
export declare function assertWorkspaceAllowed(candidateRoot: string, allowedRoots: Iterable<string>): Promise<string>;
/** Safely delete one generated image file under explicitly allowed roots. */
export declare function deleteImageFromWorkspace(filePath: string, allowedWorkspaceRoots?: Iterable<string>, options?: {
    allowLegacy?: boolean;
    expectedAttachmentId?: string;
    hashBudget?: {
        remaining: number;
    };
}): Promise<boolean>;
/**
 * Safely find and delete generated image files for one strict SHA-256
 * attachment id. Search is restricted to the requested root/folder or to the
 * known legacy image folders when no folder is supplied; it never adds cwd or
 * any other write root implicitly.
 */
export declare function deleteImageByAttachmentIdFromWorkspace(attachmentId: string, options?: {
    workspaceRoot?: string | undefined;
    folder?: string | undefined;
    allowedWorkspaceRoots?: Iterable<string> | undefined;
}): Promise<boolean>;
