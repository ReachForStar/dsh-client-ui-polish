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

每个包都是可安装的 profile bundle，**直接从本仓库安装（git 或本地 checkout），不发布到 npm**。在官方 harness 上：

```sh
# 0. 一次性：获取套件
git clone https://github.com/ReachForStar/dsh-client-ui-polish.git
cd dsh-client-ui-polish

# 1. Web GUI 打磨（客户端 + 宿主路由 + 设置）
dsh plugin --profile web add ./packages/ui-polish

# 2. AMAX Token Router 提供方（出现在 Models 页）
dsh plugin --profile web add ./packages/llm-amax

# 3. Pi 编码 agent 委派后端（宿主提供方）
dsh plugin --profile web add ./packages/subagent-pi

# 4. 白板模型工具与 Pi 委派工具按 agent 授予：
#    把 presets/standard-polished/ 复制到 $DSH_HOME/.agent-presets/ 并选为
#    agent preset（或把 tool-excalidraw / tool-subagent-pi 两行加入现有 preset）
```

`dsh plugin` 在 profile 目录里转发给 pnpm，因此相对路径会锚定到你执行命令的目录，直接可用；绝对路径同样可以。git 规格（`dsh plugin --profile web add github:ReachForStar/dsh-client-ui-polish/packages/ui-polish#master`）也可以——git 安装会在 `prepare` 脚本中构建；按 pnpm 打印的提示在 profile 的 `pnpm-workspace.yaml` 里 allowlist 构建密钥。

然后重启宿主并配置：

- **AMAX**：设置 `AMAX_API_KEY`（或存入凭据引用），打开 Models 页选择 *AMAX Token Router*，用 *fetch available models* 从 `GET /v1/models` 拉取账户模型列表。
- **Pi**：确保 `pi` 可执行文件在 `PATH`；preset 挂载 `tool-subagent-pi` 后，agent 即可看到 `subagent_pi` 工具。

注意事项：

- **不要**把本套件装进 ReachForStar fork：它已在树内挂载这些行，插入的行会冲突。
- harness 自带的 `standard` preset 无法被同名用户 preset 覆盖（shipped root 优先），因此本仓库以新 id（`standard-polished`）提供 preset。

## 构建与测试

```sh
pnpm install
pnpm run build     # 逐包 tsc + tsdown → lib/index.js（ui-polish 另有 lib/client.js）
pnpm test          # 逐包 vitest
```

测试针对已发布的 `0.1.1-rc.2` harness 包运行（外加工作区本地的 `dsh-tool-excalidraw`，以及 Pi RPC 线缆使用的 `@earendil-works/pi-coding-agent` fixture）。`pnpm run typecheck` 门禁各包源码。

## 许可

MIT——见 [LICENSE](LICENSE)。
