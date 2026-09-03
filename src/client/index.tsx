/** Web settings and generated-image cards contributed by the Bundle. */
import { useEffect, useState, type FormEvent } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import {
  IMAGE_GENERATION_NAMESPACE,
  IMAGE_ROUTE,
  type ImageEngine,
} from '../shared.js'
import { galleryEngineLabel, normalizeGalleryItem, saveGalleryItem } from './gallery-store.js'
import { GalleryViewTab, copyImageBlob, type LocaleService } from './gallery-view.js'
import { registerBetterSidebarTab } from './sidebar-tab.js'

interface ImageSettings {
  engine?: ImageEngine
  saveToWorkspace?: boolean
  workspaceFolder?: string
}
interface SettingsFace { scope: SettingsScope<ImageSettings>; locale?: LocaleService | undefined }
interface ImageCardFace { locale?: LocaleService | undefined }
type SettingsCardProps = PropsRuntime<'settings.plugin.item'> & InjectFace<SettingsFace>
type ImageCardProps = PropsRuntime<'tool.call.toolview'> & InjectFace<ImageCardFace>

const DICT = {
  zh: {
    title: '图像生成',
    description: '选择图片生成引擎并配置工作区保存。',
    engine: '生成引擎',
    engineGPT: 'GPT Image 2',
    engineGemini: 'Gemini Image',
    saveToWorkspace: '保存到工作区',
    saveToWorkspaceHint: '每次生成后，把图片文件保存到当前会话工作区。',
    folder: '工作区文件夹',
    folderHint: '相对当前会话工作区的子目录；留空表示工作区根目录。',
    saving: '保存中…',
    save: '保存',
    saved: '已保存',
    savedToPath: '已保存到',
    generating: '正在生成图片…',
    loading: '正在加载图片…',
    loadFailed: '图片读取失败 ({status})',
    generatedTitle: '已生成图片',
    copyImg: '复制图片',
    download: '下载图片',
    openNewTab: '新标签页打开',
    copiedImage: '已复制图片',
    copyFailed: '复制失败',
  },
  en: {
    title: 'Image Generation',
    description: 'Select an image engine and configure workspace saving.',
    engine: 'Image engine',
    engineGPT: 'GPT Image 2',
    engineGemini: 'Gemini Image',
    saveToWorkspace: 'Save to workspace',
    saveToWorkspaceHint: 'Write each generated image as a file into the session workspace.',
    folder: 'Workspace folder',
    folderHint: 'Subdirectory of the session workspace; empty means the workspace root.',
    saving: 'Saving…',
    save: 'Save',
    saved: 'Saved',
    savedToPath: 'Saved to',
    generating: 'Generating image…',
    loading: 'Loading image…',
    loadFailed: 'Failed to load image ({status})',
    generatedTitle: 'Generated image',
    copyImg: 'Copy Image',
    download: 'Download Image',
    openNewTab: 'Open in new tab',
    copiedImage: 'Image copied',
    copyFailed: 'Copy failed',
  },
} as const

type DictKey = keyof typeof DICT.zh

