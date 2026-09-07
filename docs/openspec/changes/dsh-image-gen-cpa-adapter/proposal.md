## Why

当前 fork 版 dsh-image-gen 直接管理 OpenAI、Google、Seedream 等供应商请求和模型选择，导致插件与 CPA 的模型、认证和错误处理体系分叉。将它改造成依赖 `dsh-cpa-plugin` 的独立原生插件后，用户可以在不主动选择生图模型的情况下使用统一的 GPT Image 与 Gemini 图像能力，同时保留现有画廊和工作区保存体验。

## What Changes

- 将图片生成请求改为调用 `dsh-cpa-plugin` 提供的 CPA 图片服务；编辑能力不在当前 CPA contract 内。
- 移除插件页面中的主动模型选择和直接供应商凭据配置；模型路由由 CPA 负责。
- 适配 CPA 返回的图片数据，继续支持生成、画廊展示、工作区保存和已有 Gallery 元数据兼容；编辑/导入导出不属于本次 CPA-only 增量。
- 将现有 UI 与状态管理整理为独立原生插件结构，并补齐 `.codex-plugin/plugin.json`。
- 增加 `skills/imagegen/SKILL.md`、安装说明和 CPA 依赖配置。
- 增加针对 Gemini、GPT Image、失败响应和画廊持久化的集成验证。
- 增加固定 allowlist 的 Inspiration Library、Gallery favorites/批量管理/workspace filter/CPA regeneration，以及动态 workspace discovery 与严格文件清理；这些 Option A 能力不改变 Provider contract。
- **BREAKING**：不再支持插件自身的供应商 API Key 与模型配置作为运行时入口。

## Capabilities

### New Capabilities

- `cpa-backed-image-generation`: 在无模型选择页面的前提下，通过 CPA 完成图片生成；native 编辑另立 change。
- `native-imagegen-plugin-distribution`: 以 Codex 原生插件元数据和 ImageGen skill 交付插件，并声明 CPA 依赖。

### Modified Capabilities

- 无。当前项目没有已登记的 OpenSpec 能力规范。

## Impact

- 影响 `src/index.ts`、配置与客户端 UI、Gallery store、工作区保存逻辑及插件构建文件。
- 删除或旁路现有供应商客户端和独立密钥配置；保留数据导入导出所需的本地状态格式。
- 新增对 `dsh-cpa-plugin` 的运行时依赖，Provider change 必须先完成并可被本插件调用。
- 产出可安装的 Adapter tarball（含 `.codex-plugin/plugin.json`、ImageGen skill 和使用文档）；当前 Provider 为 private sibling，安装时必须提供 approved internal Provider package/tarball，不能将 Adapter 宣称为无 Provider 的 standalone 生图包。
