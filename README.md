# @deepseek-ai/dsh-client-ui-polish

English | [中文](README.zh.md)

Standalone web GUI polish plugin, browser half — three enhancements that need no core package changes:

- **Whole-app background image.** The plugin owns its `ui-polish` settings namespace (a data URL, capped at 2MB) and paints the image onto the body (`cover` / fixed / centered), marking the document with `data-ds-bg-image`. Its injected global stylesheet overrides the base tokens (`--dsw-alias-bg-base`, `--dsw-specific-sidebar-fill`) to transparent while the attribute is set, so the structural surfaces — app frame, conversation, details, and sidebar — yield to the image; content elements that need contrast (cards, code blocks, buttons) keep their own fills. The settings row in the General section uploads (with size/type validation), previews, and removes the image.
- **Session stats float with cost.** A `conversation.composer.dock` entry pinned to the viewport's top-right via `position: fixed` shows the durable `sessionStats` and `tokenUsage` projection figures (window-fold fallback for assemblies without the former), plus an estimated spend billed per model with an input/cache/output bucket split shown directly under the total: a state-only Conversation Definition records each settled assistant message's model (messageId → model) into a plugin-owned index, and each step's usage is priced at its own model's rate and its own settle time (so time-tiered models like deepseek switch between peak and off-peak prices, and length-tiered models pick the tier covering the input length) from the editable rate card in `src/client/model-pricing.json` (CNY per 1M tokens, converted once from the amaxsmp gateway pricing). Unknown models and sessions without attributable node usage fall back to the `default` card (deepseek-v4-flash off-peak: input 1.5, output 4.5, cache-read 0.05); edit the JSON and rebuild to update prices.
- **File panel.** A `conversation.view` tab (between the trajectory and Git tabs) listing every file a settled tool call operated on in the session (read / edit / write cards). Selecting a file reads its current content through the host's `/git/read` route into an editable textarea; saving writes it back via `/git/write` — the file is edited in place, never handed to a third-party app.
- **Git panel.** A `conversation.view` tab (in the top tab ring right after the file tab) showing the workspace repository the browser is currently viewing: branch, working-tree changes with per-file diffs, a commit box (`add -A` + commit), a push action, and recent commits in a two-column layout. Selecting a changed file opens it in the right column for in-place editing (same `/git/read` + `/git/write`). The node half registers `/git/*` routes on the host webserver, resolves each request's `cwd` against the live workspace registry (switching workspaces switches the repository without a restart), and runs `git` through `execFile` with array arguments (no shell), so paths and messages never reach a shell; the browser half is a plain fetch client carrying the current workspace path, with per-workspace fetch caching so revisiting the tab is instant. Paths containing `..` or separators are rejected, unknown cwds fall back to the host process cwd, and a non-repo directory shows a quiet notice.

The `/client` exports are the plugin body (`apply`/`inject`), the component prop types, and the injected background-write face type.

## Building and testing

`pnpm install && pnpm run build` produces `lib/index.js` (node half), `lib/invariant.js`, and `lib/client.js` (the browser bundle) against the published harness packages. The plugin targets the DeepSeek Harness web composition: mount it by adding the package to the harness's web-app bundle (`cordis.patch.yml` roster row + dependency + client tsconfig aggregate), exactly like the built-in client plugins.

The spec files in `tests/` exercise the plugin against the harness's test-support packages (`@deepseek-ai/dsh-client-test-runtime`, `@deepseek-ai/dsh-client-web-react`) and its locale source subpaths, which are workspace-internal and not shipped in the published packages — so `pnpm test` runs in a DeepSeek Harness workspace checkout, not standalone.

## Model Experience

None. This plugin is pure client-side presentation: it assembles and sends no provider request, writes no session events, and adds no prompt content. Its only durable footprint is the user-settings background-image preference.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **Fixed-position floats** — the stats card pins itself with `position: fixed` (the standalone plugin cannot reparent core layout), so it overlays the viewport corner regardless of the composer's own position.
- **Token-override transparency** — while a background image is active, every surface painting the base tokens becomes transparent, including some content elements that read `--dsw-alias-bg-base` (e.g. code blocks), which can reduce their contrast on a busy image.
- **Plain-text file editing** — the file and git panels edit files in a monospace textarea, not a syntax-highlighted editor.
- **Background upload cap** — images are capped at 2MB because they persist as base64 in the user-settings document.
