# Deskly public release plan

Deskly is an installable Electron game app today. A production release needs reliable installation, clear first-time learning and verified real AI workflows, as well as attractive graphics. Ship a focused public beta before promising AAA polish.

## Implemented in this pass
- Removed the three redundant hanging CEO signs; retained the actual CEO door plaque.
- Full office map: click the minimap or press G, search rooms and people, plan a collision-aware walking route, zoom, scroll, and open boards or help. Employee positions refresh while the map is open.
- First-day introduction, automatically shown once; replay with F1 or from the map. Covers movement, tasks, approvals, laptop, brainstorming, meetings and shifts.
- Freeboards: E at a physical board, or Whiteboards on your laptop/map. Add text, local PNG/JPG/WebP images and HTTP(S) links. Move, resize, recolour and delete cards. Save automatically to the device; export a JSON backup. All seven office boards display saved content in 3D. Research boards share the room's board. Images are resized before storage.
- Board edits, map and guide require no provider connection or AI calls. Existing meeting notes also become board cards.

## Release gates, in order

### 1. First playable public beta
- Add a guided practice task with explicit completion steps: choose a folder, test a connector, assign a small task, review permission, inspect the result.
- Improve the first-day guide into an optional walking tour with objectives, arrival checks and contextual hints. Offer skip, replay and a searchable control reference.
- Explain demo output versus real AI work everywhere a task can be launched. Connection tests must show actionable authentication, model, quota and network errors.
- Verify every physical activity, chair, doorway, board and panel exit on a clean profile and an upgraded saved profile.
- Add board import, undo/redo, layering, project scoping and attached workspace references. Current boards are device-local and room-scoped, with no live multiplayer synchronization.
- Verify a real frontend/backend project with several employees, scoped folders, shared contracts, conflicting edits, approvals, cancellation and crash recovery.

### 2. Installation and recovery
- Build a versioned Windows installer, validate clean install/update/uninstall, and document where private data and projects live.
- Decide signing and release delivery; test OS security prompts and installation without developer tools.
- Add a deliberate update channel with release notes, staged updates and recovery if an update fails.
- Add local crash reports with an opt-in export, restore interrupted work, and provide save/profile export, import and migration tests.
- Test Mac/Linux packaging separately before claiming support. Keep the first beta's supported platforms and known limitations explicit.

### 3. Game feel and accessibility
- Remappable controls, mouse sensitivity, FOV, audio sliders, subtitles, contrast/text-size options and reduced camera motion.
- Controller and touch support with readable prompts; verify menu navigation without a mouse.
- Set hardware targets and measure low/medium/high performance with the full team, night lighting, meetings and image-heavy boards.
- Loading progress, missing-asset fallback, graphics presets, predictable frame pacing and memory limits over long sessions.
- Polish interaction reach, animation transitions, sound variation, dialogue readability and pause behaviour.

### 4. AI reliability, trust and cost
- Provider-specific end-to-end tests with real login/API access; never claim a connector works based only on simulated tests.
- Show what files and commands an employee intends to touch; preserve approvals and safe project boundaries.
- Make budgets, reported token usage, task dependencies, retries and failure recovery understandable.
- Evaluate role prompts and memory with repeatable real tasks. Distinguish verified facts from inferred notes; isolate private project knowledge.
- Idle employees remain local simulation. Queue only real tasks, reuse context carefully and measure savings rather than promise an unverified percentage.

### 5. Public release operations
- Audit third-party asset, texture, animation, font and dependency licenses and include required attribution.
- Write privacy/data-storage documentation, starter project instructions and troubleshooting guides.
- Publish a small beta to collect hardware, onboarding, navigation and task-quality feedback before a wider launch.
- Provide reproducible bug reporting, supported versions, release notes and regression gates.

## Night recall rules
Use **Tab → Team → Call everyone back · keep here**. Manual recall persists across nights and restarts; employees remain until released with **Send everyone home** or their individual send-home action. It is not a one-night timer. Overtime is a separate per-person hold. Active work may keep a worker until the task finishes, and a meeting may delay departure. The normal automatic schedule resumes after manual holds are removed; the next scheduled workday brings employees back normally. Idle presence does not initiate AI work or consume tokens.

## Verification for this pass
Existing automated regression suite plus isolated Electron checks for first-run guide, full map, CEO route, board persistence, seven physical displays and Escape restoring movement. These checks do not certify real provider output or installer/update readiness.
