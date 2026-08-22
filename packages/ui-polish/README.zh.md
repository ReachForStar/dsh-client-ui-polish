# @reachforstar/dsh-client-ui-polish

[English](README.md) | 中文

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的可安装 Web GUI 打磨插件，即 fork 定制中的浏览器与宿主半侧。安装：

```sh
dsh plugin --profile web add ./packages/ui-polish
```

bundle 补丁把 `ui-polish` 行插入 web profile：node 半侧注册 `/git`、`/bg`、`/scene` 路由与 `ui-polish` 设置命名空间，浏览器半侧由 client-modules node 半侧依据清单中的 `dsh.client` 元数据发现。无需改动 harness 源码。

增强项（除注明外均为客户端）：

- **整个应用背景图片。** 插件拥有自己的 `ui-polish` 设置命名空间，并把图片绘制到 body（`cover`／固定／居中），在文档上标记 `data-ds-bg-image`。它注入的全局样式表在该属性生效时把基础 token（`--dsw-alias-bg-base`、`--dsw-specific-sidebar-fill`）覆盖为透明，因此结构性表面——应用框架、对话区、详情列与侧边栏——全部让位于图片；需要对比度的内容元素（卡片、代码块、按钮）保留自身填充。「通用」设置区的那一行负责上传（含大小与类型校验）、预览与移除图片。图片以**磁盘文件**持久化（经 `/bg/current` 提供）——设置文档只存短 URL，绝不存数百万字节的 base64——因此重启后仍保留，且不会撑大设置文件。
- **带费用的会话统计浮窗。** 一个 `conversation.composer.dock` 条目以 `position: fixed` 钉在视口右上角，展示持久的 `sessionStats` 与 `tokenUsage` 投影数字（未组合前者时回退到窗口折叠），并附加**按模型、按分时／分档计价**的累计花费：总额下方直接分列输入／缓存命中／输出三桶，每条落定的助手步骤按所属模型、按其落定时刻与输入长度取价（deepseek 系列在峰值时段按 2 倍计价，qwen 等分档模型按输入长度取档），价格来自可编辑的价目表文件 `src/client/model-pricing.json`（元／百万 token，由 amaxsmp 网关定价一次性转换而来；`scripts/convert-pricing.mjs` 可重新生成）。未知模型与无法归属节点用量的会话回退到 `default` 价目卡；修改该 JSON 后重新构建即可更新价格。
- **文件面板。** 一个 `conversation.view` 标签页（位于「轨迹」与 Git 标签之间），浏览工作区仓库的目录树：目录经 `/git/list` 懒加载展开，选中文件后通过宿主的 `/git/read` 路由读取当前内容到可编辑文本框；保存经 `/git/write` 原地写回——文件在面板内编辑，绝不交给第三方应用。
- **Git 操作面板。** 一个 `conversation.view` 标签页（位于顶部标签栏「文件」右侧），以两栏布局展示浏览器当前工作区的仓库：分支、工作区变更（含单文件 diff）、提交框（`add -A` + commit）、推送动作与最近提交。选中变更文件后可在右栏原地编辑（同样走 `/git/read` 与 `/git/write`）。node 半侧在宿主 webserver 上注册 `/git/*` 路由，把每个请求的 `cwd` 对照实时工作区注册表解析（切换工作区即切换仓库，无需重启），并用 `execFile` 数组参数执行 `git`（不经 shell），因此路径与提交信息永远不会进入 shell。含 `..` 或路径分隔符的路径会被拒绝，未知 cwd 回退到宿主进程目录，非 Git 仓库目录显示安静的提示。
- **内嵌 Excalidraw 白板标签页。** 一个 `conversation.view` 标签页渲染工作区场景文件（`<workspace>/.dsh/excalidraw/scene.json`，与 `@reachforstar/dsh-tool-excalidraw` 模型工具共用的 `SCENE_RELATIVE`）为实时画布，跟随 DSH 主题，支持 PNG/SVG 导出。node 半侧提供 `/scene` 路由；模型的 `excalidraw_*` 工具编辑同一文件，因此模型画的形状实时出现在白板上。
- **浮动文件变更 diff 面板。** 一个 `conversation.composer.dock` 条目监听会话中新落定的 write/edit 调用，并在右缘绘制已应用的变更。
- **自动上下文压缩阈值。** 「通用」设置区一行选择触发会话压缩后端的上下文压力比例（50–80%，未设置时为 harness 默认 80%）。选择持久化在 `ui-polish` 设置文档中；node 半侧每步读取，当低于 harness 默认时在 `agent/pre-step` 测量压力，并请 agent 自己的压缩服务（经花名册的 agent 寻址服务面）先压缩——绝不同内置 0.8 监听器重复压缩。

## 构建与测试

`pnpm install && pnpm run build` 产出 `lib/index.js`（node 半侧）、`lib/invariant.js` 与 `lib/client.js`（浏览器 bundle），针对已发布的 `0.1.1-rc.2` harness 包构建。客户端 bundle 内联 Excalidraw 编辑器、其样式表以及 Web Crypto shim（覆盖 Excalidraw 依赖树中的 `node:crypto` 引用），因此模块表无需 `crypto` 词条。

`pnpm test` 用 vitest 运行 `tests/` 中的 spec：宿主侧套件（git/excalidraw/background 服务、apply 接线）与纯逻辑套件（cost、model-index、settled-diffs）在 standalone 下针对已发布的 `0.1.1-rc.2` 包运行。六个浏览器运行时套件（`apply.client`、`background-row`、`background-runtime`、`mutation-diff`、`settings-store`、`stats-float`）import 已发布的客户端 bundle（`dsh-client-runtime/client`、`dsh-client-locale`、测试支撑），它们以模块表 closure bundle 形式发布，只能在 DeepSeek Harness workspace checkout 中加载；这些文件保留在 `tests/` 中，standalone 运行会排除（见 `vitest.config.ts`）。

## 模型体验

无。本插件是纯客户端展示（外加宿主路由与设置管道）：不组装也不发送任何提供方请求，不写会话事件，不添加提示内容。唯一持久足迹是用户设置中的背景图与压缩阈值偏好。

#### KV Cache 影响

无。

## 已知限制与延后工作

- **固定定位浮层** — 统计卡以 `position: fixed` 自钉（插件无法重排核心布局），因此无论 composer 自身位置如何都覆盖视口角落。
- **token 覆盖透明化** — 背景图生效时，所有绘制基础 token 的表面变透明，包括读取 `--dsw-alias-bg-base` 的某些内容元素（如代码块），在花哨图片上可能降低对比度。
- **纯文本编辑** — 文件与 Git 面板用等宽 textarea 编辑，而非语法高亮编辑器。
- **白板依赖工作区约定** — 画布标签页渲染 `<workspace>/.dsh/excalidraw/scene.json`；无工作区支撑的会话显示安静提示。