const STYLE = `
.dsh-ig-card{list-style:none;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:12px;background:var(--dsw-alias-bg-layer-3,#fff);transition:border-color .16s,background .16s;overflow:hidden}
.dsh-ig-card:hover{border-color:var(--dsw-alias-label-dimmed,#9ca3af)}
.dsh-ig-card-open{background:var(--dsw-alias-bg-layer-2,#fff);border-color:var(--dsw-alias-label-dimmed,#9ca3af)}
.dsh-ig-head{width:100%;appearance:none;border:0;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-radius:12px}
.dsh-ig-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4c78ff);outline-offset:-2px}
.dsh-ig-head-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.dsh-ig-title{display:block;font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary,inherit)}
.dsh-ig-desc{display:block;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#7b818b)}
.dsh-ig-chevron{flex:none;color:var(--dsw-alias-label-tertiary,#7b818b);transition:transform .16s;display:inline-flex;align-items:center}
.dsh-ig-chevron-open{transform:rotate(180deg)}
.dsh-ig-body{border-top:1px solid var(--dsw-alias-border-l2,#eee);padding:0 16px 16px}
.dsh-ig-field{display:grid;gap:6px;margin-top:14px}
.dsh-ig-label{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary,inherit)}
.dsh-ig-input{box-sizing:border-box;width:100%;padding:8px 12px;font-size:13px;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:8px;background:var(--dsw-alias-bg-layer-3,transparent);color:inherit;outline:none;transition:border-color .15s}
.dsh-ig-input:focus{border-color:var(--dsw-alias-brand-primary,#4c78ff)}
.dsh-ig-input-group{display:flex;gap:8px;align-items:center}
.dsh-ig-btn-reset{appearance:none;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:8px;padding:7px 12px;background:var(--dsw-alias-bg-layer-3,#f9fafb);color:var(--dsw-alias-label-secondary,inherit);font:inherit;font-size:13px;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s}
.dsh-ig-btn-reset:hover{background:var(--dsw-alias-bg-layer-2,#edf0f3);border-color:var(--dsw-alias-label-dimmed,#9ca3af)}
.dsh-ig-hint,.dsh-ig-status{margin:0;color:var(--dsw-alias-label-tertiary,#7b818b);font-size:12px;line-height:1.4}
.dsh-ig-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2,#eee)}
.dsh-ig-check-row{display:flex;align-items:center;gap:8px;cursor:pointer}
.dsh-ig-check-row input[type=checkbox]{width:15px;height:15px;accent-color:var(--dsw-alias-brand-primary,#4c78ff);margin:0}
.dsh-ig-savedto{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#7b818b);word-break:break-all}
.dsh-ig-save{appearance:none;border:0;border-radius:8px;padding:6px 16px;background:var(--dsw-alias-label-primary,#111827);color:var(--dsw-alias-bg-layer-3,#fff);font:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:opacity .15s}
.dsh-ig-save:disabled{opacity:.4;cursor:default}

.dsh-ig-result{display:grid;gap:10px;max-width:520px}
.dsh-ig-result-title{font-size:14px;font-weight:600}
.dsh-ig-container{position:relative;display:inline-block;width:fit-content;max-width:100%;justify-self:start;border-radius:12px;overflow:hidden;line-height:0}
.dsh-ig-container:hover .dsh-ig-toolbar{opacity:1;pointer-events:auto}
.dsh-ig-toolbar{position:absolute;top:8px;left:8px;display:flex;align-items:center;gap:5px;padding:3px 5px;border-radius:8px;background:rgba(0,0,0,0.65);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);opacity:0;pointer-events:none;transition:opacity .18s ease;z-index:10;line-height:1}
.dsh-ig-tool-btn{appearance:none;border:0;background:transparent;color:#fff;padding:5px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .15s,color .15s}
.dsh-ig-tool-btn:hover{background:rgba(255,255,255,0.25)}
.dsh-ig-tool-btn-danger:hover{background:rgba(239,68,68,0.75)!important;color:#fff!important}
.dsh-ig-toast{position:absolute;top:100%;left:0;margin-top:5px;padding:3px 8px;border-radius:6px;background:rgba(0,0,0,0.85);color:#fff;font-size:11px;white-space:nowrap;pointer-events:none;z-index:20}
.dsh-ig-image{display:block;max-width:100%;max-height:520px;border-radius:12px;background:#f2f3f5;cursor:pointer}
@keyframes dsh-ig-fade{from{opacity:0}to{opacity:1}}
.dsh-ig-error{color:var(--dsw-alias-label-error,#d33);font-size:13px}
.dsh-ig-loading{color:var(--dsw-alias-label-tertiary,#7b818b);font-size:13px}

/* Gallery View (Optimized for both Sidebar Panels and Floating Windows) */
.dsh-ig-sidebar-tab{width:100%;height:100%;display:flex;flex-direction:column;overflow:hidden}
.dsh-ig-gallery-page{width:100%;height:100%;background:var(--dsw-alias-bg-layer-1,#ffffff);display:flex;flex-direction:column;overflow:hidden;flex:1;box-sizing:border-box}
.dsh-ig-gallery-page-header{display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-layer-1,#ffffff);flex-shrink:0}
.dsh-ig-gallery-page-top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.dsh-ig-gallery-page-title-row{display:flex;align-items:center;gap:8px;min-width:0}
.dsh-ig-gallery-page-title{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary,inherit);white-space:nowrap}
.dsh-ig-gallery-page-count{font-size:11px;font-weight:500;color:var(--dsw-alias-label-secondary,#4b5563);background:var(--dsw-alias-bg-layer-3,#f3f4f6);padding:2px 8px;border-radius:20px;white-space:nowrap}
.dsh-ig-gallery-pills{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dsh-ig-gallery-pill{appearance:none;display:inline-flex;align-items:center;gap:5px;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:999px;padding:3px 10px;font:inherit;font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary,#4b5563);background:var(--dsw-alias-bg-layer-2,#fff);cursor:pointer;transition:background .15s,border-color .15s,color .15s}
.dsh-ig-gallery-pill:hover{border-color:var(--dsw-alias-brand-primary,#4c78ff);color:var(--dsw-alias-label-primary,inherit)}
.dsh-ig-gallery-pill.is-active{background:var(--dsw-alias-brand-primary,#4c78ff);border-color:var(--dsw-alias-brand-primary,#4c78ff);color:#fff}
.dsh-ig-gallery-pill-badge{font-size:11px;font-weight:600;line-height:1;background:var(--dsw-alias-bg-layer-3,#eef1f4);color:var(--dsw-alias-label-secondary,inherit);border-radius:999px;padding:2px 6px;min-width:14px;text-align:center}
.dsh-ig-gallery-pill.is-active .dsh-ig-gallery-pill-badge{background:rgba(255,255,255,0.25);color:#fff}
.dsh-ig-gallery-page-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dsh-ig-gallery-search-wrap{position:relative;display:flex;align-items:center;flex:1;min-width:110px;max-width:260px}
.dsh-ig-gallery-search-icon{position:absolute;left:8px;color:var(--dsw-alias-label-tertiary,#9ca3af);pointer-events:none}
.dsh-ig-gallery-search-input{padding:5px 24px 5px 28px;font-size:12px;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:8px;background:var(--dsw-alias-bg-layer-2,#fff);color:inherit;outline:none;width:100%;box-sizing:border-box;transition:border-color .15s}
.dsh-ig-gallery-search-input:focus{border-color:var(--dsw-alias-brand-primary,#4c78ff)}
.dsh-ig-gallery-search-clear{appearance:none;border:0;background:transparent;position:absolute;right:4px;padding:3px;border-radius:50%;color:var(--dsw-alias-label-tertiary,#9ca3af);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .15s,color .15s}
.dsh-ig-gallery-search-clear:hover{background:var(--dsw-alias-bg-layer-3,#eef1f4);color:var(--dsw-alias-label-primary,inherit)}
.dsh-ig-gallery-select-wrap{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--dsw-alias-label-tertiary,#7b818b)}
.dsh-ig-gallery-select{padding:5px 8px;font-size:12px;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:8px;background:var(--dsw-alias-bg-layer-2,#fff);color:inherit;outline:none;cursor:pointer}
.dsh-ig-gallery-select:focus{border-color:var(--dsw-alias-brand-primary,#4c78ff)}
.dsh-ig-gallery-view-toggle{display:inline-flex;align-items:center;gap:2px;padding:2px;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:8px;background:var(--dsw-alias-bg-layer-3,#f3f4f6)}
.dsh-ig-view-toggle-btn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#7b818b);border-radius:6px;padding:4px 6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .15s,color .15s}
.dsh-ig-view-toggle-btn:hover{color:var(--dsw-alias-label-primary,inherit)}
.dsh-ig-view-toggle-btn.is-active{background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-brand-primary,#4c78ff);box-shadow:0 1px 3px rgba(0,0,0,0.12)}
.dsh-ig-gallery-page-body{flex:1;overflow-y:auto;padding:12px 14px;box-sizing:border-box}
.dsh-ig-gallery-virtual{width:100%}
.dsh-ig-gallery-grid-row{position:absolute;left:0;right:0;display:grid;gap:20px}
.dsh-ig-gallery-list-virtual-item{position:absolute;left:0;right:0;overflow:hidden}
.dsh-ig-gallery-spacer td{padding:0;border:0}
.dsh-ig-gallery-card{background:var(--dsw-alias-bg-layer-2,#fff);border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;height:100%}
.dsh-ig-gallery-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.06);border-color:var(--dsw-alias-border-l1,#cfd4dc)}
.dsh-ig-gallery-card-media{position:relative;width:100%;aspect-ratio:1/1;flex:none;background:#f3f4f6;overflow:hidden;display:flex;align-items:center;justify-content:center}
.dsh-ig-gallery-card-img{width:100%;height:100%;object-fit:cover;transition:transform .2s}
.dsh-ig-gallery-card:hover .dsh-ig-gallery-card-img{transform:scale(1.03)}
.dsh-ig-gallery-card-loading{font-size:12px;color:#9ca3af}
.dsh-ig-gallery-card-error{font-size:12px;color:#ef4444;padding:8px;text-align:center}

/* List view */
.dsh-ig-gallery-list{display:flex;flex-direction:column;gap:12px}
.dsh-ig-gallery-list-item{display:flex;align-items:stretch;gap:16px;background:var(--dsw-alias-bg-layer-2,#fff);border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:12px;padding:12px;cursor:pointer;transition:border-color .15s,box-shadow .15s;height:100%;box-sizing:border-box}
.dsh-ig-gallery-list-item:hover{border-color:var(--dsw-alias-brand-primary,#4c78ff);box-shadow:0 4px 16px rgba(0,0,0,0.06)}
.dsh-ig-gallery-list-thumb{flex:none;width:96px;height:96px;border-radius:8px;overflow:hidden;background:#f3f4f6;display:flex;align-items:center;justify-content:center;align-self:center}
.dsh-ig-gallery-list-thumb img{width:100%;height:100%;object-fit:cover}
.dsh-ig-gallery-list-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
.dsh-ig-gallery-list-tags{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dsh-ig-tag-muted{background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-tertiary,#7b818b);border:1px solid var(--dsw-alias-border-l2,#e5e7eb);text-transform:none;font-weight:400}
.dsh-ig-gallery-list-prompt{margin:0;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary,inherit);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.dsh-ig-gallery-list-meta{display:flex;align-items:center;gap:14px;font-size:12px;color:var(--dsw-alias-label-tertiary,#7b818b);margin-top:auto}
.dsh-ig-gallery-actions-row{display:flex;align-items:center;gap:4px}
.dsh-ig-action-btn{appearance:none;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-layer-3,#f9fafb);color:var(--dsw-alias-label-secondary,inherit);border-radius:7px;padding:6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .15s,color .15s,border-color .15s}
.dsh-ig-action-btn:hover{background:var(--dsw-alias-bg-layer-2,#edf0f3);border-color:var(--dsw-alias-brand-primary,#4c78ff);color:var(--dsw-alias-brand-primary,#4c78ff)}
.dsh-ig-action-btn-danger:hover{background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.5);color:#ef4444}

/* Table view */
.dsh-ig-gallery-table-wrap{background:var(--dsw-alias-bg-layer-2,#fff);border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:12px;overflow:hidden}
.dsh-ig-gallery-table{width:100%;border-collapse:collapse;font-size:13px}
.dsh-ig-gallery-table thead th{text-align:left;padding:10px 14px;background:var(--dsw-alias-bg-layer-3,#f3f4f6);color:var(--dsw-alias-label-secondary,#4b5563);font-weight:600;font-size:12px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e7eb);white-space:nowrap}
.dsh-ig-table-th-thumb{width:56px}
.dsh-ig-gallery-table-row{cursor:pointer;transition:background .12s}
.dsh-ig-gallery-table-row:hover{background:var(--dsw-alias-bg-layer-1,#fafbfc)}
.dsh-ig-gallery-table-row td{padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l2,#eef0f3);color:var(--dsw-alias-label-secondary,inherit);vertical-align:middle}
.dsh-ig-gallery-table-row:last-child td{border-bottom:0}
.dsh-ig-table-cell-thumb{width:56px}
.dsh-ig-gallery-table-thumb{width:44px;height:44px;border-radius:6px;overflow:hidden;background:#f3f4f6;display:flex;align-items:center;justify-content:center}
.dsh-ig-gallery-table-thumb img{width:100%;height:100%;object-fit:cover}
.dsh-ig-table-cell-prompt{max-width:380px}
.dsh-ig-gallery-table-prompt{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;color:var(--dsw-alias-label-primary,inherit)}
.dsh-ig-gallery-table-engine{display:flex;flex-direction:column;align-items:flex-start;gap:4px}
.dsh-ig-table-model{font-size:11px;color:var(--dsw-alias-label-tertiary,#7b818b);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* Floating Action Toolbar (Matches Chat Image Toolbar) */
.dsh-ig-gallery-card:hover .dsh-ig-card-toolbar{opacity:1;pointer-events:auto}
.dsh-ig-card-toolbar{position:absolute;top:8px;left:8px;display:flex;align-items:center;gap:4px;padding:3px 5px;border-radius:8px;background:rgba(0,0,0,0.68);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);opacity:0;pointer-events:none;transition:opacity .18s ease;z-index:10;line-height:1}

.dsh-ig-gallery-card-meta{padding:10px 14px;display:flex;flex-direction:column;gap:6px;background:var(--dsw-alias-bg-layer-2,#fff);flex:1;min-height:70px;box-sizing:border-box}
.dsh-ig-gallery-card-header{display:flex;align-items:center;justify-content:space-between;font-size:11px}
.dsh-ig-tag{display:inline-block;padding:2px 6px;border-radius:4px;background:var(--dsw-alias-bg-layer-3,#edf0f3);color:var(--dsw-alias-label-secondary,inherit);font-weight:500;text-transform:uppercase;font-size:10px}
.dsh-ig-gallery-card-prompt{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-primary,inherit);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.dsh-ig-gallery-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:360px;text-align:center;color:var(--dsw-alias-label-tertiary,#7b818b)}
.dsh-ig-gallery-empty-icon{font-size:48px;margin-bottom:12px}
.dsh-ig-gallery-empty-title{font-size:16px;font-weight:600;color:var(--dsw-alias-label-primary,inherit);margin-bottom:6px}
.dsh-ig-gallery-empty-desc{font-size:13px;max-width:360px;line-height:1.5}

/* Pure Centered Lightbox */
.dsh-ig-lightbox-backdrop{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.88);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;cursor:zoom-out;animation:dsh-ig-fade .15s ease-out}
.dsh-ig-lightbox-topbar{position:absolute;top:20px;left:24px;right:24px;display:flex;align-items:center;justify-content:space-between;z-index:10;pointer-events:none}
.dsh-ig-lightbox-meta{display:flex;align-items:center;gap:8px;pointer-events:auto}
.dsh-ig-lightbox-meta-text{font-size:12px;color:rgba(255,255,255,0.75);background:rgba(255,255,255,0.12);padding:2px 8px;border-radius:6px}
.dsh-ig-lightbox-close-btn{appearance:none;border:0;background:rgba(255,255,255,0.15);color:#fff;border-radius:50%;width:34px;height:34px;font-size:16px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .15s;pointer-events:auto}
.dsh-ig-lightbox-close-btn:hover{background:rgba(255,255,255,0.3)}
.dsh-ig-lightbox-img-wrap{max-width:86vw;max-height:78vh;display:flex;align-items:center;justify-content:center;cursor:default}
.dsh-ig-lightbox-img{max-width:100%;max-height:78vh;object-fit:contain;border-radius:8px;box-shadow:0 24px 60px rgba(0,0,0,0.7);user-select:none}
.dsh-ig-lightbox-loading{color:rgba(255,255,255,0.6);font-size:13px}
.dsh-ig-lightbox-error{color:#fca5a5;font-size:13px;text-align:center;max-width:60vw}
.dsh-ig-lightbox-nav{appearance:none;border:0;background:rgba(255,255,255,0.12);color:#fff;border-radius:50%;width:44px;height:44px;font-size:18px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .15s;position:absolute;top:50%;margin-top:-22px;z-index:11}
.dsh-ig-lightbox-nav:hover{background:rgba(255,255,255,0.28)}
.dsh-ig-lightbox-nav-prev{left:20px}
.dsh-ig-lightbox-nav-next{right:20px}
.dsh-ig-lightbox-bottombar{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);max-width:min(90vw,640px);background:rgba(20,22,26,0.85);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.15);border-radius:14px;padding:10px 16px;display:flex;flex-direction:column;gap:8px;color:#fff;box-shadow:0 16px 40px rgba(0,0,0,0.5);cursor:default}
.dsh-ig-lightbox-prompt-text{font-size:13px;line-height:1.4;color:rgba(255,255,255,0.92);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.dsh-ig-lightbox-actions{display:flex;align-items:center;gap:8px;justify-content:flex-end;border-top:1px solid rgba(255,255,255,0.1);padding-top:8px}
.dsh-ig-lightbox-btn{appearance:none;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.08);color:#fff;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:background .15s,border-color .15s,color .15s}
.dsh-ig-lightbox-btn:hover{background:rgba(255,255,255,0.22)}
.dsh-ig-lightbox-btn-danger{border-color:rgba(239,68,68,0.4);color:#fca5a5}
.dsh-ig-lightbox-btn-danger:hover{background:rgba(239,68,68,0.35)!important;color:#fff!important;border-color:rgba(239,68,68,0.7)!important}
.dsh-ig-gallery-page-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#fff;padding:6px 14px;border-radius:8px;font-size:13px;z-index:99999;animation:dsh-ig-fade .15s}

/* Responsive: stack gallery toolbar rows on narrow viewports */
@media (max-width:720px){
  .dsh-ig-gallery-page-top{flex-direction:column;align-items:flex-start;gap:8px}
  .dsh-ig-gallery-page-header{padding:10px 12px}
  .dsh-ig-gallery-page-body{padding:10px 12px}
}
`

