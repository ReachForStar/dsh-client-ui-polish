# @reachforstar/dsh-client-ui-polish

English | [中文](README.zh.md)

Installable Web GUI polish plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), the browser-and-host half of the fork customizations. Mount it with:

```sh
dsh plugin --profile web add ./packages/ui-polish
```

The bundle patch inserts the `ui-polish` row into the web profile: the node half registers the `/git`, `/bg`, and `/scene` routes plus the `ui-polish` settings namespace, and the browser half is discovered by the client-modules node half from the manifest's `dsh.client` metadata. No harness source changes.

Enhancements (all client-side unless noted):

- **Whole-app background image.** The plugin owns its `ui-polish` settings namespace and paints the image onto the body (`cover` / fixed / centered), marking the document with `data-ds-bg-image`. Its injected global stylesheet overrides the base tokens (`--dsw-alias-bg-base`, `--dsw-specific-sidebar-fill`) to transparent while the attribute is set, so the structural surfaces — app frame, conversation, details, and sidebar — yield to the image; content elements that need contrast (cards, code blocks, buttons) keep their own fills. The settings row in the General section uploads (with size/type validation), previews, and removes the image. The image is persisted as a **file on disk** (served at `/bg/current`) — the settings document stores only the short URL, never megabytes of base64 — so it survives restarts without bloating the settings file.
- **Session stats float with cost.** A `conversation.composer.dock` entry pinned to the viewport's top-right via `position: fixed` shows the durable `sessionStats` and `tokenUsage` projection figures (window-fold fallback for assemblies without the former), plus an estimated spend billed per model with an input/cache/output bucket split shown directly under the total: a state-only Conversation Definition records each settled assistant message's model (messageId → model) into a plugin-owned index, and each step's usage is priced at its own model's rate and its own settle time (so time-tiered models like deepseek switch between peak and off-peak prices, and length-tiered models pick the tier covering the input length) from the editable rate card in `src/client/model-pricing.json` (CNY per 1M tokens, converted once from the amaxsmp gateway pricing; `scripts/convert-pricing.mjs` regenerates it). Unknown models and sessions without attributable node usage fall back to the `default` card; edit the JSON and rebuild to update prices.
- **File panel.** A `conversation.view` tab (between the trajectory and Git tabs) browsing the workspace repository's directory tree: directories expand lazily via `/git/list`, and selecting a file reads its current content through `/git/read` into an editable textarea; saving writes it back via `/git/write` — the file is edited in place, never handed to a third-party app.
- **Git panel.** A `conversation.view` tab (in the top tab ring right after the file tab) showing the workspace repository the browser is currently viewing: branch, working-tree changes with per-file diffs, a commit box (`add -A` + commit), a push action, and recent commits in a two-column layout. Selecting a changed file opens it in the right column for in-place editing (same `/git/read` + `/git/write`). The node half registers `/git/*` routes on the host webserver, resolves each request's `cwd` against the live workspace registry (switching workspaces switches the repository without a restart), and runs `git` through `execFile` with array arguments (no shell), so paths and messages never reach a shell. Paths containing `..` or separators are rejected, unknown cwds fall back to the host process cwd, and a non-repo directory shows a quiet notice.
- **Embedded Excalidraw whiteboard tab.** A `conversation.view` tab rendering the workspace scene file (`<workspace>/.dsh/excalidraw/scene.json`, the same `SCENE_RELATIVE` the `@reachforstar/dsh-tool-excalidraw` model tools use) in a live canvas, following the DSH theme, with PNG/SVG export. The node half serves `/scene` routes; the model's `excalidraw_*` tools edit the same file, so a model draw appears on the whiteboard live.
- **Floating file-mutation diff panel.** A `conversation.composer.dock` entry watching the session for newly settled write/edit calls and drawing the applied change at the right edge.
- **Automatic context compaction threshold.** A General-settings row selects the context-pressure ratio (50–80%, or the 80% harness default when unset) at which the session's compaction backend compacts automatically. The choice persists in the `ui-polish` settings document; the node half reads it per step and, when it is below the harness default, measures pressure at `agent/pre-step` and asks the agent's own compaction service (via the roster's agent-addressed service face) to compact first — never double-compacting with the built-in 0.8 listener.

## Building and testing

`pnpm install && pnpm run build` produces `lib/index.js` (node half), `lib/invariant.js`, and `lib/client.js` (the browser bundle) against the published `0.1.1-rc.2` harness packages. The client bundle inlines the Excalidraw editor, its stylesheet, and a Web-Crypto shim for the `node:crypto` references in Excalidraw's dependency tree, so the module table needs no `crypto` row.

`pnpm test` runs the spec files in `tests/` with vitest: the host-side suites (git/excalidraw/background services, apply wiring) and the pure-logic suites (cost, model-index, settled-diffs) run standalone against the published `0.1.1-rc.2` packages. The six browser-runtime suites (`apply.client`, `background-row`, `background-runtime`, `mutation-diff`, `settings-store`, `stats-float`) import the published client bundles (`dsh-client-runtime/client`, `dsh-client-locale`, test-support), which ship as module-table closure bundles loadable only in a DeepSeek Harness workspace checkout; they stay in `tests/` and are excluded from the standalone run (see `vitest.config.ts`).

## Model Experience

None. This plugin is pure client-side presentation (plus host route/settings plumbing): it assembles and sends no provider request, writes no session events, and adds no prompt content. Its only durable footprint is the user-settings background-image and compaction-threshold preferences.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **Fixed-position floats** — the stats card pins itself with `position: fixed` (a plugin cannot reparent core layout), so it overlays the viewport corner regardless of the composer's own position.
- **Token-override transparency** — while a background image is active, every surface painting the base tokens becomes transparent, including some content elements that read `--dsw-alias-bg-base` (e.g. code blocks), which can reduce their contrast on a busy image.
- **Plain-text file editing** — the file and git panels edit files in a monospace textarea, not a syntax-highlighted editor.
- **Whiteboard requires the workspace convention** — the canvas tab renders `<workspace>/.dsh/excalidraw/scene.json`; without a workspace-backed session the tab shows a quiet notice.
