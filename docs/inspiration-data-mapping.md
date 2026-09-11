# Inspiration data synchronization

This package bundles the snapshot from `upstream/main` at
`src/inspiration/data/awesome-gpt-image-2.json` and its companion version marker
`c7d293963b21c60bf338003915438cc5c39dd3ca`. The snapshot contains 541 cases,
13 categories, 19 styles, and 10 scenes. Its canonical JSON integrity digest is
`2c3fa2e62887d3d50c8f9684f84949201daeefabec9c15dbe744bd8f55db1304`.

## Field mapping

The adapter in `src/inspiration.ts` normalizes the upstream document once at the
boundary. The fork's flat catalog contract remains the public route/client
shape; upstream-only metadata is retained instead of being discarded.

| Upstream field | Fork normalized field | Mapping / fallback |
| --- | --- | --- |
| `repository` | `catalog.repository` | Preserved and pinned to the fixed upstream repository. |
| `totalCases` | `catalog.totalCases` | Preserved as the source total. Filtered responses keep this value at 541. |
| `categories` | `catalog.categories` | Preserved as the 13-item dimension list. |
| `styles` | `catalog.styles` | Preserved as the 19-item dimension list. |
| `scenes` | `catalog.scenes` | Preserved as the 10-item dimension list. |
| `cases[].id` (number) | `case.id` (string), `case.upstreamId` (number) | Canonical id is `String(id)`; the numeric id is retained for validation and traceability. |
| `cases[].title` | `case.title` | Preserved. |
| `cases[].image` (`/images/caseN.jpg` or `.png`) | `case.imagePath`, `case.imageMediaType` | Leading `/` is removed; the filename must match the numeric id. MIME type is derived from the extension, including the 13 PNG records. |
| `cases[].imageAlt` | `case.imageAlt` | Preserved; used as the accessible image label. |
| `cases[].sourceLabel` | `case.sourceLabel` | Preserved when non-empty. |
| `cases[].sourceUrl` | `case.attributionUrl` | Preserved only as attribution metadata. It is never treated as a fetch URL. |
| `cases[].githubUrl` | `case.githubUrl` | Preserved as validated attribution metadata. |
| `cases[].prompt` | `case.prompt` | Preserved with a 16 KiB defensive bound (the snapshot maximum is 8,143 characters). |
| `cases[].promptPreview` | `case.promptPreview` and compatibility `case.description` | Preserved; if missing, the adapter derives a bounded preview from `prompt`. |
| `cases[].category` | `case.category` | Preserved; missing values use `Other Use Cases`. |
| `cases[].styles` | `case.styles` and compatibility `case.style` | The full array is preserved; `style` is the first value for older fork callers. Empty arrays use `Other Use Cases` only for the compatibility scalar. |
| `cases[].scenes` | `case.scenes` and compatibility `case.scene` | The full array is preserved; `scene` is the first value for older fork callers. Empty arrays use `Other Use Cases` only for the compatibility scalar. |
| `cases[].featured` | `case.featured` | Preserved; the UI no longer hard-codes a single featured id. |
| — | `case.source` | `builtin` for the bundled snapshot; a fixed `mirror`, `jsdelivr`, or `github` id for a validated refresh. |

The old fork `sourceUrl` field remains reserved for an allowlisted asset URL,
so it is deliberately not overloaded with upstream attribution links.

## Data carrier decision

The 541-case JSON is shipped as a package data file and imported by the host
bundle. This avoids expanding `src/inspiration.ts` into thousands of lines and
keeps the feature available offline. The JSON and version marker are explicitly
listed in `package.json.files` so they are present in the `file:` tarball.

A refresh is still attempted only through the fixed mirror → jsDelivr → GitHub
source paths pinned to the snapshot ref. If every source fails, or the response
fails schema/source validation, the route returns the last valid disk catalog and
then the bundled 541-case catalog. Image failures retain the fork's bounded disk
cache and generated SVG fallback; no browser-provided URL is proxied.