/** Required browser services. */
export const inject = ['slots', 'connection', 'remote', 'settingsScope', 'locale']

/** Mount the settings card, generated-image card, and native conversation gallery view. */
export function apply(ctx: Context): void {
  const scope = ctx.settingsScope.bind<ImageSettings>({ namespace: IMAGE_GENERATION_NAMESPACE as never })
  const locale = ctx.get('locale') as LocaleService | undefined

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-image-gen'
    style.textContent = STYLE
    document.head.appendChild(style)
    return () => {
      style.remove()
    }
  }, 'dsh-image-gen: styles')

  const register = ctx.slots.register.bind(ctx.slots) as unknown as (options: object, component: unknown) => () => void

  // 1. Settings item
  ctx.slots.inject('settings.plugin.item', () => register({
    name: 'settings.plugin.item',
    key: IMAGE_GENERATION_NAMESPACE,
    inject: (): SettingsFace => ({ scope, locale }),
  }, ImageGenerationSettingsCard))

  // 2. Tool result view card in chat stream
  ctx.slots.inject('tool.call.toolview', () => register({
    name: 'tool.call.toolview',
    key: 'generate_image',
    inject: (): ImageCardFace => ({ locale }),
  }, GeneratedImageCard))

  // 3. Optional Better Sidebar gallery tab
  ctx.effect(() => {
    let unregister: (() => void) | undefined
    const tryRegister = () => {
      if (unregister !== undefined) return
      const reg = registerBetterSidebarTab(ctx, locale)
      if (reg.available) {
        unregister = reg.disposer
      }
    }
    tryRegister()
    const timer = setInterval(tryRegister, 500)
    const stopTimer = setTimeout(() => clearInterval(timer), 5000)
    return () => {
      clearInterval(timer)
      clearTimeout(stopTimer)
      unregister?.()
    }
  }, 'dsh-image-gen: better-sidebar tab registration')
}

