# DeepSeek Harness client polish plugins

English | [中文](README.zh.md)

Installable plugin suite for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), extracted from the customizations of the [ReachForStar/deepseek-harness](https://github.com/ReachForStar/deepseek-harness) fork. Everything here is a standard Cordis plugin that mounts through the official `dsh plugin` mechanism — **no harness source changes needed**.

Target baseline: official `deepseek-ai/deepseek-harness` **0.1.1-rc.2** (`dsh-v0.1.1-rc.2`). The fork already contains these features in-tree; install this suite only on the official release or other plain installs.

## Packages

| Package | Feature | Kind |
|---|---|---|
| [`@deepseek-ai/dsh-client-ui-polish`](packages/ui-polish/README.md) | Web GUI polish: whole-app background image, session stats float with per-model cost, file/git/Excalidraw panels, configurable compaction threshold | dual-face web plugin (bundle) |
| [`@deepseek-ai/dsh-tool-excalidraw`](packages/tool-excalidraw/README.md) | **Model-facing whiteboard tools** — `excalidraw_read`, `excalidraw_write`, `excalidraw_draw`, `excalidraw_export` over the workspace scene file the canvas tab renders | host tool plugin (bundle) |
| [`@deepseek-ai/dsh-subagent-pi`](packages/subagent-pi/README.md) | Pi coding agent delegation backend — a `pi` subagent provider over Pi's RPC mode | host subagent provider (bundle) |
| [`@deepseek-ai/dsh-llm-amax`](packages/llm-amax/README.md) | AMAX Token Router model provider — an OpenAI-compatible gateway route with `/v1/models` discovery | host LLM provider (bundle) |

The `examples/pi-dsh/` directory documents the reverse direction: a dsh skill that lets the Pi coding agent delegate work back to a dsh instance.

## Why the whiteboard tool is plugin-shaped (confirmed)

`@deepseek-ai/dsh-tool-excalidraw` is a self-contained Cordis function plugin: it declares `name`/`inject`/`Config`/`apply`, registers its four tools through `defineTool` from the published `@deepseek-ai/dsh-tools`, and its only peers are `cordis`, `dsh-tools`, and `dsh-workspace`. It depends on no harness source. The scene file convention (`<workspace>/.dsh/excalidraw/scene.json`) is shared with the ui-polish package's `/scene` routes; both ship from this repository, so the convention stays in lockstep.

## Installation

Each package is an installable profile bundle. On the official harness:

```sh
# 1. Web GUI polish (client + host routes + settings)
dsh plugin --profile web add @deepseek-ai/dsh-client-ui-polish

# 2. AMAX Token Router provider (appears in the Models page)
dsh plugin --profile web add @deepseek-ai/dsh-llm-amax

# 3. Pi coding agent delegation backend (host provider)
dsh plugin --profile web add @deepseek-ai/dsh-subagent-pi

# 4. Whiteboard model tools + the Pi delegation tool are granted per agent:
#    copy presets/standard-polished/ to $DSH_HOME/.agent-presets/ and select
#    it as the agent preset (or add the tool-excalidraw / tool-subagent-pi
#    rows to an existing preset).
```

Then restart the host and configure:

- **AMAX**: set `AMAX_API_KEY` (or store a credential reference), open the Models page, pick *AMAX Token Router*, and use *fetch available models* to pull the account's model list from `GET /v1/models`.
- **Pi**: have the `pi` executable on `PATH`; per-agent the `subagent_pi` tool appears once the preset mounts `tool-subagent-pi`.

Notes:

- Not published to npm yet? Install from the repository directly — `dsh plugin` accepts git/path/tarball specs (a git-hosted install builds via the package `prepare` script; allowlist the build key pnpm prints in the profile's `pnpm-workspace.yaml`).
- Do **not** install this suite into the ReachForStar fork: it already mounts these rows in-tree, and the inserted rows would collide.
- The web preset `standard` that ships with the harness cannot be shadowed by a same-named user preset (shipped roots win), which is why the repo ships the preset under a new id (`standard-polished`).

## Building and testing

```sh
pnpm install
pnpm run build     # tsc + tsdown per package → lib/index.js (+ lib/client.js for ui-polish)
pnpm test          # vitest per package
```

Tests run against the published `0.1.1-rc.2` harness packages (plus the workspace-local `dsh-tool-excalidraw` used by ui-polish and the `@earendil-works/pi-coding-agent` fixture for the Pi RPC wire). `pnpm run typecheck` gates each package's sources.

## License

MIT — see [LICENSE](LICENSE).
