---
name: imagegen
description: Generate images in DeepSeek Harness through the CPA-backed dsh-image-gen Adapter.
---

# DSH Image Generation

Call `generate_image` only when the user explicitly asks for an image to be generated, drawn, or created. Do not call it for a discussion about image prompts, a request to describe an existing image, or a request that does not ask for image generation.

Before calling the tool, turn the user's request into a complete visual prompt. Include the subject, composition, visual style, lighting, and any exact text that must appear in the image. Preserve user-specified wording for text and make unspecified visual details concrete without asking for provider-specific settings.

The available engine labels are:

- `GPT Image 2`
- `Gemini Image`

The CPA Provider owns model IDs, protocol selection, credentials, and HTTP requests. Do not ask the user for credentials, read credentials, or expose them in a prompt or response.

After a successful `generate_image` call, treat the result as already attached to the conversation and tell the user it is available there. Do not use `read`, `glob`, `find`, shell commands, or other file-reading tools to inspect or verify the generated file.
