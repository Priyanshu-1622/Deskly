# Deskly

**Your AI company, in a real office.** Deskly is an open-source desktop app for Windows, macOS and Linux. You walk a 3D office in first person and hire AI employees. You hand them real work on your project, approve anything risky, and review what they deliver. You also have your own laptop at your desk, where you can code, run commands, chat with your assistant and send work to the team.

Think of multi-agent office tools like Munder Difflin, but as a place you walk around in instead of a dashboard.

## What you can do

- **Hire your team.** Add or remove employees, pick a role and department, and write their job description and personality.
- **Design how each employee looks.** A live 3D preview lets you set body, height, skin, hair, clothes, glasses, beard and headset.
- **Give every employee their own AI.** Each one gets its own provider, model and API key: Anthropic, OpenAI, Gemini, OpenRouter, Ollama (local), or any OpenAI-compatible endpoint.
  - Every role has an editable work playbook. Project and approved cross-project notes, file claims and teammate handoffs provide continuity when tasks overlap.
  - An optional lightweight model can handle planning, short conversations and meeting ideas. The main model handles task execution. Token usage and a monthly ceiling are available in Settings.
  - One employee can reuse another's key.
  - "Use this AI setup for the whole team" copies one employee's provider and key to everyone in a single click.
- **Walk the office.** Move with WASD and look with the mouse. People arrive in the morning, grab coffee, chat, sit at their desks and type, and look up when you walk past.
- **Assign real work.** Walk up to someone and press **E**. They plan the task, then work inside your project folder: they list, read and write files. Their monitor shows a live log.
- **Approvals.** Shell commands and anything that leaves the company (email, publishing, deploys, payments) pause for you. The employee raises a hand, then walks over to find you. Deskly never sends or publishes anything on its own; approved external actions are recorded in the audit log.
- **Results.** When the work is done, the employee comes to tell you. Their report is saved to `deskly-output/`, and any files they touched open on your laptop.
- **Your laptop.** Sit at your desk and press **E** (or press **L** anywhere). You get a file tree of your project, an editor (Ctrl+S saves), a terminal, your own AI assistant (which sees the open file and can insert code), and a box to send instructions to anyone on the team.
- **Call people from your chair.** Sit at your desk (E), then press **C**. Pick everyone, a department or specific people, and choose where: your office, the boardroom or a meeting room. Seats fill first and anyone extra stands around the room. Send everyone back with one click.
- **Meetings.** Press **M**, pick a room and the attendees, and they walk over and sit down. You can run a go-round of status updates, or brainstorm a topic where each person answers with their own AI.
- **Operations board.** Press **Tab** for every task, pending approval, the team, and the audit log.

## Controls

| Key | Action |
|---|---|
| W A S D | Walk (hold Shift to hurry) |
| Mouse | Look (click the view to capture the mouse) |
| E | Talk to the person you're facing, or use what's in front of you |
| L | Open your laptop |
| Tab | Operations board |
| C | Call people (to your office or a meeting room) |
| Esc | Close a panel, or pause |
| F11 | Full screen |

## Getting started

```bash
git clone https://github.com/Priyanshu-1622/Deskly.git
cd Deskly
npm install
npm start            # run the app
npm run dev          # run with DevTools
npm test             # runtime tests (Node 20+)
npm run dist:win     # or dist:mac / dist:linux — builds an installer into dist/
```

On first launch, a setup wizard walks you through five steps:
1. Your name and your company's name.
2. Your project folder.
3. Your team.
4. Your assistant.
5. A summary, then you walk into the office.

Everything can be changed later in **Settings**.

See [AGENT_ARCHITECTURE.md](AGENT_ARCHITECTURE.md) for the current memory and coordination behavior and the cost-reduction plan.

## Design system: Wayfinding

The UI borrows from office signage rather than typical app chrome:
- **Colour:** olive-graphite plates (`#242922`, `#323a2f`) with a signal-yellow marker (`#f2c230`) on warm off-white text (`#ece8d9`).
- **Type:** condensed DIN-style lettering (Bahnschrift on Windows) for headings and labels.
- **Shape:** square 3px corners, hairline rules, and a yellow band on the top edge of every panel, like a room plate.
- **Status colours:** kept separate from the accent.

All the tokens live at the top of `src/renderer/css/game.css`.

## Current security model

- **API keys** are submitted from the setup/settings form to the main process, then encrypted with Electron `safeStorage` before being written to disk. When secure storage is unavailable, saving a key fails. Older `enc:false` key records are ignored and should be removed from the app data folder after re-entering keys.
- **File tools** use the chosen project folder and refuse paths through symbolic links and common secret filenames. This is a boundary for Deskly's file tools, not a system sandbox.
- **Shell commands** require approval and display the complete command (up to 300 characters). Approved commands run with your OS permissions and can access locations outside the project folder. The block list only catches some obvious dangerous commands.
- **External actions** are approved and recorded, but Deskly does not send or publish them.
- **Audit events** are appended to `audit.jsonl`. Audit write failures are not yet surfaced to the user.
- **The renderer** uses a sandbox, context isolation, a CSP and a restricted preload bridge. Main process IPC checks the sending frame.

This is a working prototype, not a production security guarantee. See [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) for the remaining release work.

## Architecture

```
src/main/                 Electron main process (the trusted side)
  main.js                 window, app:// protocol, IPC handlers
  preload.js              the only bridge exposed to the renderer
  store.js                settings JSON + encrypted API keys
  runtime/runtime.js      task lifecycle, agent loop, approvals, audit log
  runtime/providers.js    Anthropic / OpenAI-compatible / demo adapters
  runtime/workspace.js    project-scoped file tools and command runner
src/renderer/             the 3D app (untrusted side, no Node access)
  js/game.js              boot, office flow, first-person loop
  js/screens.js           start menu, setup wizard, settings, pause, laptop
  js/ui.js                HUD, conversations, board, meetings
  js/agents.js            employee behaviour and task-state → world mapping
  js/human.js             procedural characters and animation
  js/world.js, nav.js     office, doors, lifts, screens, pathfinding
  js/runtime-client.js    mirror of runtime state for the UI
  js/bridge.js            preload API, or a demo fallback in a plain browser
  assets/                 office.glb + world.json (generated)
tools/build_office.py     regenerates the office (Python, trimesh)
```

### The agent loop

1. The employee first produces a short plan as JSON.
2. It then works turn by turn, and each turn is one JSON action: `list_dir`, `read_file`, `write_file`, `run_command` or `request_action`, or `done` with a report.
3. The loop is provider-agnostic, so any chat model that can follow JSON instructions works.

To add a provider, add an entry to `PROVIDERS` and a branch in `chat()`.

## Known limits

- External actions (email, publishing, deploys) are approved and recorded, not performed. Connectors for real sending are the natural next step.
- Characters are procedural (no imported models). This keeps the repo small and fully source-built.
- Only the 196 desks in the generated office are available; there's no second floor yet.

## License

MIT
