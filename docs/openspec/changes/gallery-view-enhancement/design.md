# Design: 画廊展示排序、分类筛选与多视图模式架构设计

## 上下文

`dsh-image-gen` 插件通过 DSH 官方 `conversation.view` 扩展槽注入画廊页面。画廊的图片元数据持久化在浏览器 IndexedDB（`dsh_image_gen_db` -> `gallery_history`），图片数据流通过 `/plugins/dsh-image-gen/image` 按需加载。

当前画廊的 UI 只提供了写死的网格布局和简单的 `createdAt` 降序读取。本次重构在保持底层 IndexedDB 结构不变的前提下，对前端状态管理、工具栏交互、视图渲染及样式进行升级。

---

## 目标与非目标

### 目标
1. **多维度排序**：在前端针对已有 `GalleryItem` 列表提供排序逻辑（时间正序/倒序、Prompt 正序/倒序、文件大小倒序）。
2. **分类与筛选**：
   - 引擎分类分段标签（带动态计数）；
   - 比例/尺寸筛选；
   - Prompt 实时关键词搜索。
3. **多展现方式**：
   - 支持 **网格 (Grid)**、**列表 (List)**、**表格 (Table)** 3 种视图模式，并在工具栏提供无缝切换按钮；
   - 各种视图均能流畅调起统一的 Lightbox 大图预览和快捷操作（复制图片、复制 Prompt、下载、删除）。
4. **偏好记忆**：将用户当前选定的 `viewMode` 和 `sortOption` 持久化在 `localStorage` 中。
5. **设计规范与主题适配**：复用 DSH 官方 CSS 变量，确保在 Web GUI 的深浅色主题下自然贴合。

### 非目标
- 不修改 IndexedDB 数据库结构或更改 `GalleryItem` 必填契约。
- 不引入重型第三方组件库（如 antd 等），保持零额外依赖和极简打包体积。

---

## 技术方案与接口设计

### 1. 状态管理结构 (`gallery-view.tsx`)

```ts
export type SortOption =
  | 'time-desc'   // 最新优先 (默认)
  | 'time-asc'    // 最早优先
  | 'prompt-asc'  // Prompt A-Z
  | 'prompt-desc' // Prompt Z-A
  | 'size-desc'   // 文件大小 降序

export type ViewMode = 'grid' | 'list' | 'table'

export type AspectRatioFilter = 'all' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3'
```

### 2. 排序与过滤管线

```ts
const processedItems = useMemo(() => {
  // 1. 过滤：引擎分类、比例筛选、Prompt 关键词
  const filtered = items.filter((item) => {
    if (selectedEngine !== 'all' && item.engine !== selectedEngine) return false
    if (selectedRatio !== 'all') {
      const ratio = item.aspectRatio || extractAspectRatio(item.output)
      if (ratio !== selectedRatio) return false
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      if (!item.prompt?.toLowerCase().includes(q)) return false
    }
    return true
  })

  // 2. 排序
  return filtered.sort((a, b) => {
    switch (sortOption) {
      case 'time-asc':
        return a.createdAt - b.createdAt
      case 'prompt-asc':
        return (a.prompt || '').localeCompare(b.prompt || '')
      case 'prompt-desc':
        return (b.prompt || '').localeCompare(a.prompt || '')
      case 'size-desc':
        return (b.attachment?.bytes || 0) - (a.attachment?.bytes || 0)
      case 'time-desc':
      default:
        return b.createdAt - a.createdAt
    }
  })
}, [items, search, selectedEngine, selectedRatio, sortOption])
```

### 3. 工具栏与交互架构

```
+---------------------------------------------------------------------------------------+
| [ 📷 画廊 (共 12 张) ]   [全部 12] [GPT 8] [Gemini 4]                                   |
|                                                                                       |
| [ 🔍 搜索 Prompt... ] [ 比例: 全部 ⌄ ] [ 排序: 最新生成 ⌄ ]  [ ⊞ 网格 | ☰ 列表 | ▤ 表格 ] |
+---------------------------------------------------------------------------------------+
```

### 4. 视图模式组件拆分

1. **`GalleryGridView` (网格视图)**：
   - 现有的瀑布网格，优化卡片悬浮效果及右上角/左上角操作工具条；
   - 点击卡片图片打开大图 Lightbox。
2. **`GalleryListView` (列表视图)**：
   - 卡片行布局：左侧等比缩略图，中间为完整 Prompt（支持多行/展开）、引擎徽章、分辨率尺寸、文件体积、生成时间，右侧为独立的操作按钮组。
3. **`GalleryTableView` (表格视图)**：
   - 结构化紧凑表格：缩略图列、Prompt 描述列、引擎模型列、分辨率/比例列、文件大小列、生成时间列、操作列。

### 5. 工具函数与元数据格式化

- `formatBytes(bytes: number): string`：输出如 `1.4 MB` / `340 KB`。
- `formatDate(timestamp: number, lang: 'zh' | 'en'): string`：输出格式化时间如 `2025-05-18 14:30`。
- `extractAspectRatio(output?: string)`：从 output 字符串或 `attachment.width/height` 计算或提取比例。

---

## 样式与 CSS 变量规范

所有新增 CSS 样式统一嵌入 `src/client/index.tsx` 的 `STYLE` 字符串中，规范使用 DSH 原生主题变量：
- 背景色：`var(--dsw-alias-bg-layer-1)`, `var(--dsw-alias-bg-layer-2)`, `var(--dsw-alias-bg-layer-3)`
- 边框色：`var(--dsw-alias-border-l1)`, `var(--dsw-alias-border-l2)`
- 文字颜色：`var(--dsw-alias-label-primary)`, `var(--dsw-alias-label-secondary)`, `var(--dsw-alias-label-tertiary)`
- 主题色：`var(--dsw-alias-brand-primary)`

---

## 风险与对策

- **[兼容性]**：老数据可能缺少 `aspectRatio` 或 `bytes`。
  - **对策**：在筛选与格式化函数中均做可选兼容降级（如果无宽高比字段，从 `attachment.width/height` 计算或归为未指定）。
- **[LocalStorage 异常]**：在隐私模式或受限环境无法访问 `localStorage`。
  - **对策**：封装 safeStorage 读取与写入，失败时优雅降级为组件内部内存状态。
