# Claude audit remediation

Source review date: 3 October 2026. This records the disposition of the supplied `DESKLY_AUDIT.md`, including findings that were already protected and recommendations that need later release validation. No desktop package was built or published during this work.

## Crash and data-loss findings

| Audit ID | Resolution |
| --- | --- |
| 1.1 | The frame loop always queues the next frame. One failure is recoverable; three consecutive failures pause graphics and offer a reload button. |
| 1.2 | Failed WebGL initialization displays a graphics explanation and retry control. |
| 1.3 | One context-loss overlay is reused. Restored graphics remove it and reload. |
| 1.4 | Repeated renderer crashes save low quality and disabled shadows before guarded reload. |
| 1.5 | Binary, unsupported-encoding and oversized editor previews cannot be saved. Editable text retains CRLF and uses a version check to detect external changes. |
| 1.6 | New notes confirm unsaved edits and receive unique timestamp/UUID names. New-file creation refuses existing targets. |
| 1.7 | Task assignment awaits persistence; failed creation preserves the draft and does not report success. |
| 1.8 | Chat requests send the latest 40 bounded messages. Saved conversations are retained locally. |
| 1.9 | Unchanged workspace settings do not revalidate a missing directory. Changing the workspace still requires a native folder selection. |
| 1.10 | Erasure does not require a valid project folder and includes discussion primary, backup, corrupt and temporary files. Unrelated files are preserved. |
| 1.11 | Empty custom endpoint drafts can be saved, including matching key-sharing drafts. Unsafe nonempty endpoints remain rejected; using an incomplete connection still requires correction. |
| 1.12 | Quarantine failures produce a recovery notice instead of aborting startup. Atomic writes preserve malformed primary data and a valid backup. Discussion recovery validates each record separately. |
| 1.13 | Kept the existing graceful fatal-error quit: `before-quit` aborts operations and flushes runtime stores. Continuing arbitrary uncaught main-process exceptions would leave uncertain state. This does not guarantee an unfinished external command completed. |
| 1.14 | Approval views tolerate removed tasks and employees. |
| 1.15 | Synchronous and asynchronous atomic renames retry transient Windows locks three times with short backoff. Persistent failures remain visible. |
| 1.16 | Fullscreen handlers check that the window is alive. |

## Runtime and employee logic

| Audit ID | Resolution |
| --- | --- |
| 2.1 | Every colon/hyphen separator becomes camel case in preload, including `workspaceIgnoreMap`. Regression coverage checks exposed names. |
| 2.2 | Secret filtering checks paths relative to the selected workspace, avoiding false positives from ancestors. |
| 2.3 | Explicit public environment templates and ordinary `id_utils` names are allowed. Private key names, FIDO keys and backups remain blocked. `.envrc` intentionally remains protected because it can contain shell credentials. |
| 2.4 | Providers report truncated replies explicitly. The runtime requests smaller chunks, supports reviewed append writes and uses a larger work-turn budget. Files remain bounded to 1 MB. Append detects external edits and exclusively creates absent targets. |
| 2.5 | Known reasoning-model and Gemini short requests receive a reasoning-aware budget. Ordinary lightweight models retain their smaller requested budgets. |
| 2.6 | Empty provider output now raises `empty_response`, enabling the existing lightweight fallback. |
| 2.7 | Command output keeps beginning and ending portions, including a separate stderr tail and timeout diagnostics. |
| 2.8 | Shared credentials resolve through chains with cycle and endpoint/provider guards. Whole-team setup points to the final credential owner. |
| 2.9 | Memory shows the number of notes awaiting review. Only verified notes enter active-task context. |
| 2.10 | Memory failures are reported separately and do not suppress the team completion update. |
| 2.11 | Resume clears stale error text and codes. |
| 2.12 | Resume includes bounded recent checkpoint context rather than the entire history. |
| 2.13 | Shutdown stops approvals without reporting a founder rejection or briefly restarting work. |
| 2.14 | Model step updates require finite numbers. |
| 2.15 | Terminal task states emit approval resolution and clear employee approval timers. |
| 2.16 | Failed or timed-out walks clear queued seating actions; distant seats require a new approach route. |
| 2.17 | Failed navigation searches retry once per second rather than every frame. |
| 2.18 | Returning to a desk removes the employee from meeting membership. |
| 2.19 | Follow orders use an invalidation token, preventing duplicate loops. |
| 2.20 | Lift arrivals reset one close timer. |
| 2.21 | Shift staggering is capped at 20 minutes across the team. |
| 2.22 | Failed and interrupted work is restored to employee state after reload. |
| 2.23 | Department overflow explicitly explains the replacement desk choice. |
| 2.24 | Changing roles updates untouched defaults while preserving customized persona, instructions, résumé and task suggestions. |
| 2.25 | Hiring is disabled at 50 employees and guarded in the handler. |
| 2.26 | Saved discussions can be deleted, corrupt entries are recovered separately and writes use the existing buffered atomic store. The archive remains bounded at 200 sessions; when full it instructs the user to delete old discussions rather than silently erase transcripts. It still uses a single JSON archive, not a database. |
| 2.27 | Meeting-idea requests share an abort controller; stopping or ending the activity cancels pending work. |
| 2.28 | Reset confirmation disarms after four seconds and also requires a native confirmation dialog. |
| 2.29 | The operations board updates when state changes, without a five-second forced rebuild. |
| 2.30 | Usage retention is bounded to recent months. UTC month labels remain explicit. Reconfirming a duplicate memory updates its verification, provenance and timestamp. |

