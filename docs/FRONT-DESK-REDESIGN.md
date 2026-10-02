# Front Desk interface

The founder-supplied `deskly-redesign.zip` is adapted to the existing game. Its sample employee activity, clock, provider connections and task counts are replaced with live Deskly data. The existing office geometry, employee models and backend connectors are retained.

| Reference | Current implementation |
| --- | --- |
| Main | Directory menu, live task/approval/departure summary, entrance camera |
| Boot | Actual loading percentage, status message and segmented progress rail |
| Setup badge | Live founder/company badge preview; existing five setup steps |
| Setup team | Responsive department ID-card grid; click a card for the existing role, provider, résumé and appearance editor |
| Agent panel | Task, Talk and Résumé & memory tabs; persistent work-order composer and exact-content approval slips |
| Laptop | Existing project tree, editor, terminal, assistant, delegation and whiteboards |
| Operations | Full-window operations directory; existing approvals, tasks, team actions and audit |
| HUD | Clock/region, counters, tags, minimap, controls and interaction signage |
| Pause | Directory menu and accurate current game keyboard guide |
| Settings keys | Visible top tabs for AI providers & keys and team, skills & appearance; shared draft and existing Save action |
| System | Shared tokens, components and locally hosted fonts; a design reference, not another gameplay screen |

Big Shoulders Display, Public Sans and JetBrains Mono are bundled locally with their licenses. No remote fonts or canvas runtime are loaded. The app's CSP, escaped model text and secret-storage boundary remain in place. The supplied conceptual features that do not exist in Deskly are not presented as working controls.

## Source-only verification

`npm run check` runs lint and the existing 78 regression checks. `DESKLY_REDESIGN_CHECK=1 node tools/visual-smoke.cjs` opens the source in an isolated desktop profile and captures the screens in `.cache/redesign-check/` without packaging. Set that environment variable using your shell's syntax.

The visual check exercises the live badge, hiring editor, key editor, employee tabs, demo work assignment, complete approval content and rejection. It checks layout widths at 1280×720, 1920×1080, 2560×1440, 3840×2160 and 720×900. Test data and files are confined to disposable profiles/projects.

During implementation, the laptop's listing request was aligned to the supported three-level depth, and employee panels were made to refresh when approval details arrive after the task status.

The packaged app has deliberately **not** been rebuilt for this redesign. Rebuild only after the founder approves it.
