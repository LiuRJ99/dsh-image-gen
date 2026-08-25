## 1. CPA 服务接入

- [x] 1.1 将 `src/config.ts`/`src/shared.ts` 收敛为 `engine: 'gpt' | 'gemini'`、工作区保存和文件夹配置，默认 engine 为 `gpt`。
- [x] 1.2 在 `src/index.ts` 中声明并解析 `dshCpaImageGeneration` 依赖，移除 provider-specific credential resolution 和直接供应商客户端导入。
- [x] 1.3 保持 `generate_image` 工具、Attachment 输出和取消信号语义不变，转发 engine、prompt、aspect ratio、image size 和 size 到 CPA 服务。
- [x] 1.4 新增 `tests/cpa-service-contract.spec.ts` 与配置测试，验证服务参数转发、无密钥解析和缺少服务时的诊断行为。
- [x] 1.5 删除不再使用的 `src/google.ts`、`src/openai-compatible.ts`、`src/dashscope.ts`，同步清理依赖与运行时包文件。

## 2. 设置与 Gallery 迁移

- [x] 2.1 修改 `src/client/index.tsx` 设置卡，只保留 GPT Image 2/Gemini Image 引擎、工作区保存开关和相对文件夹字段。
- [x] 2.2 从设置接口和 UI 中移除 API key、endpoint 与 raw model 字段，确认页面不渲染供应商凭据。
- [x] 2.3 在 `src/client/gallery-store.ts` 中增加 engine 元数据规范化，将旧的 OpenAI/Google provider 映射为 gpt/gemini，并保留 Attachment ID。
- [x] 2.4 更新 `src/client/gallery-view.tsx` 和图片卡片的引擎标签，保持复制、下载、全屏和现有二进制存储行为。
- [x] 2.5 新增 Gallery 迁移测试，覆盖旧记录、新记录和未知记录的可诊断处理。

## 3. DSH 与 Codex 插件交付

- [x] 3.1 更新 `package.json`、`cordis.patch.yml` 和依赖声明，保留 DSH Bundle/client manifest 并声明 CPA 服务契约。
- [x] 3.2 创建 `.codex-plugin/plugin.json`，指向 `skills/imagegen`，不使用绝对路径或本地密钥。
- [x] 3.3 创建 `skills/imagegen/SKILL.md`，指导显式生图请求调用 `generate_image`，描述两个引擎并禁止读取文件验证结果。
- [x] 3.4 更新安装 skill、README 中英文文档，说明先安装/配置 dsh-cpa-plugin，再使用 ImageGen；不再指导插件保存供应商 key。
- [x] 3.5 更新发布文件清单，确保原生 DSH manifest、Codex manifest、skill 和文档均进入包内。

## 4. 验证与联调

- [x] 4.1 运行配置、CPA service contract 和 Gallery focused tests，修复本 change 引入的失败。
- [x] 4.2 运行诊断性 TypeScript 类型检查、构建和 package dry-run，确认无 direct-provider 文件或本地响应捕获进入产物；严格检查范围和本地依赖缓存限制见验证报告。
- [x] 4.3 在 Provider change 完成后，通过本地 CPA relay 分别执行 GPT Image 2 与 Gemini Image smoke test；Provider 实际解码器验证通过，Adapter 的 Attachment/Gallery/UI 全链路仍单独保留为后续验证。
- [x] 4.4 验证普通 CPA 模型选择器隐藏 `gpt-image-2`/`gemini-3.1-flash-image`，同时保留 `gemini-3.1-flash-lite`。
- [x] 4.5 记录跨仓库验证命令、退出码和未能确认的范围，不把本地 relay 结果外推为生产验证。
