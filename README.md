# dsh-image-gen

English | [简体中文](README.zh-CN.md)

`dsh-image-gen` is an installable DeepSeek Harness (DSH) Bundle that contributes a native `generate_image` tool and renders durable image result cards directly in Web conversations.

![Chat Preview](docs/assets/chat-preview.png)

---

## ✨ Features

- **Multi-Provider Support**: Seamless integration with **Google Gemini**, **OpenAI / OpenAI-compatible relays**, and **ByteDance Seedream (Volcengine Ark)**.
- **Secure Credential Management**: Write-only API Key storage powered by DSH `credentials` service. Keys are never logged or exposed in plaintext.
- **Web Settings Integration**: Built-in settings card in DSH Settings with auto-filled defaults and one-click endpoint reset.
- **Durable Media Persistence**: Generated images are automatically saved to DSH conversation attachment storage and rendered in rich UI cards.

![Settings Preview](docs/assets/settings-preview.png)

---

## 📦 Supported Providers

| Provider | Credential Key | Default Model | Default Endpoint / Base URL | Note |
| :--- | :--- | :--- | :--- | :--- |
| **Google Gemini** | `GEMINI_API_KEY` | `gemini-3.1-flash-image` | `https://generativelanguage.googleapis.com/v1beta/interactions` | Native Gemini Interactions API |
| **OpenAI / Relay** | `OPENAI_API_KEY` | `gpt-image-2` | `https://api.openai.com/v1` | Standard OpenAI / OneAPI / NewAPI |
| **ByteDance Seedream** | `ARK_API_KEY` | `doubao-seedream-5-0-260128` | `https://ark.cn-beijing.volces.com/api/v3` | Volcengine Ark Doubao T2I |

---

## 🚀 Installation & Usage

### 1. Install Plugin

In your DeepSeek Harness workspace, add the plugin to your profile (default `web`):

```bash
# Install via npm (when published)
dsh plugin --profile web add dsh-image-gen

# Or install from local path (development)
dsh plugin --profile web add /path/to/dsh-image-gen
```

### 2. Configure in Web UI

1. Open DSH Web UI (e.g. `http://localhost:3080`).
2. Navigate to **Settings → Plugins → Image generation (图像生成)**.
3. Select your provider, enter the API Key, verify or customize endpoint / model, and click **Save**.

### 3. Generate Images

Start a conversation and ask the agent naturally:
> *"Generate a realistic picture of a Holstein cow in a green meadow with wildflowers under golden sunlight."*

The model will automatically invoke `generate_image`, fetch the image, and render it inline.

---

## 🛠️ Development

```bash
# Install dependencies
pnpm install

# Typecheck
pnpm run typecheck

# Run unit tests
pnpm run test

# Build host and client bundles
pnpm run build

# Verify packaging
pnpm run pack:check
```

---

## 📄 License

[MIT](LICENSE)

