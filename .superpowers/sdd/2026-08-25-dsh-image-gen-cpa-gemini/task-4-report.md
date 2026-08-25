# Adapter Task 4 报告

日期：2026-08-25

## 范围

将 forked image plugin 的 Host/config/tool 运行时路径收敛到 `engine: 'gpt' | 'gemini'`，通过 Provider 暴露的 `dshCpaImageGeneration` service contract 生成图片；未修改 Provider 仓库，也未实现 Task 5/6 的 UI、Gallery、Codex manifest、skill 或 README 工作。

## 改动文件

- `src/index.ts`：注入并调用 `@LiuRJ99/dsh-cpa-plugin/image-generation` 的 `dshCpaImageGeneration` service，移除 credentials 和直接供应商实现；保留 `generate_image`、Attachment、取消信号、保存和 presentation 输出语义。
- `src/config.ts`：配置改为 engine-only，默认 `gpt`，保留 workspace 和图像尺寸相关配置。
- `src/shared.ts`：使用 Provider 的 `ImageEngine` contract；为未完成的 Task 5 浏览器 UI 暂时保留旧 provider 常量，Host 配置和 tool 不再使用它们。
- `package.json`、`pnpm-lock.yaml`：声明 `@LiuRJ99/dsh-cpa-plugin` `>=0.3.0 <0.4.0` peer contract，并使用本地 Provider tarball 作为开发依赖；移除 Host 对 `dsh-credentials` 的直接依赖。
- `cordis.patch.yml`：默认配置改为 `engine: gpt`。
- `tests/config.spec.ts`：覆盖 engine 默认值、合法 Gemini 配置和 provider 值拒绝。
- `tests/cpa-service-contract.spec.ts`：覆盖 CPA service 注入、engine-only 调用参数、signal 和 Attachment 输出。
- 删除 `src/google.ts`、`src/openai-compatible.ts`、`src/dashscope.ts` 及对应的三个直接供应商测试文件。

## 验证

| 命令 | 退出码 | 结果 |
| --- | ---: | --- |
| `pnpm exec vitest run tests/config.spec.ts tests/cpa-service-contract.spec.ts`（实现前） | 1 | 预期的红测试：旧 provider 默认/校验失败，且旧入口仍导入已移除的 credentials。 |
| `pnpm install --frozen-lockfile --ignore-scripts` | 0 | 锁文件安装完成。 |
| `pnpm exec vitest run tests/config.spec.ts tests/cpa-service-contract.spec.ts` | 0 | 2 个文件、4 个测试通过。 |
| `pnpm test` | 0 | 3 个测试文件、16 个测试通过。 |
| `git diff --check` | 0 | 无 whitespace 错误。 |
| `pnpm run typecheck` | 2 | 失败位置仅在 Provider 公共类型源码的严格索引检查：`image-generation.ts:290` 的 `TS2345` 和 `:296` 的 `TS2532`。 |
| `pnpm run build` | 2 | 因上述 Provider 公共类型错误失败，未进入成功构建结论。 |
| `pnpm run pack:check` | 2 | 因上述 build 错误失败。 |
| `pnpm exec tsc --noEmit --noUncheckedIndexedAccess false` | 0 | 关闭该严格选项后的诊断性类型检查通过；不是项目标准 typecheck 结论。 |
| `pnpm exec tsc --noUncheckedIndexedAccess false`；`pnpm exec tsdown` | 0 / 0 | 关闭该严格选项后可生成 bundle；仅用于检查 Adapter 编译/打包路径。 |
| `npm pack --dry-run --ignore-scripts --cache /private/tmp/dsh-image-gen-npm-cache` | 0 | 在上述诊断性 bundle 后 dry-run 列出 18 个包文件；绕过了生命周期脚本。 |

## 未能确认范围

- 无法确认在当前 Provider 本地 tarball 的公开 type entry 与 Adapter 的 `noUncheckedIndexedAccess` 配置下，标准 `typecheck`、`build` 和 `pack:check` 能够成功；失败来自 Provider 公共类型源码，按任务边界未修改 Provider 仓库。
- 未执行真实 CPA relay、GPT/Gemini 供应商调用或生产 credentials 的端到端 smoke test；没有把密钥、生成图片或响应捕获写入仓库。
- Task 5 的浏览器 UI/Gallery 仍包含旧 provider 展示和 credential 文案，这是按任务要求保留的后续工作；本任务的 Host config/tool/runtime 已切换为 engine-only 和 CPA service contract。
