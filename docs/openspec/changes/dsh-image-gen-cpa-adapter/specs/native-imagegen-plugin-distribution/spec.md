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
