# @deepseek-ai/dsh-llm-amax

[English](README.md) | 中文

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的可安装 [AMAX Token Router](https://ai.amaxsmp.com) 模型提供方：一个带 `/v1/models` 发现的 OpenAI 兼容网关路由，从 fork 定制中抽取为独立插件。安装：

```sh
dsh plugin --profile web add @deepseek-ai/dsh-llm-amax
```

bundle 补丁把 `llm-amax` 行插入 base bundle 挂载的 dormant `llm-pi-ai` 行旁边。插件注册：

- 一个可配置提供方目录条目（`amax`，显示名 **AMAX Token Router**），插件一挂载 Models 页即可见；
- 一个 `PiAiAdapter` 路由（复用 `@deepseek-ai/dsh-llm-pi-ai` 导出的适配器）服务已配置模型——与 `llm-pi-ai` 一样，在 `llm-amax:` 设置段提供 profile 前保持 dormant；
- 一个模型发现处理器，探测网关的 OpenAI 兼容 `GET /models` 列表，草稿未带 base URL 时回退到网关自身端点。

网关不携带静态模型列表——路由的模型取决于账户的 token 计划——因此 Models 页的 *fetch available models* 动作就是填充路由的预期方式。

## 配置

先设置凭据：导出 `AMAX_API_KEY`（默认凭据引用），或存储其他引用并把路由指向它。然后在 web Models 页选择 *AMAX Token Router*，用 *fetch available models*——保存路由前，草稿 key 已来自 `AMAX_API_KEY`。

手工配置的用户设置段：

```yaml
llm-amax:
  providers:
    amax:
      # apiKeyEnv: AMAX_API_KEY      # 默认；任意凭据引用均可
      # baseURL: https://ai.amaxsmp.com/v1
      models:
        - id: deepseek-v4-flash
          contextWindow: 262144
```

| 键 | 默认 | 含义 |
|---|---|---|
| `apiKeyEnv` | `AMAX_API_KEY` | 每次请求经凭据服务解析的凭据引用。 |
| `baseURL` | `https://ai.amaxsmp.com/v1` | OpenAI 兼容 API 的端点覆盖。 |
| `models` | `[]` | 路由模型目录；每个条目接受 `id`、`name`、`contextWindow`、`maxTokens`、`input`、`reasoningEfforts`。 |
| `reasoning` / `transport` / `timeoutMs` / `headers` / `retryPolicy` | 未设置 | 传给 pi-ai 适配器的提供方中立旋钮，与 `dsh-llm-pi-ai` 一致。 |

## 构建与测试

`pnpm install && pnpm run build` 产出 `lib/index.js` 与 `lib/invariant.js`，针对已发布的 `0.1.1-rc.2` harness 包与 `@earendil-works/pi-ai` 构建。`pnpm test` 覆盖 profile 解析、`/v1/models` 发现（mock `fetch`）与目录条目。

## 模型体验

该路由与任何 `dsh-llm-pi-ai` 路由行为一致：每次请求的凭据经 harness 接缝解析，请求经 pi-ai 携带 harness attribution 头，用量经标准 token meter 回流。插件本身不添加提示内容、不写会话事件。

#### KV Cache 影响

交由 pi-ai 的请求级缓存；插件自身不持有缓存状态。

## 已知限制与延后工作

- **单一路由** — 本插件只服务 `amax`；其他网关继续走 `dsh-llm-pi-ai`（它已支持手声明 OpenAI 兼容路由）。
- **无登录流** — 网关仅按 API key 认证；`dsh-llm-pi-ai` 注册的登录流不适用。
- **模型列表由设置持有** — 发现只提供候选；路由实际服务什么由存储的 `models` 列表决定，与其他提供方一致。
