---
name: imagegen
description: Generate images in DeepSeek Harness through the CPA-backed dsh-image-gen Adapter.
---

# DSH Image Generation

Call `generate_image` only when the user explicitly asks for a new image to be generated, drawn, or created. Call `edit_image` when the user asks to edit, combine, restyle, or replace content in one or more existing images. Do not call either tool for a discussion about prompts, a request to describe an existing image, or a request that does not ask for image output.

Before calling the tool, turn the user's request into a complete visual prompt. Include the subject, composition, visual style, lighting, and any exact text that must appear in the image. Preserve user-specified wording for text and make unspecified visual details concrete without asking for provider-specific settings.

The available engine labels are:

- `GPT Image` — the settings card may expose one or more CPA GPT image models; use `size` (`1024x1024`, `1024x1792`, or `1792x1024`) for framing.
- `Gemini Image` — the settings card may expose one or more CPA Gemini image models; use `aspect_ratio` and `image_size` for framing and resolution.

The CPA Provider owns model IDs, protocol selection, credentials, and HTTP requests. Do not ask the user for credentials, read credentials, or expose them in a prompt or response. `edit_image` uses the inline images from the latest human message in upload order unless explicit attachment IDs or workspace paths are supplied. Never use `bash`, `read`, `glob`, `find`, or file copying to locate inline attachments. If `edit_image` is not registered because an older CPA Provider lacks the optional `edit` capability, explain that reference-image editing is unavailable instead of falling back to shell commands or claiming success.

After a successful `generate_image` or `edit_image` call, treat the result as already attached to the conversation and tell the user it is available there. Only a successful tool result is evidence that an image was created. Do not use file-reading tools to inspect or verify the generated file.
