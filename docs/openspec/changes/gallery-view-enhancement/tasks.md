## 1. 状态与数据处理逻辑扩展

- [ ] 1.1 在 `src/client/gallery-store.ts` 或 `gallery-view.tsx` 中定义排序类型 (`SortOption`)、视图类型 (`ViewMode`)、比例类型 (`AspectRatioFilter`) 及相关的工具函数（`formatBytes`, `formatDate`, `extractAspectRatio`）。
- [ ] 1.2 在 `src/client/gallery-view.tsx` 中实现排序与多维度筛选的 `useMemo` 计算管线。
- [ ] 1.3 实现 `localStorage` 偏好读取与持久化逻辑（`viewMode` 与 `sortOption`）。

## 2. 界面与交互组件实现

- [ ] 2.1 重构画廊顶部工具栏：
  - 增加引擎分类 Tabs/Pills 标签栏（带动态数量统计 Badge）；
  - 增加 Prompt 搜索输入框及一键清空；
  - 增加图片比例下拉筛选器；
  - 增加排序方式下拉选择器；
  - 增加「网格 / 列表 / 表格」三合一视图切换按钮组。
- [ ] 2.2 实现 **网格视图 (Grid View)**：优化现有网格布局，支持悬浮快捷操作与点击 Lightbox 预览。
- [ ] 2.3 实现 **列表视图 (List View)**：实现图文横向卡片列表，展示缩略图、完整 Prompt、生成时间、引擎/模型标签、分辨率、文件大小与操作按钮组。
- [ ] 2.4 实现 **表格视图 (Table View)**：实现紧凑数据表格展示各列明细与操作。
- [ ] 2.5 统一 Lightbox 预览与快捷操作（复制图片、复制 Prompt、下载、从画廊删除）。

## 3. CSS 样式与主题适配

- [ ] 3.1 在 `src/client/index.tsx` 中的 `STYLE` 添加/更新样式：
  - 顶部工具栏与 Tabs/Pills 样式；
  - 视图切换按钮组与激活状态高亮；
  - 列表视图与表格视图的自适应布局、悬浮高亮与响应式断点；
  - 适配 DSH 官方 CSS 主题变量。

## 4. 国际化 (i18n) 与单元测试

- [ ] 4.1 扩展 `DICT` 中英文字典，补全新增排序、筛选、视图模式、时间与尺寸文案。
- [ ] 4.2 编写或更新单元测试 `tests/gallery-store.spec.ts` 或新增 `tests/gallery-view.spec.ts`，验证排序、过滤与格式化逻辑。
- [ ] 4.3 运行 `pnpm test` 与 `pnpm run typecheck`，确保全部类型检查与单测通过。
