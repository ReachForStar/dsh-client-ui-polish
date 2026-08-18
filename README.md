# @deepseek-ai/dsh-client-ui-polish

English | [中文](README.zh.md)

Standalone web GUI polish plugin, browser half — three enhancements that need no core package changes:

- **Whole-app background image.** The plugin owns its `ui-polish` settings namespace (a data URL, capped at 2MB) and paints the image onto the body (`cover` / fixed / centered), marking the document with `data-ds-bg-image`. Its injected global stylesheet overrides the base tokens (`--dsw-alias-bg-base`, `--dsw-specific-sidebar-fill`) to transparent while the attribute is set, so the structural surfaces — app frame, conversation, details, and sidebar — yield to the image; content elements that need contrast (cards, code blocks, buttons) keep their own fills. The settings row in the General section uploads (with size/type validation), previews, and removes the image.
- **Session stats float with cost.** A `conversation.composer.dock` entry pinned to the viewport's top-right via `position: fixed` shows the durable `sessionStats` and `tokenUsage` projection figures (window-fold fallback for assemblies without the former), plus an estimated spend at a pinned DeepSeek rate card (input 1.5, output 4.5, cache-read 0.05 CNY per 1M tokens), with a hover breakdown per bucket.
- **Floating file-mutation diff panel.** A second `conversation.composer.dock` entry watches the session for newly settled write/edit calls (settled results carrying the `card: 'diff'` render intent) and draws the latest applied change in a fixed panel at the right edge. History is absorbed on open, so a reloaded session stays quiet; the close button dismisses it until the next mutation.

The `/client` exports are the plugin body (`apply`/`inject`), the component prop types, and the injected background-write face type.

## Building and testing

`pnpm install && pnpm run build` produces `lib/index.js` (node half), `lib/invariant.js`, and `lib/client.js` (the browser bundle) against the published harness packages. The plugin targets the DeepSeek Harness web composition: mount it by adding the package to the harness's web-app bundle (`cordis.patch.yml` roster row + dependency + client tsconfig aggregate), exactly like the built-in client plugins.

The spec files in `tests/` exercise the plugin against the harness's test-support packages (`@deepseek-ai/dsh-client-test-runtime`, `@deepseek-ai/dsh-client-web-react`) and its locale source subpaths, which are workspace-internal and not shipped in the published packages — so `pnpm test` runs in a DeepSeek Harness workspace checkout, not standalone.

## Model Experience

None. This plugin is pure client-side presentation: it assembles and sends no provider request, writes no session events, and adds no prompt content. Its only durable footprint is the user-settings background-image preference.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **Fixed-position floats** — the stats card and the diff panel pin themselves with `position: fixed` (the standalone plugin cannot reparent core layout), so they overlay the viewport corner regardless of the composer's own position.
- **Token-override transparency** — while a background image is active, every surface painting the base tokens becomes transparent, including some content elements that read `--dsw-alias-bg-base` (e.g. code blocks), which can reduce their contrast on a busy image.
- **Plugin-drawn diff, not the core details panel** — the mutation panel renders the applied hunks itself; it cannot drive the core details panel's selection (that store is ui-conversation-internal), and non-mutation calls have no right-side panel here.
- **Background upload cap** — images are capped at 2MB because they persist as base64 in the user-settings document.
