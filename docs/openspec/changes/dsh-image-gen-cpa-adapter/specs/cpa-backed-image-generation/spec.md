## Purpose

让 dsh-image-gen 在不管理供应商密钥或模型 ID 的情况下，通过 dsh-cpa-plugin 统一生成 GPT Image 与 Gemini 图片。

## ADDED Requirements

### Requirement: ImageGen SHALL use the CPA image service

The plugin SHALL keep the existing `generate_image` tool name and attachment presentation while sending each request to the injected CPA image service. The request MUST include the selected engine, complete prompt, optional aspect ratio, optional image size or size, and the tool execution abort signal. The plugin MUST NOT resolve or transmit a provider API key.

#### Scenario: Generate through GPT Image

- **WHEN** the user invokes `generate_image` with engine `gpt`
- **THEN** the plugin calls the CPA image service with engine `gpt` and presents the returned image as an attachment-backed result

#### Scenario: Generate through Gemini Image

- **WHEN** the user invokes `generate_image` with engine `gemini`
- **THEN** the plugin calls the CPA image service with engine `gemini` and presents the returned image as an attachment-backed result

#### Scenario: CPA service is unavailable

- **WHEN** the plugin starts without the required CPA image service
- **THEN** it does not register a misleading direct-provider fallback and reports that the CPA image service dependency is unavailable

### Requirement: ImageGen SHALL expose engine selection without exposing raw model configuration

The plugin configuration SHALL expose only the engine choices `gpt` and `gemini`, defaulting to `gpt`, plus existing workspace-save controls. The configuration and settings UI MUST NOT require or render provider API keys, provider endpoints, or raw model IDs.

#### Scenario: Default configuration selects GPT Image

- **WHEN** the plugin is configured without an engine
- **THEN** the effective engine is `gpt` and workspace saving remains enabled with the existing default folder

#### Scenario: Gemini engine is selectable

- **WHEN** the user selects `gemini`
- **THEN** the plugin stores the engine choice and does not ask for a Gemini key, endpoint, or model ID

#### Scenario: Legacy provider configuration is encountered

- **WHEN** a stored configuration contains the former provider-specific fields
- **THEN** the plugin ignores or migrates those fields to the engine-only configuration without displaying credentials

### Requirement: ImageGen SHALL preserve attachment and workspace persistence

Successful CPA image results SHALL be saved through the existing DSH attachment service, shown in the conversation result card, collected into Gallery metadata, and optionally written to the session workspace. A workspace write failure MUST NOT discard a successfully generated attachment.

#### Scenario: Generated image is saved and displayed

- **WHEN** the CPA service returns valid image bytes and workspace saving is enabled
- **THEN** the plugin saves one attachment, presents one image card, records one Gallery item, and writes the configured workspace file

#### Scenario: Workspace write fails

- **WHEN** attachment saving succeeds but the workspace file cannot be written
- **THEN** the image remains attached and the result reports the workspace error separately
