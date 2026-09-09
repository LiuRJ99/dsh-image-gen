---
name: install-dsh-image-gen
description: Install, configure, diagnose, verify, or remove the CPA-backed dsh-image-gen Adapter in a DeepSeek Harness Web profile.
---

# Install DSH Image Gen

`dsh-image-gen` is an Adapter. It does not own provider credentials, model IDs, or HTTP protocol details. Install the CPA Provider first; the Provider owns those concerns and exposes the image-generation service consumed by this Adapter.

## Installation order

1. Read `awesome-dsh-plugins/PLUGIN_INSTALLATION_STANDARD.md` when this repository is available. Record `dsh --version`, Node, and the actual pnpm version in both the source-repository cwd and target profile cwd.
2. Identify the requested mode before touching a profile:
   - stable or cross-machine: use an exact approved image-gen version or tarball;
   - local development: use a separately generated `web-dev` profile and a link only after a local build;
   - never copy another machine's profile, lockfile, `node_modules`, or absolute link.
3. Install and verify the CPA Provider first. The current Provider is private and the image-gen source checkout uses it as a build sibling; a fresh source checkout is not a standalone Git package.
4. For a stable target, use this command shape in a candidate profile:

   ```sh
   dsh plugin --profile <profile> add <approved-cpa-provider-artifact>
   dsh plugin --profile <profile> add <approved-dsh-image-gen-version-or-tarball>
   ```

   Do not replace the placeholders with `#main`, `@latest`, or a path from another machine.
5. To build the source artifact, prepare adjacent staging checkouts, build CPA first, then image-gen:

   ```sh
   cd staging/dsh-cpa-plugin
   pnpm install --frozen-lockfile
   pnpm run typecheck
   pnpm run bundle

   cd ../dsh-image-gen
   PNPM_CONFIG_IGNORE_SCRIPTS=true pnpm install --frozen-lockfile
   pnpm run typecheck
   pnpm run test
   pnpm run build
   pnpm run pack:check
   pnpm run pack:artifact -- --pack-destination /tmp/dsh-image-gen-artifacts
   ```

   Install the resulting tarball into a disposable candidate profile before the formal profile. The pack command sanitizes source-only local dev metadata; do not edit the tarball manually.
6. For local development only, after the explicit build and entry-point checks:

   ```sh
   dsh plugin --profile web-dev add -w \
     "dsh-image-gen@link:/absolute/path/to/dsh-image-gen"
   ```

   A link does not run install, prepare, or build.
7. The Adapter's server-side thumbnail route uses `sharp` as a peer supplied by the DSH Host. Do not add a separate `sharp` dependency to the profile; that can load duplicate native `libvips` libraries on macOS.
8. If pnpm blocks an install script, preserve the exact error and identify whether it is a normal dependency build or a Git outer `prepare` gate. Do not use `strict=false` as a fix; do not add broad approvals; and do not assume the Provider repository's workspace policy applies to the DSH profile.

## Configure and diagnose

1. Verify `dsh --profile <profile> --dump-config` contains both the Provider layer and the `dsh-image-gen` `image-gen` row. The Provider must appear before the Adapter in the installed profile.
2. Start the profile. If port 3080 is already in use, identify the existing DSH process before stopping anything.
3. In **Settings → Plugins → Image generation**, choose the engine and the concrete model from the CPA-provided image-model list, plus workspace controls (**Save to workspace** and its workspace folder). Do not look for or add a provider, endpoint, or credential field in this Adapter's settings. If the list is unavailable, the Provider's engine default remains usable.
4. Provider diagnostics may show the model route selected for the engine, such as `gpt-image-2` or `gemini-3.1-flash-image`. Those model IDs and the protocol are maintained inside the CPA Provider; the Adapter only persists the selected model. Reference-image editing additionally requires a CPA Provider build that exposes the optional `edit` service capability; older Providers remain generation-only.

Never request, print, read back, or commit credentials, response captures, or generated images.

## Smoke-test procedures

The following are procedures, not test results. Report a smoke test as passed only after actually running it, and do not include credentials or response captures in the report.

- **GPT image model:** select any available GPT image model, ask the Agent for a simple square icon, and confirm that it calls `generate_image` and attaches the image to the conversation. The Provider request path is CPA `/v1/images/generations`.
- **Gemini image model:** select any available Gemini image model, use the same kind of explicit image request, and confirm that it calls `generate_image` and attaches the image to the conversation. The Provider request path is CPA `/v1/chat/completions`, with the image read from `choices[0].message.images[].image_url.url`.
- **Reference-image edit:** upload or attach one or more images in the latest human message, ask for an explicit edit such as replacing an outfit, and confirm that the Agent calls `edit_image` (not `bash`) and receives a new image Attachment. GPT uses `/v1/images/edits`; Gemini uses multimodal `/v1/chat/completions`. Report Gemini as passed only after an authenticated relay request actually succeeds.

For removal, run `dsh plugin --profile <profile> remove dsh-image-gen`. Remove the Provider separately only when it is no longer needed by any other Adapter. Do not delete credentials or other Provider state.
