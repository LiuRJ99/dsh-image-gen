import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import { type LocaleService } from './gallery-view.js';
export interface GeneratedImageDeliverable {
    seq: number;
    callId: string;
    attachment: ImageAttachmentRef;
    prompt: string;
    engine: unknown;
    operation?: unknown;
    model?: unknown;
    output?: unknown;
    aspectRatio?: unknown;
    imageSize?: unknown;
    saveError?: unknown;
    savedTo?: string | undefined;
    createdAt?: number | undefined;
}
export interface ImageDeliverablesState {
    turn: number;
    calls: Map<string, {
        prompt?: string | undefined;
    }>;
    images: GeneratedImageDeliverable[];
}
export declare const IMAGE_DELIVERABLES_KIND = "image-generation-deliverables";
/** Pure conversation definition accumulating generated images for the turn. */
export declare const imageDeliverablesDefinition: {
    kind: string;
    match: (event: {
        type: string;
        data?: {
            turn?: number;
        };
    }) => {
        id: string;
        role: "start";
    } | {
        id: string;
        role: "update";
    } | null;
    start: (_context: unknown, match: {
        event: {
            data: {
                turn: number;
            };
        };
    }) => ImageDeliverablesState;
    update: (context: {
        state: ImageDeliverablesState;
    }, match: {
        event: Record<string, unknown>;
    }) => ImageDeliverablesState;
    buildLocationData: (context: {
        state?: ImageDeliverablesState;
    }, scope: string, previous: unknown) => {
        kind?: string;
        turn?: number;
        key?: string;
        value?: {
            images?: unknown;
        };
    } | null;
};
/** Selector for conversation.chat.turnTail. */
export declare function selectGeneratedImages(owner: {
    turn: {
        data: {
            get: (key: string) => unknown;
        };
    };
    seq: number;
}): GeneratedImageDeliverable[] | null;
export interface TurnTailCardProps {
    matched: GeneratedImageDeliverable[];
    locale?: LocaleService | undefined;
}
export declare function TurnTailImagesCard({ matched, locale }: TurnTailCardProps): import("react").JSX.Element | null;
export interface SingleViewProps {
    attachment: ImageAttachmentRef;
    engine?: unknown;
    operation?: unknown;
    model?: unknown;
    output?: unknown;
    aspectRatio?: unknown;
    imageSize?: unknown;
    saveError?: unknown;
    savedTo?: string | undefined;
    prompt: string;
    createdAt?: number | undefined;
    locale?: LocaleService | undefined;
}
export declare function SingleGeneratedImageView({ attachment, engine, operation, model, output, aspectRatio, imageSize, saveError, savedTo, prompt, createdAt, locale, }: SingleViewProps): import("react").JSX.Element;
