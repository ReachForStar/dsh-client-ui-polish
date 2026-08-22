# DeepSeek Harness 客户端打磨插件套件

[English](README.md) | 中文

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的可安装插件套件，从 [ReachForStar/deepseek-harness](https://github.com/ReachForStar/deepseek-harness) fork 的定制功能中抽取而来。这里的一切都是标准 Cordis 插件，通过官方 `dsh plugin` 机制挂载——**无需改动 harness 源码**。

**这是个人贡献，不是 deepseek-ai 的发布。** 各包只在本仓库发布，使用 `@reachforstar` scope，直接从 git 或本地 checkout 安装——绝不发布到 npm，也绝不使用官方 `@deepseek-ai` scope。涉及的 `@deepseek-ai` 包只有它们所依赖的官方 DeepSeek Harness 包。

目标基线：官方 `deepseek-ai/deepseek-harness` **0.1.1-rc.2**（`dsh-v0.1.1-rc.2`）。fork 本身已内建这些功能；本套件只面向官方发布版或其他普通安装。

## 包清单

| 包 | 功能 | 类型 |
|---|---|---|
| [`@reachforstar/dsh-client-ui-polish`](packages/ui-polish/README.md) | Web GUI 打磨：全应用背景图、按模型计价的会话统计浮窗、文件/Git/Excalidraw 面板、可配置压缩阈值 | 双面 web 插件（bundle） |
| [`@reachforstar/dsh-tool-excalidraw`](packages/tool-excalidraw/README.md) | **模型面向的白板工具**——`excalidraw_read`、`excalidraw_write`、`excalidraw_draw`、`excalidraw_export`，作用于画布标签页渲染的工作区场景文件 | 宿主工具插件（bundle） |
| [`@reachforstar/dsh-subagent-pi`](packages/subagent-pi/README.md) | Pi 编码 agent 委派后端——基于 Pi RPC 模式的 `pi` 子代理提供方 | 宿主子代理提供方（bundle） |
| [`@reachforstar/dsh-llm-amax`](packages/llm-amax/README.md) | AMAX Token Router 模型提供方——带 `/v1/models` 发现的 OpenAI 兼容网关路由 | 宿主 LLM 提供方（bundle） |

`examples/pi-dsh/` 目录记录了反向方向：让 Pi 编码 agent 把工作委派回 dsh 实例的 skill。

## 白板工具为何是插件形态（已确认）

`@reachforstar/dsh-tool-excalidraw` 是自包含的 Cordis 函数插件：声明 `name`/`inject`/`Config`/`apply`，通过已发布的 `@deepseek-ai/dsh-tools` 的 `defineTool` 注册四个工具，peer 依赖仅 `cordis`、`dsh-tools`、`dsh-workspace`，不依赖任何 harness 源码。场景文件约定（`<workspace>/.dsh/excalidraw/scene.json`）与 ui-polish 包的 `/scene` 路由共用，两者同仓发布，约定保持一致。

## 安装

每个包都是可安装的 profile bundle，**从本地 checkout 直接安装**——不发布到 npm；pnpm 无法安装 git 仓库内的子目录，因此 checkout 就是安装载体。在官方 harness 上：

```sh
# 0. 一次性：克隆并构建套件
git clone https://github.com/ReachForStar/dsh-client-ui-polish.git
cd dsh-client-ui-polish
pnpm install        # 安装工作区依赖并运行各包 prepare 构建 → lib/

# 1. Web GUI 打磨（客户端 + 宿主路由 + 设置）
dsh plugin --profile web add ./packages/ui-polish

# 2. AMAX Token Router 提供方（出现在 Models 页）
dsh plugin --profile web add ./packages/llm-amax

# 3. Pi 编码 agent 委派后端（宿主提供方）
dsh plugin --profile web add ./packages/subagent-pi

# 4. 白板模型工具与 Pi 委派工具按 agent 授予——通过 agent preset，
#    详见下方「步骤 4 详解」。
```

`dsh plugin` 在 profile 目录里转发给 pnpm，因此相对路径会锚定到你执行命令的目录，直接可用；绝对路径同样可以。pnpm 以符号链接方式挂载包目录（不复制），因此修改插件源码后需在 checkout 里重新构建（`pnpm run build`）——`prepare` 脚本只在 `pnpm install` 时构建。

然后重启宿主并配置：

- **AMAX**：设置 `AMAX_API_KEY`（或存入凭据引用），打开 Models 页选择 *AMAX Token Router*，用 *fetch available models* 从 `GET /v1/models` 拉取账户模型列表。
- **Pi**：确保 `pi` 可执行文件在 `PATH`；preset 挂载 `tool-subagent-pi` 后，agent 即可看到 `subagent_pi` 工具。

### 步骤 4 详解：安装 preset

agent preset 决定会话挂载哪些工具。harness 自带的 `standard` preset 不含这两个工具，且同名用户 preset 无法覆盖 shipped preset（shipped root 优先）——因此本仓库以新 id（`standard-polished`）提供 preset。它包含完整官方 `standard` 组合外加 `tool-excalidraw` 行与 `tool-subagent-pi` 行。

**4a. 复制 preset 目录**（目录名即 preset id）：

```sh
# $DSH_HOME 默认 ~/.dsh（Windows：%USERPROFILE%\.dsh）；可用 DSH_HOME 环境变量覆盖
mkdir -p "$DSH_HOME/.agent-presets"
cp -R presets/standard-polished "$DSH_HOME/.agent-presets/"
```

PowerShell：

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.dsh\.agent-presets"
Copy-Item -Recurse .\presets\standard-polished "$env:USERPROFILE\.dsh\.agent-presets\"
```

结果结构：

```
$DSH_HOME/.agent-presets/standard-polished/
  agent.cordis.yml   # 官方 standard + tool-excalidraw + tool-subagent-pi
  preset.yml         # 可选：选择器显示的元数据
```

**4b. 设为默认**（二选一）：

- **web UI 方式**：重启 `dsh --profile web`，打开**通用设置**，在 Agent preset 下拉中选择 *Standard + Polish*。选择会写入设置文档。
- **手写方式**：写入 `$DSH_HOME/settings.yaml`（热加载，无需重启）：

```yaml
agent-presets:
  default: standard-polished
```

**4c. 验证**：打开一个**新**会话（默认值只作用于未指名 preset 的会话）。工具列表应包含 `excalidraw_read`、`excalidraw_write`、`excalidraw_draw`、`excalidraw_export` 与 `subagent_pi`。让模型画一个形状，可实时看到白板标签页出现——两侧共用 `$workspace/.dsh/excalidraw/scene.json`。

注意事项：

- **不要**把本套件装进 ReachForStar fork：它已在树内挂载这些行，插入的行会冲突。
- harness 自带的 `standard` preset 无法被同名用户 preset 覆盖（shipped root 优先），因此本仓库以新 id（`standard-polished`）提供 preset。

## 环境要求

- 官方 `deepseek-ai/deepseek-harness` **0.1.1-rc.2**（`dsh-v0.1.1-rc.2`）——补丁与所依赖已发布包的目标基线。
- Node `^22.19 || >=24` 与 pnpm（构建 checkout 需要；profile 安装本身由 `dsh plugin` 驱动，其内部使用 pnpm）。
- `PATH` 上有 `git`（ui-polish 的 node 半侧为文件/Git 面板调用 git）；白板场景工具需要会话有工作区支撑。
- 仅在使用 Pi 委派工具时需要 `PATH` 上的 `pi`；仅在使用 AMAX 路由时需要 `AMAX_API_KEY`。

## 卸载

每个已装部分可独立撤销：

```sh
# 移除三个 profile bundle（其补丁插入的行会从组合中消失；之后重启宿主）
dsh plugin --profile web remove @reachforstar/dsh-client-ui-polish
dsh plugin --profile web remove @reachforstar/dsh-llm-amax
dsh plugin --profile web remove @reachforstar/dsh-subagent-pi

# 删除 preset 并恢复 $DSH_HOME/settings.yaml 中的原默认值
Remove-Item -Recurse "$env:DSH_HOME\.agent-presets\standard-polished"     # POSIX 用 rm -rf
# agent-presets:
#   default: standard        # ← 恢复
```

插件设置命名空间（`ui-polish`、`llm-amax`）以及你存储的 AMAX/Pi 凭据仍保留在用户设置文档中——需要的话手工删除。由于 checkout 是以符号链接挂进 profile 的，删除克隆会导致插件加载失败；请保留克隆或重新指向 profile。

## 常见问题（FAQ）

**我的 `$DSH_HOME/.agent-presets` 不存在——出问题了吗？**
没有。该目录只在首次自建（或复制）用户 preset 时才创建。harness 仅在它存在时扫描；官方 shipped preset 位于应用安装目录，不在 `$DSH_HOME` 下。步骤 4a 会创建它。

**改了插件源码但 web UI 仍是旧行为？**
profile 以符号链接方式挂载包目录而非复制。请在 checkout 里重新构建（`pnpm run build`）——`prepare` 脚本只在 `pnpm install` 时运行——然后重启宿主。客户端 bundle（`lib/client.js`）由 modules node 半侧从符号链接的包目录提供，因此浏览器半侧只需重建加刷新页面即可生效。

**为什么走 git/本地安装而非 npm？**
这些是个人贡献，不是 deepseek-ai 的发布；不发布到 npm，绝不使用官方 `@deepseek-ai` scope。pnpm 无法安装 git 仓库内的子目录，因此本地 checkout 就是安装载体（见「安装」）。

**为什么 AMAX 路由没有模型？**
网关不携带静态模型列表——模型取决于账户的 token 计划。请在 Models 页使用 *fetch available models*（保存路由前它就会读取环境变量 `AMAX_API_KEY`），或在 `llm-amax:` 段手工填写模型 id。

**为什么工具列表里没有 `subagent_pi`？**
提供方 bundle 只注册宿主侧的提供方。工具按 agent 由 preset 授予：请同时安装 bundle 并挂载 `tool-subagent-pi`（见步骤 4），然后打开**新**会话。

**需要官方 fork 做什么吗？**
不需要。fork 已内建这些功能，且**不可**安装本套件；请装在官方发布版或其他普通 harness 上。

## 构建与测试

```sh
pnpm install
pnpm run build     # 逐包 tsc + tsdown → lib/index.js（ui-polish 另有 lib/client.js）
pnpm test          # 逐包 vitest
pnpm run typecheck
```

测试针对已发布的 `0.1.1-rc.2` harness 包运行（外加工作区本地的 `dsh-tool-excalidraw`，以及 Pi RPC 线缆使用的 `@earendil-works/pi-coding-agent` fixture）。官方 `0.1.1-rc.2` npm 发布中部分传递依赖范围排除了自身 pre-release 构建（如 `dsh-sandbox >=0.1.1`）；`pnpm-workspace.yaml` 用 `overrides` 钉住这些包。`packages/ui-polish/tests/` 中的六个浏览器运行时套件 import 已发布的客户端 bundle（`window.__ModuleLoader__` closure 形态），只能在 DeepSeek Harness workspace checkout 中运行；它们保留在仓库内，standalone 的 `pnpm test` 会排除（见 `packages/ui-polish/vitest.config.ts`）。

## 许可

MIT——见 [LICENSE](LICENSE)。
