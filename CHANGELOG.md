# 变更记录 (CHANGELOG)

所有对 `dsh-image-gen` 项目的重要更新都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。

---

## [0.3.0] - 2026-08-26

### 新增 (Added)
- **画廊多视图模式 (Multi-View: Grid / List / Table)**：
  - **网格视图 (Grid)**：视觉优先的卡片瀑布流布局与悬浮快捷操作栏。
  - **列表视图 (List)**：横向图文卡片列表，展示完整 Prompt、引擎/模型标签、分辨率、文件大小、创建时间与独立操作栏。
  - **表格视图 (Table)**：紧凑明细表格，支持批量信息快速扫读与操作。
  - 视图模式自动持久化至 `localStorage`（`dsh-image-gen:viewMode`）。
- **多维度排序支持 (Sorting)**：
  - 支持「最新生成 (time-desc)」、「最早生成 (time-asc)」、「Prompt A→Z (prompt-asc)」、「Prompt Z→A (prompt-desc)」、「文件大小 (size-desc)」。
  - 排序选择自动持久化至 `localStorage`（`dsh-image-gen:sortOption`）。
- **引擎分类标签与动态计数 (Category Pills & Badges)**：
  - 工具栏提供 全部 (All) / GPT Image 2 / Gemini Image / 未知引擎 分类标签，实时展示各分类下的图片数量 Badge。
- **图片比例筛选 (Aspect Ratio Filtering)**：
  - 支持按图片比例筛选（全部 / 1:1 / 16:9 / 9:16 / 4:3 / 3:4 / 3:2 / 2:3），智能解析并归一化宽高比。
- **画廊交互与预览体验增强**：
  - 搜索框支持一键清空按钮与实时过滤。
  - 大图预览（Lightbox）新增上一张/下一张切换并展示完整元数据。
  - 完善中英文双语字典（`DICT`）与响应式小屏布局适配。
- **测试套件扩充**：
  - 新增 `tests/gallery-view.spec.ts`，覆盖纯函数排序、多条件过滤、宽高比提取、字节与时间格式化等 22 项测试用例。

---

## [0.2.0] - 2026-08-25

### 新增 (Added)
- **CPA 图像生成服务集成**：重构为由 `@LiuRJ99/dsh-cpa-plugin` 的 `dshCpaImageGeneration` 宿主服务驱动，插件内部无需再配置或管理第三方 API 密钥。
- **多引擎支持 (GPT Image 2 & Gemini Image)**：
  - **GPT Image 2**：通过 CPA 宿主 `/v1/images/generations` 接口生成高质量 PNG 图片。
  - **Gemini Image**：通过 CPA 宿主 `/v1/chat/completions` 并解析 `message.images` 提取 JPEG 格式图像（适配 `gemini-3.1-flash-image`）。
- **Codex 与 Skill 生态集成**：
  - 新增 `.codex-plugin/plugin.json` 清单定义。
  - 新增 `skills/imagegen/SKILL.md` 引导 Agent 规范使用 `generate_image` 工具与参数。
  - 更新 `skills/install-dsh-image-gen/SKILL.md` 安装与配置指南。
- **图库数据平滑迁移**：IndexedDB 存储增加向后兼容转换，历史记录中的 `openai` 与 `google` 提供商数据自动映射至 `gpt` 与 `gemini` 引擎。
- **服务契约与图库测试套件**：新增 `tests/cpa-service-contract.spec.ts` 与 `tests/gallery-store.spec.ts`。

### 变更 (Changed)
- **简化设置面板**：移除独立的 API Key / Base URL / Model 选择表单，UI 仅保留「生成引擎」（GPT Image 2 / Gemini Image）与「工作区保存」配置项。
- **优化工具提示与呈现元数据**：`generate_image` 工具返回及图库展示卡片统一使用规范的引擎标识。

### 移除 (Removed)
- 移除遗留的直连提供商模块（`src/google.ts`、`src/openai-compatible.ts`、`src/dashscope.ts`）及相关测试。

---

## [0.1.7] - 2026-08-25

### 修复与优化 (Fixed & Improved)
- 完善工作区保存与 DashScope 适配器兼容性。
- 更新设置面板高清预览截图与使用文档。

---

## [0.1.6] - 2026-08-25

### 新增 (Added)
- 图库单项删除功能：支持二次确认弹窗与持久化删除标记（Tombstones），防止已删记录被重新索引。

---

## [0.1.5] - 2026-08-25

### 新增 (Added)
- 新增 DashScope (阿里通义万相 Wanx) 提供商适配。
- 优化 DSH 设置面板在不同版本下的渲染兼容性。

---

## [0.1.4] - 2026-08-25

### 新增 (Added)
- 支持生成图片自动原子写入当前 Session 工作区指定子目录（`saveToWorkspace` / `workspaceFolder`）。

---

## [0.1.3] - 2026-08-25

### 新增 (Added)
- 原生画廊视图（Gallery View）：在 DSH 会话工作区内提供图片瀑布流、大图预览及一键复制、下载功能。

---

## [0.1.2] - 2026-08-25

### 新增 (Added)
- 对话流内图片悬浮工具栏：快捷支持原图预览、剪贴板复制、下载保存与新标签页查看。

---

## [0.1.1] - 2026-08-25

### 新增 (Added)
- 多语言与国际化支持（中英双语界面）。
- DSH 原生卡片样式与响应式布局优化。

---

## [0.1.0] - 2026-08-25

### 新增 (Added)
- `dsh-image-gen` 初始版本发布。
- 支持 `generate_image` 结构化工具调用与 Attachment 附件持久化存储。
- 支持 Google Imagen / OpenAI 兼容接口直接图像生成。
