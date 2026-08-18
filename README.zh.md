# @deepseek-ai/dsh-client-ui-polish

[English](README.md) | 中文

独立 Web GUI 打磨插件（浏览器半侧），包含三项无需核心包改动的增强：

- **整个应用背景图片。** 插件拥有自己的 `ui-polish` 设置命名空间（data URL，上限 2MB），并把图片绘制到 body（`cover`／固定／居中），在文档上标记 `data-ds-bg-image`。它注入的全局样式表在该属性生效时把基础 token（`--dsw-alias-bg-base`、`--dsw-specific-sidebar-fill`）覆盖为透明，因此结构性表面——应用框架、对话区、详情列与侧边栏——全部让位于图片；需要对比度的内容元素（卡片、代码块、按钮）保留自身填充。「通用」设置区的那一行负责上传（含大小与类型校验）、预览与移除图片。
- **带费用的会话统计浮窗。** 一个 `conversation.composer.dock` 条目以 `position: fixed` 钉在视口右上角，展示持久的 `sessionStats` 与 `tokenUsage` 投影数字（未组合前者时回退到窗口折叠），并附加**按模型计价**的估算花费：每条落定的助手步骤按其所属模型的单价计费，价格来自可编辑的价目表文件 `src/client/model-pricing.json`（元／百万 token，由 amaxsmp 网关定价一次性转换而来），悬停显示各桶拆分。未知模型与无法归属节点用量的会话回退到 `default` 价目卡（deepseek-v4-flash：输入 1.5、输出 4.5、缓存读取 0.05）；修改该 JSON 后重新构建即可更新价格。
- **悬浮文件修改 diff 面板。** 第二个 `conversation.composer.dock` 条目监听会话中刚落定的 write/edit 调用（落定结果携带 `card: 'diff'` 渲染意图），把最新应用后的变更绘制在右侧固定面板。打开会话时吸收历史，因此重载后保持安静；关闭按钮可收起面板，直到下一次修改出现。

`/client` 导出为插件主体（`apply`／`inject`）、组件 props 类型与注入的背景写入面类型。

## 构建与测试

`pnpm install && pnpm run build` 会基于已发布的 harness 包产出 `lib/index.js`（node 半侧）、`lib/invariant.js` 与 `lib/client.js`（浏览器 bundle）。该插件面向 DeepSeek Harness 的 web 组合：挂载方式与内置客户端插件一致——把本包加入 harness 的 web-app bundle（`cordis.patch.yml` 名册行 + 依赖 + client tsconfig 聚合）。

`tests/` 下的 spec 依赖 harness 的 test-support 包（`@deepseek-ai/dsh-client-test-runtime`、`@deepseek-ai/dsh-client-web-react`）及其 locale 源码子路径——这些是工作区内部物，未随已发布包分发，因此 `pnpm test` 需要在 DeepSeek Harness 工作区 checkout 中运行，而非独立运行。

## 模型体验

无。本插件是纯客户端呈现：不组装也不发送任何 provider 请求，不写入会话事件，也不添加任何 prompt 内容。它唯一的持久足迹是用户设置中的背景图片偏好。

#### KV 缓存影响

无。

## 已知限制与暂缓事项

- **固定定位浮层** —— 统计卡片与 diff 面板用 `position: fixed` 自行钉住（独立插件无法重排核心布局），因此无论 composer 自身位置如何，它们都会覆盖在视口角落。
- **token 覆盖式透明** —— 背景图片激活时，所有绘制基础 token 的表面都会变透明，包括一些读取 `--dsw-alias-bg-base` 的内容元素（如代码块），在较复杂的图片上可能降低其对比度。
- **插件自绘 diff，而非核心详情面板** —— 修改面板自行渲染应用的 hunks；它无法驱动核心详情面板的选中（该 store 是 ui-conversation 内部物），非修改类调用在本插件中没有右侧面板。
- **背景上传上限** —— 图片以 base64 持久化在用户设置文档中，因此上限为 2MB。
