# Task 4 review-fix report

日期：2026-08-25

基线：`17ae42d`

## 修复范围

### 1. Provider peer contract 与可移植安装

- 从 `package.json` 的 `devDependencies` 移除了 Provider 本机 tarball 依赖。
- 保留可发布的 `@LiuRJ99/dsh-cpa-plugin` peer contract：`>=0.3.0 <0.4.0`。
- 从 `pnpm-lock.yaml` 移除了 Provider 的 `file:` 路径、Provider snapshot 及其仅由该本机包引入的依赖图；锁文件中不再包含本机 Provider 路径。
- 新增 `pnpm-workspace.yaml`，设置 `autoInstallPeers: false`。这是 pnpm 11 在不把未安装的 Provider peer 重新解析进 lockfile 的项目级配置；因此 Provider 必须作为 peer 先安装，才能进行本地类型检查和运行时 Host service 验证。该文件不包含 Provider 路径、endpoint 或 key。

### 2. engine-only Config

- `src/config.ts` 保留根 schema 为 schemastery object，并通过公开的 `z.resolve(data, schema, options, true)` strict 参数处理调用和构造入口。
- 旧的 `provider`、`credentialRef` 及其他未声明字段被一致地显式剥离；声明的 `engine`、workspace 字段仍按 schema 校验并填充默认值。
- `tests/config.spec.ts` 增加旧 provider/credentialRef/未声明字段的负例，并验证 schema 仍可作为 object 序列化。

## 改动文件

- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `src/config.ts`
- `tests/config.spec.ts`
- 本报告文件

未修改 Provider 仓库，也未修改 UI、Gallery、README 或 manifest 文件。

## 验证

| 命令 | 退出码 | 结果 |
| --- | ---: | --- |
| `pnpm install --lockfile-only --offline --ignore-scripts --config.confirmModulesPurge=false --config.autoInstallPeers=false` | 0 | 生成无 Provider 本机路径的 lockfile。 |
| `pnpm install --frozen-lockfile --lockfile-only --offline --ignore-scripts --config.confirmModulesPurge=false` | 0 | 项目级 peer 安装策略下的冻结 lockfile 检查通过。 |
| `./node_modules/.bin/vitest run tests/config.spec.ts tests/cpa-service-contract.spec.ts` | 0 | 2 个文件、6 个测试通过。使用当前已安装的本地 Provider peer，未重新安装或清理。 |
| `./node_modules/.bin/tsc --noEmit` | 2 | 仅报告当前已安装 Provider 公共类型源码的既有 `TS2345`、`TS2532`；未出现 Adapter 新增诊断。 |
| `pnpm exec vitest run tests/config.spec.ts tests/cpa-service-contract.spec.ts` | 1 | pnpm 尝试在无 TTY 下清理与新 lockfile 不一致的旧 `node_modules` 后中止；随后使用现有 `.bin` 直接运行同一 focused tests 并通过。 |

## 未能确认范围

- 无法确认在没有预先安装 Provider peer 的全新环境中，标准 `typecheck`、build 和 pack 流程能够通过；当前 typecheck 阻塞仅来自 Provider 公共类型的严格索引诊断，按任务边界未修改 Provider。
- 未执行真实 CPA relay、供应商调用或生产 credentials 的端到端验证。
