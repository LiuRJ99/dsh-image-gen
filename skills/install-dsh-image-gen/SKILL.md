---
name: install-dsh-image-gen
description: Install, configure, diagnose, verify, or remove the CPA-backed dsh-image-gen Adapter in a DeepSeek Harness Web profile.
---

# Install DSH Image Gen

`dsh-image-gen` is an Adapter. It does not own provider credentials, model IDs, or HTTP protocol details. Install the CPA Provider first; the Provider owns those concerns and exposes the image-generation service consumed by this Adapter.

## Installation order

1. Confirm `dsh` runs and record `dsh --version`.
2. Ask which Web profile to change if the user did not name one. Default to `web` only when that profile already exists.
3. For either a registry package or a local tarball, use this command shape:

   ```sh
   dsh plugin --profile <profile> add <package-or-tarball>
   ```

   Install the CPA Provider first:

   ```sh
   dsh plugin --profile <profile> add @LiuRJ99/dsh-cpa-plugin
   ```

4. Install the Adapter only after the Provider:

   ```sh
   dsh plugin --profile <profile> add dsh-image-gen@0.4.1
   ```

   The same command accepts local tarballs in the same order. For example:

   ```sh
   dsh plugin --profile <profile> add ./path/to/dsh-cpa-plugin-0.3.0.tgz
   dsh plugin --profile <profile> add ./path/to/dsh-image-gen-0.4.1.tgz
   ```

5. The Adapter's server-side thumbnail route uses `sharp` as a peer supplied by the DSH Host. Do not add a separate `sharp` dependency to the profile; that can load duplicate native `libvips` libraries on macOS.
6. If pnpm blocks a dependency's `prepare` script, explain that the allowance executes repository code during installation. Add only the exact package key pnpm reports to the profile's `pnpm-workspace.yaml`, then retry after the user approves.

## Configure and diagnose

1. Verify `dsh --profile <profile> --dump-config` contains both the Provider layer and the `dsh-image-gen` `image-gen` row. The Provider must appear before the Adapter in the installed profile.
2. Start the profile. If port 3080 is already in use, identify the existing DSH process before stopping anything.
3. In **Settings → Plugins → Image generation**, configure only the `engine` (`GPT Image 2` or `Gemini Image`) and workspace controls (**Save to workspace** and its workspace folder). Do not look for or add a provider, endpoint, raw model, or credential field in this Adapter's settings.
4. Provider diagnostics may show the model route selected for the engine, such as `gpt-image-2` or `gemini-3.1-flash-image`. Those model IDs and the protocol are maintained inside the CPA Provider; do not copy them into Adapter settings.

Never request, print, read back, or commit credentials, response captures, or generated images.

## Smoke-test procedures

The following are procedures, not test results. Report a smoke test as passed only after actually running it, and do not include credentials or response captures in the report.

- **GPT Image 2:** select `GPT Image 2`, ask the Agent for a simple square icon, and confirm that it calls `generate_image` and attaches the image to the conversation. The Provider request path is CPA `/v1/images/generations`.
- **Gemini Image:** select `Gemini Image`, use the same kind of explicit image request, and confirm that it calls `generate_image` and attaches the image to the conversation. The Provider request path is CPA `/v1/chat/completions`, with the image read from `choices[0].message.images[].image_url.url`.

For removal, run `dsh plugin --profile <profile> remove dsh-image-gen`. Remove the Provider separately only when it is no longer needed by any other Adapter. Do not delete credentials or other Provider state.