/** Edit the selected image engine and workspace output settings. */
export function ImageGenerationSettingsCard(props: SettingsCardProps) {
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState(() => props.scope.getSnapshot())
  const [lang, setLang] = useState(() => (props.locale?.getSnapshot?.()?.active?.startsWith('en') ? 'en' : 'zh'))
  const [engine, setEngine] = useState<ImageEngine>('gpt')
  const [saveToWorkspace, setSaveToWorkspace] = useState(true)
  const [workspaceFolder, setWorkspaceFolder] = useState('dsh-image-gen')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => props.scope.subscribe(() => { setSnapshot(props.scope.getSnapshot()) }), [props.scope])
  useEffect(() => {
    return props.locale?.subscribe?.(() => {
      setLang(props.locale?.getSnapshot?.()?.active?.startsWith('en') ? 'en' : 'zh')
    })
  }, [props.locale])

  const t = (keyName: DictKey, params?: Record<string, string>): string => {
    const dict = lang === 'en' ? DICT.en : DICT.zh
    let text: string = dict[keyName] || DICT.zh[keyName] || keyName
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, v)
      }
    }
    return text
  }

  useEffect(() => {
    const value = snapshot.value
    setEngine(value?.engine ?? 'gpt')
    setSaveToWorkspace(value?.saveToWorkspace ?? true)
    setWorkspaceFolder(value?.workspaceFolder ?? 'dsh-image-gen')
  }, [snapshot])

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault(); setSaving(true); setMessage('')
    try {
      await props.scope.set('engine', engine)
      await props.scope.set('saveToWorkspace', saveToWorkspace)
      await props.scope.set('workspaceFolder', workspaceFolder.trim())
      setMessage(t('saved'))
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)) } finally { setSaving(false) }
  }

  return (
    <li className={`dsh-ig-card ${open ? 'dsh-ig-card-open' : ''}`}>
      <button type="button" className="dsh-ig-head" aria-expanded={open} onClick={() => { setOpen(value => !value) }}>
        <span className="dsh-ig-head-text">
          <span className="dsh-ig-title">{t('title')}</span>
          <span className="dsh-ig-desc">{t('description')}</span>
        </span>
        <span className={`dsh-ig-chevron ${open ? 'dsh-ig-chevron-open' : ''}`} aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4"/></svg>
        </span>
      </button>
      {open ? (
        <form className="dsh-ig-body" onSubmit={(event) => { void save(event) }}>
          <label className="dsh-ig-field">
            <span className="dsh-ig-label">{t('engine')}</span>
            <select className="dsh-ig-input" value={engine} onChange={event => { setEngine(event.target.value as ImageEngine) }}>
              <option value="gpt">{t('engineGPT')}</option>
              <option value="gemini">{t('engineGemini')}</option>
            </select>
          </label>
          <div className="dsh-ig-field">
            <label className="dsh-ig-check-row">
              <input type="checkbox" checked={saveToWorkspace} onChange={event => { setSaveToWorkspace(event.target.checked) }} />
              <span className="dsh-ig-label">{t('saveToWorkspace')}</span>
            </label>
            <span className="dsh-ig-hint">{t('saveToWorkspaceHint')}</span>
          </div>
          {saveToWorkspace ? (
            <label className="dsh-ig-field">
              <span className="dsh-ig-label">{t('folder')}</span>
              <input className="dsh-ig-input" value={workspaceFolder} onChange={event => { setWorkspaceFolder(event.target.value) }} placeholder="dsh-image-gen" />
              <span className="dsh-ig-hint">{t('folderHint')}</span>
            </label>
          ) : null}
          <div className="dsh-ig-actions">
            <p className="dsh-ig-status" role="status">{message}</p>
            <button className="dsh-ig-save" type="submit" disabled={saving || !snapshot.writable}>{saving ? t('saving') : t('save')}</button>
          </div>
        </form>
      ) : null}
    </li>
  )
}

