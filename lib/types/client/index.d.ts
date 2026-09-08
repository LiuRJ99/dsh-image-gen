import type { Context } from '@deepseek-ai/cordis';
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-chat/client';
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type ImageEngine } from '../shared.js';
import { type LocaleService } from './gallery-view.js';
interface ImageSettings {
    engine?: ImageEngine;
    saveToWorkspace?: boolean;
    workspaceFolder?: string;
}
interface SettingsFace {
    scope: SettingsScope<ImageSettings>;
    locale?: LocaleService | undefined;
}
interface ImageCardFace {
    locale?: LocaleService | undefined;
}
type SettingsCardProps = PropsRuntime<'settings.plugin.item'> & InjectFace<SettingsFace>;
type ImageCardProps = PropsRuntime<'tool.call.toolview'> & InjectFace<ImageCardFace>;
/** Required browser services. */
export declare const inject: string[];
/** Mount the settings card, generated-image card, and native conversation gallery view. */
export declare function apply(ctx: Context): void;
/** Edit the selected image engine and workspace output settings. */
export declare function ImageGenerationSettingsCard(props: SettingsCardProps): import("react").JSX.Element;
/** Render the durable attachment referenced by a completed image tool call inside the tool details. */
export declare function GeneratedImageCard(props: ImageCardProps): import("react").JSX.Element;
export declare function imageRef(block: ToolCallBlock): ImageAttachmentRef | undefined;
export {};
