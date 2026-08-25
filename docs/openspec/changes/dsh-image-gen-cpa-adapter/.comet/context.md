# Comet Spec Context

- Change: dsh-image-gen-cpa-adapter
- Phase: design
- Mode: beta
- Context hash: 977af87258c7d3cfd138e0a21098d1e798135cf89a4567b8ab5cc3e11c00fe3f

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This beta context pack verbatim-projects spec files and references supporting artifacts by hash, not an agent-authored summary.

## Source References

- Source: docs/openspec/changes/dsh-image-gen-cpa-adapter/proposal.md
- SHA256: d147c6b79d4bf9ade8c1d8b90f0f7b4c48cd8fde0625ad6713b3da4567530f10
- Source: docs/openspec/changes/dsh-image-gen-cpa-adapter/design.md
- SHA256: 3f12654f26b988246d20f96ea97e799e8f6ae5b364f16f528b64a0533e82c38d
- Source: docs/openspec/changes/dsh-image-gen-cpa-adapter/tasks.md
- SHA256: 1a8b5ccc8f0ba92908fe193f9e95ce5cf9e0465fa9be1ea1a7e422ba83fb8ece
- Source: docs/openspec/changes/dsh-image-gen-cpa-adapter/specs/cpa-backed-image-generation/spec.md
- SHA256: daf1c888cce40b35a30ec257f3cc7b6347fb83fb7969807f42b9099310548433
- Source: docs/openspec/changes/dsh-image-gen-cpa-adapter/specs/native-imagegen-plugin-distribution/spec.md
- SHA256: e77e536c80aad0cdae8aaca8863e40ede9de715ec10a60b3e6b2c844ff788b0b

## Acceptance Projection

## docs/openspec/changes/dsh-image-gen-cpa-adapter/specs/cpa-backed-image-generation/spec.md

- Source: docs/openspec/changes/dsh-image-gen-cpa-adapter/specs/cpa-backed-image-generation/spec.md
- Lines: 1-57
- SHA256: daf1c888cce40b35a30ec257f3cc7b6347fb83fb7969807f42b9099310548433

```md
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

```

## docs/openspec/changes/dsh-image-gen-cpa-adapter/specs/native-imagegen-plugin-distribution/spec.md

- Source: docs/openspec/changes/dsh-image-gen-cpa-adapter/specs/native-imagegen-plugin-distribution/spec.md
- Lines: 1-47
- SHA256: e77e536c80aad0cdae8aaca8863e40ede9de715ec10a60b3e6b2c844ff788b0b

```md
## Purpose

以 Codex 原生插件元数据和 ImageGen skill 交付 CPA-backed dsh-image-gen，同时保留 DSH Bundle 的运行时安装入口。

## ADDED Requirements

### Requirement: The plugin SHALL declare native distribution metadata

The package SHALL contain a valid `.codex-plugin/plugin.json` that identifies the ImageGen plugin, points to its ImageGen skill, and declares the runtime dependency on the CPA image service through the package documentation or dependency metadata. The Codex wrapper MUST complement rather than replace the DSH runtime manifest.

#### Scenario: Plugin metadata is discoverable

- **WHEN** a plugin loader reads `.codex-plugin/plugin.json`
- **THEN** it finds the plugin identity, version, description and `skills/imagegen` entry without resolving local absolute paths

#### Scenario: DSH runtime manifest remains available

- **WHEN** the package is built for DSH installation
- **THEN** its existing DSH Bundle/client manifest remains present alongside the Codex wrapper

### Requirement: The ImageGen skill SHALL describe CPA-backed usage

The packaged ImageGen skill SHALL instruct the agent to call `generate_image` for explicit image requests, provide a complete visual prompt, use the GPT Image or Gemini Image engine labels, and avoid exposing or requesting provider credentials. It SHALL not instruct the agent to read generated files merely to verify a successful tool result.

#### Scenario: Agent receives an explicit image request

- **WHEN** the skill is loaded and the user asks to create an image
- **THEN** the agent is directed to use `generate_image` with a complete prompt

#### Scenario: Credential setup is described

- **WHEN** a user reads the installation instructions
- **THEN** setup points to CPA configuration and does not ask the ImageGen plugin to store a Google or OpenAI key

### Requirement: The package SHALL include the required distribution files

The package check SHALL include `.codex-plugin/plugin.json`, `skills/imagegen/SKILL.md`, the DSH runtime manifest, and installation documentation, while excluding local response captures, generated images, and secret values.

#### Scenario: Package dry-run includes metadata and skill

- **WHEN** the package dry-run is executed
- **THEN** the archive file list contains the native manifest and ImageGen skill

#### Scenario: Package dry-run excludes local artifacts

- **WHEN** the package dry-run scans the repository
- **THEN** local response captures, generated image files and credential material are absent from the archive

```

Full source files remain canonical. If a required heading or scenario is missing here, regenerate the handoff or read the source spec directly. Supporting files (proposal, design, tasks) are referenced by hash only.