/** Render the durable attachment referenced by a completed image tool call. */
export function GeneratedImageCard(props: ImageCardProps) {
  const attachment = imageRef(props.block)
  const savedTo = imageSavedTo(props.block)
  const metadata = imageMetadata(props.block)
  const normalizedMetadata = normalizeGalleryItem({ engine: metadata.engine, provider: metadata.provider })
  const engine = normalizedMetadata.engine
  const [url, setUrl] = useState<string>()
  const [blob, setBlob] = useState<Blob>()
  const [error, setError] = useState<string>()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [toast, setToast] = useState<string>()
  const [lang, setLang] = useState(() => (props.locale?.getSnapshot?.()?.active?.startsWith('en') ? 'en' : 'zh'))

  useEffect(() => {
    return props.locale?.subscribe?.(() => {
      setLang(props.locale?.getSnapshot?.()?.active?.startsWith('en') ? 'en' : 'zh')
    })
  }, [props.locale])

  const t = (keyName: DictKey, params?: Record<string, string>): string => {
    const dict = lang === 'en' ? DICT.en : DICT.zh
    let text: string = dict[keyName] || DICT.zh[keyName] || keyName
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, v)
      }
    }
    return text
  }

  // Auto-collect into gallery IndexedDB
  useEffect(() => {
    if (attachment === undefined) return
    const item = normalizeGalleryItem({
      id: attachment.attachmentId,
      attachment,
      prompt: metadata.prompt,
      engine: metadata.engine,
      provider: metadata.provider,
      model: typeof metadata.model === 'string' ? metadata.model : '',
      output: typeof metadata.output === 'string' ? metadata.output : '',
      createdAt: metadata.createdAt,
    })
    void saveGalleryItem(item)
  }, [attachment?.attachmentId, metadata.createdAt, metadata.prompt, metadata.engine, metadata.model, metadata.output])

  useEffect(() => {
    if (!previewOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [previewOpen])

  useEffect(() => {
    if (attachment === undefined) return
    const controller = new AbortController()
    let objectUrl: string | undefined
    void fetch(IMAGE_ROUTE, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ attachment }),
    }).then(async response => {
      if (!response.ok) throw new Error(t('loadFailed', { status: String(response.status) }))
      const resBlob = await response.blob()
      if (controller.signal.aborted) return
      setBlob(resBlob)
      objectUrl = URL.createObjectURL(resBlob)
      setUrl(objectUrl)
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause))
    })
    return () => {
      controller.abort()
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl)
    }
  }, [attachment?.attachmentId, lang])

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!blob) return
    const ok = await copyImageBlob(blob)
    setToast(ok ? t('copiedImage') : t('copyFailed'))
    setTimeout(() => { setToast(undefined) }, 2000)
  }

  const download = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = attachment?.name || `dsh-image-${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const openNewTab = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (attachment === undefined) return <div className="dsh-ig-loading">{t('generating')}</div>
  return <section className="dsh-ig-result" aria-label={t('generatedTitle')}>
    <div className="dsh-ig-result-title" title={normalizedMetadata.normalizationError}>{t('generatedTitle')} · {galleryEngineLabel(engine)}</div>
    {savedTo !== undefined ? <div className="dsh-ig-savedto">{t('savedToPath')}: {savedTo}</div> : null}
    {error !== undefined ? <div className="dsh-ig-error">{error}</div> : null}
    {url === undefined && error === undefined ? <div className="dsh-ig-loading">{t('loading')}</div> : null}
    {url !== undefined ? <div className="dsh-ig-container">
      <img
        className="dsh-ig-image"
        src={url}
        alt={attachment.name ?? 'Generated image'}
        onClick={() => { setPreviewOpen(true) }}
      />
      <div className="dsh-ig-toolbar">
        <button type="button" className="dsh-ig-tool-btn" title={t('copyImg')} onClick={(e) => { void copy(e) }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button type="button" className="dsh-ig-tool-btn" title={t('download')} onClick={download}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
        <button type="button" className="dsh-ig-tool-btn" title={t('openNewTab')} onClick={openNewTab}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </button>
        {toast ? <div className="dsh-ig-toast">{toast}</div> : null}
      </div>
    </div> : null}

    {previewOpen && url !== undefined ? <div className="dsh-ig-lightbox-backdrop" onClick={() => { setPreviewOpen(false) }}>
      <div className="dsh-ig-lightbox-img-wrap" onClick={(e) => { e.stopPropagation() }}>
        <img
          className="dsh-ig-lightbox-img"
          src={url}
          alt={attachment.name ?? 'Generated image preview'}
        />
      </div>
    </div> : null}
  </section>
}

function imageRef(block: ToolCallBlock): ImageAttachmentRef | undefined {
  if (!('kind' in block) || block.kind !== 'tool-result') return undefined
  const image = block.content.find(item => item.type === 'image')
  return image?.type === 'image' ? image.attachment : undefined
}

interface ImageMetadata {
  prompt: string
  engine?: unknown
  provider?: unknown
  model?: unknown
  output?: unknown
  createdAt?: number | undefined
}

function imageMetadata(block: ToolCallBlock): ImageMetadata {
  const meta = record('meta' in block ? block.meta : undefined)
  const prompt = 'call' in block && block.call !== null ? promptFromArgs(block.call.argsRaw) : undefined
  return {
    prompt: typeof meta?.prompt === 'string' ? meta.prompt : prompt ?? 'Generated Image',
    engine: meta?.engine,
    provider: meta?.provider,
    model: meta?.model,
    output: meta?.output,
    createdAt: typeof meta?.createdAt === 'number' ? meta.createdAt : undefined,
  }
}

/** The workspace file path a completed image call saved, when the result meta carries one. */
function imageSavedTo(block: ToolCallBlock): string | undefined {
  if (!('kind' in block) || block.kind !== 'tool-result') return undefined
  const meta = record(block.meta)
  return typeof meta?.savedTo === 'string' ? meta.savedTo : undefined
}

function promptFromArgs(argsRaw: string): string | undefined {
  try {
    const args = JSON.parse(argsRaw) as unknown
    const prompt = record(args)?.prompt
    return typeof prompt === 'string' ? prompt : undefined
  } catch {
    return undefined
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}
