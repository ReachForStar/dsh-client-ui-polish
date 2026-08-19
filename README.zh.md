# @deepseek-ai/dsh-client-ui-polish

[English](README.md) | 中文

独立 Web GUI 打磨插件（浏览器半侧），包含三项无需核心包改动的增强：

- **整个应用背景图片。** 插件拥有自己的 `ui-polish` 设置命名空间，并把图片绘制到 body（`cover`／固定／居中），在文档上标记 `data-ds-bg-image`。它注入的全局样式表在该属性生效时把基础 token（`--dsw-alias-bg-base`、`--dsw-specific-sidebar-fill`）覆盖为透明，因此结构性表面——应用框架、对话区、详情列与侧边栏——全部让位于图片；需要对比度的内容元素（卡片、代码块、按钮）保留自身填充。「通用」设置区的那一行负责上传（含大小与类型校验）、预览与移除图片。图片以**磁盘文件**持久化（经 `/bg/current` 提供）——设置文档只存短 URL，绝不存数百万字节的 base64——因此重启后仍保留，且不会撑大设置文件。
- **带费用的会话统计浮窗。** 一个 `conversation.composer.dock` 条目以 `position: fixed` 钉在视口右上角，展示持久的 `sessionStats` 与 `tokenUsage` 投影数字（未组合前者时回退到窗口折叠），并附加**按模型、按分时／分档计价**的累计花费：总额下方直接分列输入／缓存命中／输出三桶，每条落定的助手步骤按所属模型、按其落定时刻与输入长度取价（deepseek 系列在峰值时段按 2 倍计价，qwen 等分档模型按输入长度取档），价格来自可编辑的价目表文件 `src/client/model-pricing.json`（元／百万 token，由 amaxsmp 网关定价一次性转换而来）。未知模型与无法归属节点用量的会话回退到 `default` 价目卡（deepseek-v4-flash 谷值：输入 1.5、输出 4.5、缓存读取 0.05）；修改该 JSON 后重新构建即可更新价格。
- **文件面板。** 一个 `conversation.view` 标签页（位于「轨迹」与 Git 标签之间），浏览工作区仓库的目录树：目录经 `/git/list` 懒加载展开，选中文件后通过宿主的 `/git/read` 路由读取当前内容到可编辑文本框；保存经 `/git/write` 原地写回——文件在面板内编辑，绝不交给第三方应用。
- **Git 操作面板。** 一个 `conversation.view` 标签页（位于顶部标签栏「文件」右侧），以两栏布局展示浏览器当前工作区的仓库：分支、工作区变更（含单文件 diff）、提交框（`add -A` + commit）、推送动作与最近提交。选中变更文件后可在右栏原地编辑（同样走 `/git/read` 与 `/git/write`）。node 半侧在宿主 webserver 上注册 `/git/*` 路由，把每个请求的 `cwd` 对照实时工作区注册表解析（切换工作区即切换仓库，无需重启），并用 `execFile` 数组参数执行 `git`（不经 shell），因此路径与提交信息永远不会进入 shell；浏览器半侧是携带当前工作区路径的纯 fetch 客户端，并按工作区缓存结果使再次打开标签页即时显示。含 `..` 或路径分隔符的路径会被拒绝，未知 cwd 回退到宿主进程目录，非 Git 仓库目录显示安静的提示。
- **自动压缩上下文阈值。** 「通用」设置区新增一行，选择上下文占用比例（50%–80%，或未设置时用 80% 的 harness 默认值）作为会话压缩后端自动压缩的触发阈值。选择持久化在 `ui-polish` 设置文档中；node 半侧在每个 step 前读取该比例，当它低于默认值时测量压力，并经由名册的 agent 寻址服务面调用会话自身的压缩服务提前压缩——绝不会与内置的 0.8 监听器重复压缩。

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
