# Deskly project audit — 2026-09-29

## What this project is

Deskly is already an Electron desktop application. Its renderer is a browser-based Three.js game, packaged by Electron for Windows, macOS and Linux. Opening `src/renderer/index.html` outside Electron runs a simulated browser preview. The desktop path has provider adapters for Anthropic, OpenAI, Gemini, OpenRouter, Ollama and custom OpenAI-compatible endpoints; the default `demo` provider simulates task work. There is no installed-Codex-login integration yet.

The replacement project contains a generated 3D office asset and map, first-person movement, procedural people, conversations, team setup, task and approval flows, an operations board, meetings and a laptop with file editor and terminal. These are a useful foundation and should be developed in place.

## What was verified in this pass

- Read the main process, preload, storage, provider adapters, task runtime, workspace tools, renderer entry points, packaging metadata, tests and README.
- Ran `npm test`: 10 tests passed after the security changes below.
- Changed secret storage to fail when Electron secure storage is unavailable. Legacy unencrypted records are no longer treated as usable keys. On Linux, Electron's `basic_text` backend is rejected.
- Refused symbolic links and common secret filenames in workspace file tools, including writes; bounded reads and writes; limited commands to 300 characters so the approval text contains the whole command.
- Restricted IPC to the app's main frame, app navigation to its entry page, static file serving to real files under the renderer root, and pointer lock/full-screen permissions to that window.
- Corrected setup and README text that previously promised stronger isolation than the code provides, and made key-save errors visible.

## Production work, in priority order

### 1. Trust and data safety

- Replace the shell denylist with a clear command risk model. Approval alone does not sandbox a command; show the exact command, working directory and likely file/network effects. Consider an isolated worker/container for autonomous execution.
- Make file write approval show a diff or full proposed content. The current setting defaults to allowing employee writes without review; reports are also written automatically. Expand path and content validation beyond the initial size bounds, including binary content. Account for link races and platform-specific aliases.
- Validate and normalize all configuration and IPC inputs in the main process: workspace selection, employee IDs, providers, URLs, task lengths, terminal commands and external links. Restrict custom provider endpoints according to the product's intended trust model.
- Add explicit migration/removal of legacy `enc:false` secret records. Never claim keychain protection when the platform backend cannot provide it. Define export/reset/recovery behavior.
- Stop hiding audit write failures; make task persistence atomic, versioned and recoverable. Decide what happens to pending approvals and interrupted work after a crash.

### 2. Real AI reliability

- Test each provider against its current API, supported models and errors. Add request timeouts, cancellation, response-size limits, rate-limit handling and sensible token controls. These adapters exist but have not been verified live in this audit.
- Replace the fragile one-JSON-action-per-turn protocol with validated schemas, structured tool results and bounded context. Keep task state per task; the demo adapter currently keys its step counter by prompt length, which can collide across tasks.
- Add the earlier requested installed Codex login as a separate backend after checking supported integration methods. Do not assume that desktop login tokens or internal files can be reused as an API.
- Evaluate the new editable role playbooks, project/global memory, teammate handoffs and usage controls with real providers. They are now wired into the runtime, but the 60–70% cost target is unverified.
- Add clear provider connection status and setup guidance. Browser preview should remain visibly simulated.

### 3. Desktop release

- Add a lockfile and repeatable clean install/build checks. `package.json` declares Electron packaging, but this audit did not verify an installer or launch the desktop UI.
- Add production icons, app identity, Windows/macOS signing and notarization, update strategy, crash reporting policy, data migration and platform QA. Verify the generated 3D asset and vendored library licenses/provenance.
- Test first launch, pointer lock, asset loading, file dialogs, provider setup, approvals, editor saves, terminal, task recovery and installer behavior on each target OS.

### 4. Game and product quality

- Profile office loading, frame time and memory on low-end GPUs; add graphics fallbacks and accessibility options. Review navigation, interaction reach, seat assignments and employee animation in the actual desktop build.
- Improve task review: previews and diffs, clear ownership of changed files, undo/revert paths, and a history that survives restarts.
- Decide which integrations and actions belong in the first release. Current external-action approvals only record intent; they do not perform the action.

## Release gate

Do not label a build production ready until provider calls, file and command permissions, secret handling, crash recovery, install/uninstall, and representative end-to-end office interactions have been verified on supported platforms. Current tests exercise the runtime and selected boundaries; they do not exercise Electron packaging or the 3D UI.
