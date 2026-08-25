# Brainstorm Summary

- Change: dsh-image-gen-cpa-adapter
- Date: 2026-08-25

## 确认的技术方案

- Provider/Adapter 分离：`dsh-cpa-plugin` 是唯一的图片网络和 credential owner；`dsh-image-gen` 只调用 `dshCpaImageGeneration`。
- Adapter 的 Host 配置只保留 `engine: 'gpt' | 'gemini'`、工作区保存和文件夹字段，默认 engine 为 `gpt`。
- 生成工具、Attachment、图片 route、workspace save 和 Gallery 保持原有用户体验；只替换生成来源和 provider 元数据为 engine 标签。
- DSH Bundle 通过服务依赖接入 Provider，缺少服务时不注册误导性的 direct-provider fallback。
- 同时保留 `package.json` 的 DSH manifest，并增加 `.codex-plugin/plugin.json` 和 `skills/imagegen/SKILL.md`。
- 目标测试环境是本机 DSH web profile，Provider 与 Adapter 以本地包安装，不先合并主分支。

## 关键取舍与风险

- 不在 Adapter 中读取或存储 API key、endpoint、raw model；GPT/Gemini 模型 ID 和协议全部由 Provider 管理。
- 旧 Gallery 记录中的 `provider: 'openai'|'google'` 映射为 `engine: 'gpt'|'gemini'`，Attachment ID 不变；未知 provider 保留可诊断的未知标签。
- 删除 direct provider transport 会是本 change 的一次性迁移；测试先覆盖 engine-only contract，再删除无调用方的 provider 文件。
- 真实 relay smoke 需要 DSH credential；没有 credential 时只报告未验证范围，不输出 secret。

## 测试策略

- 配置测试验证默认 engine、旧字段迁移/忽略和 workspace 默认值。
- CPA service contract 测试注入 fake service，验证 engine、prompt、可选尺寸和 AbortSignal 的完整转发，并确认 Adapter 不解析 credential。
- Gallery 测试覆盖旧记录、新记录和未知记录。
- 构建/包检查确认不包含 direct provider 文件、response capture、secret 或绝对路径。
- 在安装到 DSH profile 后，执行 Provider/Adapter focused tests、bundle 和最小跨包 import 验证，再在有 credential 时执行 GPT/Gemini smoke。

## Spec Patch

无。现有 OpenSpec specs 已覆盖服务依赖、engine-only 配置、Attachment/Gallery 保留、原生插件分发和缺少 Provider 的诊断行为。
