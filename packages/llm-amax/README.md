# @reachforstar/dsh-llm-amax

English | [中文](README.zh.md)

Installable [AMAX Token Router](https://ai.amaxsmp.com) model provider for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): an OpenAI-compatible gateway route with `/v1/models` discovery, extracted from the fork customizations into a standalone plugin. Mount it with:

```sh
dsh plugin --profile web add @reachforstar/dsh-llm-amax
```

The bundle patch inserts the `llm-amax` row next to the dormant `llm-pi-ai` row the base bundle mounts. The plugin registers:

- a configurable-provider directory entry (`amax`, display name **AMAX Token Router**) so the Models page offers the gateway from the moment the plugin mounts,
- a `PiAiAdapter` route (reusing `@deepseek-ai/dsh-llm-pi-ai`'s exported adapter) that serves the configured models — dormant until the `llm-amax:` settings section supplies a profile, like `llm-pi-ai` itself,
- a model-discovery handler that interrogates the gateway's OpenAI-compatible `GET /models` listing, falling back to the gateway's own base URL when the draft carries none.

The gateway ships no static model list — the router's models depend on the account's token plan — so the Models page's *fetch available models* action is the intended way to populate the route.

## Configuration

Set the credential first: export `AMAX_API_KEY` (the default credential reference), or store any other reference and point the route at it. Then, in the web Models page, select *AMAX Token Router* and use *fetch available models* — the draft key comes from `AMAX_API_KEY` before the route is even saved.

By hand, the user-settings section is:

```yaml
llm-amax:
  providers:
    amax:
      # apiKeyEnv: AMAX_API_KEY      # default; any credential ref works
      # baseURL: https://ai.amaxsmp.com/v1
      models:
        - id: deepseek-v4-flash
          contextWindow: 262144
```

| Key | Default | Meaning |
|---|---|---|
| `apiKeyEnv` | `AMAX_API_KEY` | Credential reference resolved per request through the credentials service. |
| `baseURL` | `https://ai.amaxsmp.com/v1` | Endpoint override for the OpenAI-compatible API. |
| `models` | `[]` | The route's model catalog; each entry takes `id`, `name`, `contextWindow`, `maxTokens`, `input`, `reasoningEfforts`. |
| `reasoning` / `transport` / `timeoutMs` / `headers` / `retryPolicy` | unset | Provider-neutral knobs passed to the pi-ai adapter, mirroring `dsh-llm-pi-ai`. |

## Building and testing

`pnpm install && pnpm run build` produces `lib/index.js` and `lib/invariant.js` against the published `0.1.1-rc.2` harness packages plus `@earendil-works/pi-ai`. `pnpm test` covers profile resolution, the `/v1/models` discovery (with a mocked `fetch`), and the catalog entry.

## Model Experience

The route behaves like any `dsh-llm-pi-ai` route: per-request credentials resolve through the harness seam, requests carry the harness attribution headers via pi-ai, and usage streams back through the standard token meter. The plugin itself adds no prompt content and writes no session events.

#### KV Cache effect

Delegated to pi-ai's request-level caching; the plugin adds no cache state of its own.

## Known Limitations and Deferred Work

- **Single route** — this plugin serves only `amax`; other gateways stay on `dsh-llm-pi-ai` (which already supports hand-declared OpenAI-compatible routes).
- **No login flow** — the gateway authenticates by API key only; the sign-in flows `dsh-llm-pi-ai` registers do not apply.
- **Model list is settings-owned** — the discovery offers candidates; what the route serves is decided by the stored `models` list, like every other provider.
