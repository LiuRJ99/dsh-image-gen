/** Provider-neutral Inspiration Library for the Better Sidebar Gallery. */
import { type FC } from 'react';
import { type ImageEngine } from '../shared.js';
import type { LocaleService } from './gallery-view.js';
export interface InspirationViewProps {
    locale?: LocaleService | undefined;
    defaultEngine?: ImageEngine | undefined;
    busy?: boolean;
    onUsePrompt(prompt: string, engine: ImageEngine): void | Promise<void>;
}
export declare const InspirationView: FC<InspirationViewProps>;
