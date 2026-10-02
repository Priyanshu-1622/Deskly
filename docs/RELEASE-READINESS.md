# Source release preparation — October 2, 2026

Status: **prepared for beta validation; public production release is not yet certified**. No app package or installer was built during this pass.

## Completed

- Safe diagnostics export in Settings → Privacy & data. Allowlisted system/app versions, display settings, health flags and activity counts; no keys, names, paths, content, prompts, raw errors or endpoints.
- Guided first task from the introduction. Choose a folder/provider, explicitly check the connection, assign work, follow progress, review permissions and inspect the result. Demo is labeled simulated; hosted checks/tasks can incur charges.
- Added H for replaying the guide and completed the visible shortcut reference for map, boards, guide and group meetings.
- Privacy/storage guide, user troubleshooting guide, security reporting policy and structured bug-report template.
- Required Three.js license is bundled; future packages include app/asset notices, privacy and user documentation. Existing MakeHuman and font license files remain.
- Source-only `npm run release:check`: lint, regression tests, repository hygiene, dependency audit, office rendering and guided-task desktop checks. It does not package an app or use paid AI.
- Removed 29 generated or obsolete captures from the tracked checkout (31.4 MB). Local copies remain ignored. The README's office atlas is preserved under screenshots, and its current gallery remains. Art/model files, source, tests and license records are retained.
- Renamed the completed group-conversation document and added checks against tracked installers, private runtime files, oversized blobs and broken documentation links. Historical Git commits retain earlier captures; history is not rewritten.

## Evidence

- 87 automated tests and lint passed, including private-data exclusion in diagnostics.
- Dependency audit reported zero known vulnerabilities across the complete lockfile.
- Isolated source desktop check completed the guided demo task with actual runtime permissions, completion state and a readable project deliverable. Closing restored controls; diagnostics were visible. No renderer errors.
- Source assets retain the existing integrity/geometry/collision regression tests. No real AI quality or FPS/hardware guarantee is inferred from these checks.

## Gates still requiring validation

1. **Real AI workflows:** representative frontend/backend tasks and shared discussions with the intended installed CLI/API providers, including authentication, rate limits and memory correctness. Existing opt-in provider/benchmark tools may incur charges; no live calls were made in this pass.
2. **Packaged application:** build only after founder approval, then verify asset inclusion, fuses, clean install/update/uninstall, key storage, dialogs, pointer lock and crash/quit recovery on a clean Windows machine.
3. **Release signing:** supply signing credentials and validate the actual signed installer. macOS/Linux must be tested separately before advertised support.
4. **Hardware and extended use:** measure representative low/high-spec machines, full meetings/night lighting, long sessions and image-heavy boards. Publish hardware targets based on measurements.
5. **Remaining product scope:** remappable controls/controller support, profile backup/import/migrations and project-specific board storage remain roadmap items. Current room boards are device-wide; the privacy/user guides disclose this.

The forthcoming founder bug/change file should be reviewed against these gates before a beta is built. See [release policy](../RELEASE_POLICY.md), [privacy](PRIVACY.md), [user guide](USER-GUIDE.md) and the [public release roadmap](PUBLIC-RELEASE-PLAN.md).