## Human-facing behavior

| Audit item | Resolution |
| --- | --- |
| 3.1 | Ambient chatter uses obvious office flavor or actual task titles, not invented business events. |
| 3.2 | Name tags and bubbles check the collision map for obstruction. This is coarse map occlusion, not full mesh ray tracing. |
| 3.3 | Employees yield near the player. |
| 3.4 | Doors choose their swing direction from the approaching actor and collide along their moving panels. Proximity still opens office doors intentionally. |
| 3.5 | Removed hidden Q camera rotation and dead E code. |
| 3.6 | Mouse input works on hybrid touch devices, and look spikes are clamped. |
| 3.7 | Nearby focused monitors use 512 px textures with doubled effective text resolution; other monitors retain the smaller budget. |
| 3.8 | Onboarding explains the first-task project map and folder creation. Existing role homes remain explicit; developer-description routing recognizes UI/frontend terms. |
| 3.9 | The visual logo heading has the accessible name “Deskly”. |
| 3.10 | Escaped Markdown supports safe links and tables. |
| 3.11 | The laptop drills into folders at any depth and pages large directories in groups of 400, showing totals and previous/next controls. |
| 3.12 | The connection UI explains unavailable encrypted key storage and Linux keyring setup; README documents the requirement. |
| 3.13 | Ultra quality is offered in the settings control. |
| 3.14 | Task/chat failures preserve drafts. Shared-decision results explicitly distinguish saved discussion text from failed participant memories. |

## Security and privacy

- Literal commands remain visible for explicit founder approval. The deny list is an extra heuristic, not a sandbox or a complete security boundary. Approved shell commands retain the founder's operating-system permissions.
- Build environment forwarding includes Java, Go, Node tooling, proxies and certificate paths while excluding API credentials. Proxy URLs containing embedded usernames/passwords are excluded.
- Approval audit records retain action kind and risk, not command summaries, source text or full file content. Task logs no longer copy literal approved command summaries. Model checkpoints and saved chats can still contain private project content; [privacy documentation](PRIVACY.md) describes that retention.
- Progress/output notifications send deltas. Full pending approval content is sent for approval/state changes, not every progress event.
- Installed Windows Codex resolution checks native executables and `.cmd` shims. Read-only `--help` checks confirmed the installed Codex `exec` flags and Claude Code `--restricted`; no paid requests were made. Authentication and model quality remain live-provider validation gates.
- Independent read-only investigation and post-fix review covered endpoint/key sharing, erasure, secret paths, audit records, editor pagination and append conflicts. The two append conflict findings from the final review received fixes and regression tests.

