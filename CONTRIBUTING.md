# Contributing

Bug reports should include the DSH version, Node version, selected image provider & model, and the complete redacted tool error. Never include an API key.

Before opening a pull request, prepare the CPA sibling required by the source-only build, then run:

```sh
# dsh-cpa-plugin and dsh-image-gen are adjacent staging checkouts.
cd ../dsh-cpa-plugin
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run bundle

cd ../dsh-image-gen
PNPM_CONFIG_IGNORE_SCRIPTS=true pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run build
pnpm run pack:check
```

For a distributable artifact, run `pnpm run pack:artifact -- --pack-destination <directory>` and install that tarball into a candidate DSH profile. Do not use a source checkout or a local `link:` as a cross-machine artifact.

Keep provider adapters in `src/google.ts` and `src/openai-compatible.ts`, shared constants in `src/shared.ts`, DSH registration in `src/index.ts`, and browser presentation in `src/client/index.tsx`.

