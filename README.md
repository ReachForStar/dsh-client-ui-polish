# DeepSeek Harness client polish plugins

English | [中文](README.zh.md)

Installable plugin suite for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), extracted from the customizations of the [ReachForStar/deepseek-harness](https://github.com/ReachForStar/deepseek-harness) fork. Everything here is a standard Cordis plugin that mounts through the official `dsh plugin` mechanism — **no harness source changes needed**.

**This is a personal contribution, not a deepseek-ai release.** The packages are published from this repository only, under the `@reachforstar` scope, and are installed directly from git or a local checkout — never from npm, and never under the official `@deepseek-ai` scope. The official DeepSeek Harness packages they depend on are the only `@deepseek-ai` packages involved.

Target baseline: official `deepseek-ai/deepseek-harness` **0.1.1-rc.2** (`dsh-v0.1.1-rc.2`). The fork already contains these features in-tree; install this suite only on the official release or other plain installs.

## Packages

| Package | Feature | Kind |
|---|---|---|
| [`@reachforstar/dsh-client-ui-polish`](packages/ui-polish/README.md) | Web GUI polish: whole-app background image, session stats float with per-model cost, file/git/Excalidraw panels, configurable compaction threshold | dual-face web plugin (bundle) |
| [`@reachforstar/dsh-tool-excalidraw`](packages/tool-excalidraw/README.md) | **Model-facing whiteboard tools** — `excalidraw_read`, `excalidraw_write`, `excalidraw_draw`, `excalidraw_export` over the workspace scene file the canvas tab renders | host tool plugin (bundle) |
| [`@reachforstar/dsh-subagent-pi`](packages/subagent-pi/README.md) | Pi coding agent delegation backend — a `pi` subagent provider over Pi's RPC mode | host subagent provider (bundle) |
| [`@reachforstar/dsh-llm-amax`](packages/llm-amax/README.md) | AMAX Token Router model provider — an OpenAI-compatible gateway route with `/v1/models` discovery | host LLM provider (bundle) |

The `examples/pi-dsh/` directory documents the reverse direction: a dsh skill that lets the Pi coding agent delegate work back to a dsh instance.

## Why the whiteboard tool is plugin-shaped (confirmed)

`@reachforstar/dsh-tool-excalidraw` is a self-contained Cordis function plugin: it declares `name`/`inject`/`Config`/`apply`, registers its four tools through `defineTool` from the published `@deepseek-ai/dsh-tools`, and its only peers are `cordis`, `dsh-tools`, and `dsh-workspace`. It depends on no harness source. The scene file convention (`<workspace>/.dsh/excalidraw/scene.json`) is shared with the ui-polish package's `/scene` routes; both ship from this repository, so the convention stays in lockstep.

## Installation

Each package is an installable profile bundle, installed directly from a local checkout — nothing is published to npm, and pnpm cannot install a subdirectory of a git repository, so the checkout is the install vehicle. On the official harness:

```sh
# 0. One-time: clone and build the suite
git clone https://github.com/ReachForStar/dsh-client-ui-polish.git
cd dsh-client-ui-polish
pnpm install        # installs workspace deps and runs each package's prepare build → lib/

# 1. Web GUI polish (client + host routes + settings)
dsh plugin --profile web add ./packages/ui-polish

# 2. AMAX Token Router provider (appears in the Models page)
dsh plugin --profile web add ./packages/llm-amax

# 3. Pi coding agent delegation backend (host provider)
dsh plugin --profile web add ./packages/subagent-pi

# 4. Whiteboard model tools + the Pi delegation tool are granted per agent
#    via an agent preset — see "Step 4 in detail" below.
```

`dsh plugin` forwards to pnpm inside the profile directory, so a relative path is anchored to your invoking directory and works as-is; absolute paths work too. pnpm links the package directory (no copy), so rebuild (`pnpm run build` in the checkout) after changing the plugin source — the `prepare` script builds on `pnpm install` only.

Then restart the host and configure:

- **AMAX**: set `AMAX_API_KEY` (or store a credential reference), open the Models page, pick *AMAX Token Router*, and use *fetch available models* to pull the account's model list from `GET /v1/models`.
- **Pi**: have the `pi` executable on `PATH`; per-agent the `subagent_pi` tool appears once the preset mounts `tool-subagent-pi`.

### Step 4 in detail: install the preset

An agent preset decides which tools a session mounts. The harness's shipped `standard` preset does not carry these tools, and a same-named user preset cannot shadow a shipped one (shipped roots win) — which is why this repository ships the preset under the new id `standard-polished`. It contains the full official `standard` composition plus the `tool-excalidraw` row and the `tool-subagent-pi` row.

**4a. Copy the preset directory** (directory name = preset id):

```sh
# $DSH_HOME defaults to ~/.dsh (Windows: %USERPROFILE%\.dsh); override with the DSH_HOME env var.
mkdir -p "$DSH_HOME/.agent-presets"
cp -R presets/standard-polished "$DSH_HOME/.agent-presets/"
```

PowerShell:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.dsh\.agent-presets"
Copy-Item -Recurse .\presets\standard-polished "$env:USERPROFILE\.dsh\.agent-presets\"
```

The result:

```
$DSH_HOME/.agent-presets/standard-polished/
  agent.cordis.yml   # official standard + tool-excalidraw + tool-subagent-pi
  preset.yml         # optional display metadata shown by the picker
```

**4b. Make it the default** (either way):

- **Via the web UI**: restart `dsh --profile web`, open **General settings**, and pick *Standard + Polish* in the Agent preset dropdown. The choice is stored in the settings document.
- **By hand**: write `$DSH_HOME/settings.yaml` (hot-reloaded, no restart needed):

```yaml
agent-presets:
  default: standard-polished
```

**4c. Verify**: open a **new** session (the default applies to sessions that name no preset). The tool list should include `excalidraw_read`, `excalidraw_write`, `excalidraw_draw`, `excalidraw_export`, and `subagent_pi`. Draw a shape through the model and watch it appear live on the whiteboard tab — both sides share `$workspace/.dsh/excalidraw/scene.json`.

Notes:

- Do **not** install this suite into the ReachForStar fork: it already mounts these rows in-tree, and the inserted rows would collide.
- The web preset `standard` that ships with the harness cannot be shadowed by a same-named user preset (shipped roots win), which is why the repo ships the preset under a new id (`standard-polished`).

## Requirements

- Official `deepseek-ai/deepseek-harness` **0.1.1-rc.2** (`dsh-v0.1.1-rc.2`) — the target baseline for the patches and the published packages they depend on.
- Node `^22.19 || >=24` and pnpm (for the checkout build; the profile install itself runs through `dsh plugin`, which uses pnpm).
- Git on `PATH` (the ui-polish node half shells out to `git` for the file/Git panels) and, for the whiteboard scene tools, a session backed by a workspace.
- `pi` on `PATH` only when you use the Pi delegation tool; `AMAX_API_KEY` only when you use the AMAX route.

## Removal

Each installed piece reverses independently:

```sh
# Remove the three profile bundles (rows inserted by their patches disappear
# from the composition; restart the host afterwards)
dsh plugin --profile web remove @reachforstar/dsh-client-ui-polish
dsh plugin --profile web remove @reachforstar/dsh-llm-amax
dsh plugin --profile web remove @reachforstar/dsh-subagent-pi

# Drop the preset and restore the previous default in $DSH_HOME/settings.yaml
Remove-Item -Recurse "$env:DSH_HOME\.agent-presets\standard-polished"     # or rm -rf on POSIX
# agent-presets:
#   default: standard        # ← restore
```

The plugin settings namespaces (`ui-polish`, `llm-amax`) and any AMAX/Pi credentials you stored stay in the user-settings document — remove them by hand if you want them gone. Because the checkout is symlinked into the profile, deleting the clone makes the plugins fail to load; keep the clone or re-point the profile.

## FAQ

**`$DSH_HOME/.agent-presets` does not exist on my machine — is something wrong?**
No. That directory is only created when you author (or copy) your first user preset. The harness scans it only if present; the shipped presets live in the application install, not under `$DSH_HOME`. Step 4a creates it.

**I changed the plugin source but the web UI still shows the old behavior.**
The profile symlinks the package directory instead of copying it. Rebuild in the checkout (`pnpm run build`) — the `prepare` script only runs on `pnpm install` — then restart the host. The client bundle (`lib/client.js`) is served by the modules node half from the symlinked package, so a rebuild plus a browser reload is enough for the browser half.

**Why git/local installs instead of npm?**
These are personal contributions, not deepseek-ai releases; they are not published to npm and never use the official `@deepseek-ai` scope. pnpm cannot install a subdirectory of a git repository, so the local checkout is the install vehicle (see Installation).

**Why does the AMAX route show no models?**
The gateway ships no static model list — the models depend on the account's token plan. Use *fetch available models* on the Models page (it reads `AMAX_API_KEY` from the environment even before the route is saved), or enter the model ids by hand in the `llm-amax:` section.

**Why does `subagent_pi` not appear in the tool list?**
The provider bundle only registers the host-side provider. The tool is granted per agent by the preset: install the bundle *and* mount `tool-subagent-pi` (Step 4), then open a **new** session.

**Do I need the official fork for anything?**
No. The fork already contains these features in-tree and must not be given this suite; install on the official release or another plain harness.

## Building and testing

```sh
pnpm install
pnpm run build     # tsc + tsdown per package → lib/index.js (+ lib/client.js for ui-polish)
pnpm test          # vitest per package
pnpm run typecheck
```

Tests run against the published `0.1.1-rc.2` harness packages (plus the workspace-local `dsh-tool-excalidraw` used by ui-polish and the `@earendil-works/pi-coding-agent` fixture for the Pi RPC wire). The official `0.1.1-rc.2` npm release declares a few transitive ranges that exclude its own pre-release builds (e.g. `dsh-sandbox >=0.1.1`); `pnpm-workspace.yaml` pins those with `overrides`. The six browser-runtime suites in `packages/ui-polish/tests/` import the published client bundles (`window.__ModuleLoader__` closure form) and only run inside a DeepSeek Harness workspace checkout; they stay in the repository and are excluded from the standalone `pnpm test` (see `packages/ui-polish/vitest.config.ts`).

## License

MIT — see [LICENSE](LICENSE).
