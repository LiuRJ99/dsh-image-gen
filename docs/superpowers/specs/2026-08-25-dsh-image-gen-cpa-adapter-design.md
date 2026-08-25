---
comet_change: dsh-image-gen-cpa-adapter
role: technical-design
canonical_spec: openspec
---

# CPA-backed dsh-image-gen 技术设计

## 目标与边界

本 change 将 fork 版 `dsh-image-gen` 改造成独立的原生 DSH 图片插件：保留现有 `generate_image` 工具、Attachment 持久化、图片 HTTP route、workspace save、会话卡片和 Gallery；把 GPT/Gemini 图片请求切换为调用 `dsh-cpa-plugin` 提供的 `dshCpaImageGeneration` Host service。

本 change 不实现 CPA 路由、账号选择、模型发现、credential 解析或新的图片协议，不在 Adapter 中保留 direct-provider fallback。Provider 仍是 `gpt-image-2`、`gemini-3.1-flash-image`、CPA endpoint 和 API key 的唯一 owner。

## 运行时架构

```text
generate_image
      │ engine + prompt + options + AbortSignal
      ▼
dsh-image-gen Host Bundle
      │ injected dshCpaImageGeneration
      ▼
dsh-cpa-plugin Host service
      ├─ engine=gpt    → /v1/images/generations → gpt-image-2
      └─ engine=gemini → /v1/chat/completions  → gemini-3.1-flash-image
      │ normalized Uint8Array + mediaType
      ▼
Attachment.saveImage → conversation presentation
      ├─ optional workspace file
      └─ Gallery metadata with engine
```

`src/index.ts` 通过 Cordis injection 声明 `dshCpaImageGeneration` 依赖。服务不可用时，工具不注册或给出明确的 service-unavailable 诊断；不能继续注册直接访问供应商的工具。工具执行时只从当前 settings 读取 engine 和 workspace 选项，把完整 prompt、`aspectRatio`、`imageSize`、`size` 及 `exec.signal` 传给服务。

## 配置契约

`src/config.ts` 的公共 `Config` 收敛为：

```ts
interface Config {
  engine?: 'gpt' | 'gemini'
  saveToWorkspace?: boolean
  workspaceFolder?: string
}
```

Schema 默认 `engine: 'gpt'`、`saveToWorkspace: true` 和既有 `dsh-image-gen` workspace 子目录。旧的 `provider`、endpoint、model、credential 字段可以被读取以完成一次兼容迁移，但不再出现在新配置输出或设置页面，也不参与网络请求。

设置卡只显示 `GPT Image 2`、`Gemini Image`、workspace 保存开关和相对文件夹。UI 不渲染 API key、endpoint、raw model，也不向浏览器发送 credential。

## 生成结果与 Gallery 迁移

生成结果内部使用 `engine: 'gpt' | 'gemini'`，继续携带 Attachment ref、prompt、output 描述和可选 `savedTo/saveError`。Provider model ID 不作为用户配置字段；如历史 Gallery 记录仍有 model，可作为兼容展示数据但不参与下一次路由。

读 Gallery 时执行一次规范化：`provider: 'openai'` 映射为 `engine: 'gpt'`，`provider: 'google'` 映射为 `engine: 'gemini'`；新记录直接写 engine。Attachment ID、prompt、output 和现有复制/下载/全屏行为保持不变。未知 provider/engine 不猜测映射，保留记录并显示可诊断的 unknown 标签。

## 发布与插件元数据

`package.json` 保留 DSH 的 `dsh.bundle.patch` 和 `dsh.client` manifest，并新增 `@LiuRJ99/dsh-cpa-plugin` 的 peer/dev contract 依赖以及 `./image-generation` 类型导入所需的包入口。发布文件包含构建产物、类型、skill、文档、DSH patch 和 `.codex-plugin/plugin.json`。

`.codex-plugin/plugin.json` 只声明 ImageGen 插件身份和 `skills/imagegen/SKILL.md`，不包含绝对路径、API key 或 DSH 内部私有路径。ImageGen skill 指导显式图片请求调用 `generate_image`，要求完整视觉 prompt，说明 GPT Image/Gemini Image 两个 engine，并禁止通过读取生成文件来验证工具成功。

## 错误与取消

- CPA service rejection 原样作为工具错误边界，不重新包装为 credential 或 provider 错误。
- 工具执行的 AbortSignal 原样传入 CPA service；取消后不保存部分 Attachment，也不把 workspace 写入失败误报为生成失败。
- Attachment 保存成功但 workspace 写入失败时，保留成功结果并填充 `saveError`，与现有行为一致。
- 缺少 CPA service 时输出稳定诊断，避免静默切换到第二个网络 owner。

## 文件级实施设计

- `src/config.ts`、`src/shared.ts`：engine-only schema、默认值和兼容迁移。
- `src/index.ts`：注入 CPA service，删除 direct provider imports，保留工具/Attachment/route/save flow。
- `src/google.ts`、`src/openai-compatible.ts`、`src/dashscope.ts`：删除运行时 owner，并同步依赖/测试。
- `src/client/index.tsx`：只保留 engine 与 workspace 设置，替换 provider/key/endpoint/model 文案。
- `src/client/gallery-store.ts`、`src/client/gallery-view.tsx`：engine 规范化与标签展示。
- `package.json`、`cordis.patch.yml`、`.codex-plugin/plugin.json`、`skills/imagegen/SKILL.md`、README：完成两套运行时/原生插件分发元数据。
- `tests/*.spec.ts`：先覆盖配置、服务契约、Gallery 迁移，再运行构建/打包与 DSH profile 联调。

## 验证策略

1. focused unit tests：配置、service contract、Gallery migration、workspace/route 既有回归。
2. static/build：`pnpm run typecheck`、`pnpm run build`、`pnpm pack --dry-run`；确认 direct-provider 文件、secret-like fixture 和本地响应不进入包。
3. cross-package：Provider `./image-generation` 公共入口可被 Adapter 类型检查和运行时导入；DSH profile 能解析两个插件的 package manifest。
4. real smoke：在 DSH credential 已配置时各执行 GPT 和 Gemini 一次，只记录 engine、path、status、media type 和 byte count；没有 credential 时记录 credential-missing，不扩大结论。