## Performance, assets and scene

- The original two character files fell from approximately 29 MB each to 5.87/6.03 MB. Two additional licensed body/face and outfit variants are selectable, at approximately 5.75/6.01 MB. The four models together occupy less space than the former pair.
- Authored textures retain detail at 1024 px maximum, with smaller alpha/normal maps and JPEG for opaque color maps. Quantized UV/skin attributes and sparse morph data reduce source size. Close face geometry is retained.
- Unselected hair geometry is removed from instances. Shared character detail variants render approximately 56–66k triangles nearby, 7–9k at medium distance and 3.7–4.2k far away. Distant shadows remain limited.
- Trees retain their original close meshes. Offline medium-detail indices are below 15k triangles per source tree asset; far detail is below 3k. Instanced batches select the appropriate range using the actual camera view.
- Static office batching and tree instancing already existed. The supplied audit's 572-call office estimate did not describe the current rendered default view. Original room geometry, geometry-based signs and layout are preserved rather than replaced purely to meet a synthetic call target.
- Time-dependent materials are cached. Focus/tag vectors and actor-position arrays are reused. Full-screen overlays render at a lower rate; hidden settings do not render the scene.
- Character previews debounce rebuilds and dispose renderer, rig, floor and animation callbacks on close. Team rebuilds unsubscribe office handlers and dispose screen resources.
- Balanced HiDPI rendering uses a 1.25 ceiling; nearby employee animation updates every frame. Shadow toggles invalidate affected materials. Shadow refresh is 0.1 seconds; fully continuous dynamic shadows remain a hardware-dependent quality tradeoff.
- The Poly Haven armchair is actually placed as `CEO_Authored_Lounge_Chair` and is checked by the source smoke. It is retained. Raw sources and development tools remain excluded from the app packaging allowlist.
- `world.json` now exports room rectangles, spawn and arrival/entry coordinates from `tools/office-layout.json`. Map transforms use world bounds. Obsolete minimap code was removed; no unbundled Manrope dependency remains there.
- Whiteboard reads, pins and legacy saves converge on IndexedDB. Old text is migrated and removed from the old store only after successful durable saving. Concurrent first loads share one promise. Boards remain device-wide as documented.
- Sound output is local to each sound. Completed sources, gains, filters and spatial nodes are disconnected.

## Evidence and remaining release gates

Verified locally:

- 111 automated tests and lint, including long chats, secret ancestors, erase siblings, provider truncation, approval cancellation, corrupt archives, editor conflicts, Windows rename retries, append races and tree-detail bounds.
- Repository hygiene and dependency checks: no packaged apps/private data in tracked files; zero known lockfile vulnerabilities.
- Real source renderer recovered from an injected frame error. Fixed office capture: 165 draw calls, 273,707 rendered triangles, no reported renderer errors. These are view-specific counters, not a hardware FPS benchmark.
- Guided source task: connection check, assignment, approval, completion, readable output, restored controls and diagnostics.
- Character integrity/rig/morph tests cover all four source models. Close male/female and outdoor captures were visually inspected.

Recommendations in the supplied audit that explicitly target **after v1** are tracked as planned work: authored baked idle/type/drink/gesture clips, a coordinated Three.js upgrade with color/loader/shadow regression comparisons, and native provider tool-calling. Procedural animations and the bounded JSON tool protocol remain supported today. Importing authentic baked clips requires a redistributable source animation set and chair/prop retargeting; generated substitute clips are not claimed as authored motion.

Before calling this a public production release, validate paid/live providers, representative integrated/discrete GPUs and long sessions, then build with founder approval and test installation on a Windows machine without Node. Verify packaged asset inclusion and security fuses, signing, update/uninstall behavior and native key storage. macOS/Linux remain unverified targets. The founder requested no app build during this pass, so those package-only checks have not been performed. See [release readiness](RELEASE-READINESS.md).
