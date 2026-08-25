## 上下文

动机和范围见 `proposal.md`。当前 fork 版在 `src/index.ts` 中管理四类供应商配置并解析各自凭据，设置卡也展示供应商、endpoint 和 raw model 字段。现有附件保存、工作区写入和 Gallery 流程已经稳定，应在替换请求来源时保持不变。上游 Provider change 将提供 `dshCpaImageGeneration` 服务和 `gpt | gemini` 两个引擎。

## 目标与非目标

**目标：**

- 用注入的 CPA 图片服务替代直接供应商 HTTP 请求和凭据解析。
- 保持 `generate_image` 工具、附件卡片、工作区保存和 Gallery 行为稳定。
- 只展示简单的 `GPT Image 2` 或 `Gemini Image` 引擎选择，不暴露 raw model 或 key。
- 迁移旧 Gallery 元数据，不改变已有附件 ID。
- 同时交付 DSH runtime metadata 和可复用的 Codex `.codex-plugin` wrapper。

**非目标：**

- 不在本仓库重新实现 CPA 路由、账号选择、模型发现或认证。
- 不增加参考图编辑、多图输出、视频输入或自动引擎能力发现。
- 不把 OpenAI、Google、Seedream 或 DashScope 凭据保留为隐藏 fallback。

## 技术决策

### 1. 使用只包含引擎的 Host 配置

将 Host `Config` 收敛为 `engine: 'gpt' | 'gemini'`、`saveToWorkspace` 和 `workspaceFolder`，默认引擎为 `gpt`。工具执行时把引擎、提示词、尺寸参数和 `AbortSignal` 转发给 `dshCpaImageGeneration.generate`。插件不读取 CPA 模型 ID，也不解析任何 credential reference。

这样插件可以复用不同 CPA 账号的模型路由，模型策略集中在 Provider。保留 direct-provider fallback 会重新制造本次 change 要消除的配置分叉，因此不采用。

### 2. 将 CPA 声明为运行时服务依赖

通过 DSH Bundle 的依赖/注入声明接入 `dshCpaImageGeneration`，只有服务可用时才注册图片工具。包同时暴露服务契约的类型/运行时依赖，并保留既有 DSH `dsh.bundle` 与 `dsh.client` 元数据。未安装 CPA 时必须给出明确诊断，不能静默切换到第二个网络所有者。

### 3. 保留持久化图片路径

继续使用 `saveGenerated`、DSH attachment service、图片 route 和 workspace writer，只替换 `GeneratedValue` 的来源，并把 provider 元数据改成 engine 标签。Gallery 记录增加 `engine: 'gpt' | 'gemini'`；旧记录中的 `provider: 'openai'` 映射为 `gpt`，`provider: 'google'` 映射为 `gemini`，附件 ID、prompt 和 output 字段保持不变。

### 4. 简化设置但保留仍有意义的用户控制

设置卡只包含引擎、工作区保存开关和工作区文件夹，删除 API key、endpoint 与 raw model 输入。稳定显示 `GPT Image 2` 和 `Gemini Image`，底层模型 ID 由 CPA 维护。

### 5. Codex 元数据采用增量包装

新增 `.codex-plugin/plugin.json` 并指向 ImageGen skill，不替换 `package.json` 中的 DSH runtime manifest 或原生 client patch。ImageGen skill 只描述工具调用和 CPA 配置，不包含 secret 或 direct-provider setup 命令。

### 6. 先用假服务验证，再做 relay 冒烟

单元测试注入假 CPA 服务，断言引擎、提示词、选项和取消信号的完整转发，并确认没有 credential resolution。后续端到端冒烟测试使用本地 CPA relay 验证 GPT 和 Gemini 路径，package check 确认本地响应捕获不会进入发布包。

## 风险与取舍

- **[旧用户仍有 provider-specific settings] →** 对已知 OpenAI/Google provider 做最小映射或使用默认引擎，旧 key 和 endpoint 只作为迁移输入，绝不再次渲染。
- **[CPA 服务未安装或版本过旧] →** 把依赖写入包契约，并在工具注册阶段给出诊断；通过服务导出和类型检查守护契约。
- **[Gallery schema 发生变化] →** 读写时统一规范化，保留附件 ID，并用旧 OpenAI/Google 与新 engine 记录做聚焦测试。
- **[引擎标签隐藏了模型差异] →** raw model 继续由 CPA 内部管理，文档只记录两个已验证的 MVP 映射；动态模型选择另立 change。
- **[Codex 与 DSH manifest 规则不同] →** 分别校验两个 manifest，并把二者都纳入 package dry-run。

## 迁移计划

1. 在旧 provider 实现仍存在时加入引擎配置和假服务测试。
2. 注入 CPA 服务并切换工具执行路径，聚焦测试通过后删除 direct-provider 模块和凭据依赖。
3. 迁移设置与 Gallery 记录，验证旧记录仍可展示。
4. 添加原生插件元数据、ImageGen skill 和 CPA 安装文档。
5. 运行 package/build/type 检查，再针对已完成的 Provider change 执行 GPT 与 Gemini 冒烟测试。
6. 发布前的回滚采用分支级 revert；附件 ID 和二进制存储未变化，不需要附件迁移回滚。
