# Image provider API research

Research date: 2026-08-17. This note covers the text-to-image path only. All claims link to the provider's own documentation; model availability and quotas remain account and region dependent.

## Decision summary

| Provider | First implementation path | Adapter decision | Reason |
| --- | --- | --- | --- |
| OpenAI | Images API | One OpenAI-compatible adapter | This is the reference protocol. |
| Volcengine Ark / Seedream | Ark `images/generations` | Reuse the OpenAI-compatible transport, with Ark-specific options | The endpoint, bearer authentication, `model`, `prompt`, `size`, and `data[].url` / `data[].b64_json` convention match; Seedream's extra controls do not. |
| Alibaba Cloud Model Studio / DashScope | `z-image-turbo` multimodal-generation API | A separate DashScope adapter | It uses a different endpoint and nested `input.messages` request and returns a nested image URL. Older Wanx models are asynchronous task APIs. |

The product change is moderate, not a rewrite: retain the common `ImageGenProvider.generate()` result, add an explicit provider discriminator, and add two providers (`openai-compatible`, `dashscope`). Do **not** pretend that every provider accepts the same size/aspect fields. The settings UI needs a provider picker and separate profile fields, especially Alibaba's Workspace endpoint.

## OpenAI Images API

- **Endpoint and authentication:** `POST https://api.openai.com/v1/images/generations`, with `Authorization: Bearer $OPENAI_API_KEY` and JSON. The official guide demonstrates this exact request. [OpenAI image generation guide](https://developers.openai.com/api/docs/guides/image-generation#generate-images)
- **Minimum request:** `{ "model": "gpt-image-2", "prompt": "..." }`. Current GPT Image models include `gpt-image-2`, `gpt-image-1.5`, `gpt-image-1`, and `gpt-image-1-mini`; use an API key from the OpenAI Platform, rather than assuming a ChatGPT subscription is an API credential. [Models and API choices](https://developers.openai.com/api/docs/guides/image-generation#overview)
- **Useful controls:** `n`, `size`, `quality`, `background`, `output_format`, and `output_compression`. GPT Image returns Base64 data in `data[0].b64_json`; output formats are `png` (default), `jpeg`, and `webp`. [Output controls](https://developers.openai.com/api/docs/guides/image-generation#customize-image-output)
- **Size/aspect:** for `gpt-image-2`, `size` can be `auto` or any dimensions that meet documented constraints (each edge <= 3840, multiples of 16, ratio <= 3:1, 655360 to 8294400 pixels). Common values include `1024x1024`, `1536x1024`, and `1024x1536`. Earlier GPT Image models use the familiar square/landscape/portrait choices. [Size constraints](https://developers.openai.com/api/docs/guides/image-generation#size-and-quality-options)
- **Adapter fit:** this defines the OpenAI-compatible adapter. Persist the decoded `b64_json` directly as an attachment. The adapter should still accept a returned URL if a compatible gateway supplies one, then download it before persistence.

## Volcengine Ark / ByteDance Seedream

- **Endpoint and authentication:** `POST https://ark.cn-beijing.volces.com/api/v3/images/generations`, with `Authorization: Bearer $ARK_API_KEY` and JSON. [Ark ImageGenerations API](https://api.volcengine.com/api-docs/view?action=ImageGenerations&serviceCode=ark&version=2024-01-01)
- **Minimum request:** `{ "model": "doubao-seedream-4-0-250828", "prompt": "..." }`. The API accepts either a model ID or a configured Ark endpoint ID. Current Ark product pages list Seedream 5.0 lite, 4.5, and 4.0; the exact model ID must remain a user setting because rollout is account-specific. [Ark model availability](https://www.volcengine.com/product/ark)
- **Controls:** `size` is a vendor size value such as `2K`; `seed`, `guidance_scale`, `watermark`, `stream`, `sequential_image_generation`, and `sequential_image_generation_options` are Ark-specific. `image` accepts URL or Base64 input images for image-to-image workflows. [Request fields](https://api.volcengine.com/api-docs/view?action=ImageGenerations&serviceCode=ark&version=2024-01-01)
- **Response:** `response_format: "url"` returns `data[].url` as a downloadable JPEG; `"b64_json"` returns image Base64 in `data[]`. The response also reports generated pixel dimensions in `data[].size`. [Response format](https://api.volcengine.com/api-docs/view?action=ImageGenerations&serviceCode=ark&version=2024-01-01)
- **Adapter fit:** yes, for v1 text-to-image. Reuse the OpenAI-compatible HTTP request/response path, while allowing a provider-specific options bag so `size`, watermark, and sequential generation are not falsely presented as OpenAI options. For `url`, download immediately and save an attachment; do not expose the temporary provider URL in chat history.

## Alibaba Cloud Model Studio / DashScope

Alibaba has more than one image protocol. A single provider entry should start with one protocol/model family rather than making the UI imply universal compatibility.

### Recommended first path: `z-image-turbo`

- **Endpoint and authentication:** `POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation` (use the corresponding regional Workspace endpoint), with `Authorization: Bearer $DASHSCOPE_API_KEY` and JSON. [Z-Image API reference](https://help.aliyun.com/zh/model-studio/z-image-api-reference)
- **Request:** `{ "model": "z-image-turbo", "input": { "messages": [{ "role": "user", "content": [{ "text": "..." }] }] }, "parameters": { "size": "1120*1440", "prompt_extend": false, "seed": 1 } }`. It is a synchronous, one-text-content request; the model documentation limits the prompt to 800 characters. [Z-Image request parameters](https://help.aliyun.com/zh/model-studio/z-image-api-reference)
- **Response:** the generated image is a temporary PNG URL in `output.choices[0].message.content[]`, in an item of the form `{ "type": "image", "image": "https://..." }`; download it immediately and save the bytes as an attachment. The URL is documented as valid for 24 hours. [Z-Image response](https://help.aliyun.com/zh/model-studio/z-image-api-reference)
- **Size/aspect:** custom `width*height`; documented total-pixel range is 512 by 512 through 2048 by 2048, with 1024 by 1024 through 1536 by 1536 recommended. Use the model's own valid combinations rather than mapping an OpenAI `1024x1536` string blindly. [Z-Image size rules](https://help.aliyun.com/zh/model-studio/z-image-api-reference)

### Other DashScope image families

- **Newer Wan/Qwen image models:** `wan2.7-image(-pro)`, `wan2.6-image`, `wan2.6-t2i`, and Qwen Image use the same nested multimodal message family, but their supported resolutions and synchronous/asynchronous behavior vary. The product overview is the source of the active model matrix. [Image generation overview](https://help.aliyun.com/zh/model-studio/text-to-image)
- **Older Wanx/text-to-image API:** create an async task with `POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis`, `X-DashScope-Async: enable`, and a nested `{ input, parameters }` body; poll `GET https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/tasks/{task_id}`. A successful result is `output.results[].url`, a temporary PNG URL. [Wanx HTTP API](https://help.aliyun.com/zh/model-studio/text-to-image-v2-api-reference)
- **Adapter fit:** no. DashScope needs a dedicated adapter for the nested request and URL extraction. Supporting both synchronous multimodal models and asynchronous Wanx task polling is a second phase, not a small configuration tweak.

## Implementation implications

1. Add providers in two steps: **OpenAI + Ark/Seedream** first, then **DashScope `z-image-turbo`**. This delivers all three vendors without adding asynchronous polling.
2. Add per-provider credential references: `OPENAI_API_KEY`, `ARK_API_KEY`, and `DASHSCOPE_API_KEY`. Keep keys in DSH credentials, never ordinary settings fields.
3. Change the UI label from `Google Gemini` to `Image generation`, then show only fields valid for the selected provider. Alibaba must collect a Workspace endpoint (or workspace ID plus region), not just a key and model.
4. Keep one normalized result: `{ data: Uint8Array, mediaType: string }`. URL-returning vendors require a server-side download before `attachments.saveImage()`; OpenAI and Ark Base64 results decode directly.
5. Defer image editing/reference images, multiple images, streaming, and DashScope async polling until text-to-image is stable. Those features change the tool schema and test surface materially.
