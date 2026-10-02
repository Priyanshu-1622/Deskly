# Release preparation — October 3, 2026

Status: **Windows 0.1.0 early-access installer built with founder authorization**. Source checks, packaged task workflow, asset inclusion, update-feed configuration, manifest checksums and Electron fuses have passed. This is an unsigned early-access release, not production certification.

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

- 111 automated tests and lint passed, including private-data exclusion in diagnostics.
- Dependency audit reported zero known vulnerabilities across the complete lockfile.
- Isolated source desktop check completed the guided demo task with actual runtime permissions, completion state and a readable project deliverable. Closing restored controls; diagnostics were visible. No renderer errors.
- Source assets retain the existing integrity/geometry/collision regression tests. No real AI quality or FPS/hardware guarantee is inferred from these checks.
- NSIS Windows x64 installer rebuilt with electron-updater 6.8.9. The packaged guided demo task completed with approvals and a readable deliverable, restored controls and zero renderer errors.
- Packaged archive includes all four employee models, world and tree assets, the updater dependency, privacy/limitations and notices. Development folders are excluded. RunAsNode, Node options, CLI inspect and extra file privileges are disabled; ASAR-only loading and embedded integrity verification are enabled.
- app-update.yml targets only Priyanshu-1622/Deskly on GitHub. latest.yml's installer SHA-512 matches the rebuilt executable. SHA256SUMS.txt covers the installer, blockmap and update manifest. Installer signature status: NotSigned.
- Update tests cover coalesced checks, offline recovery, source-build disabling, argument-free IPC, active-work blocking, repeated activity check after confirmation, and failed saves preventing installation. The first release cannot prove a real upgrade to a future version; clean-machine install/update/uninstall and migration tests remain outstanding.

The subsequent Claude audit fixes are recorded in [audit remediation](AUDIT-REMEDIATION.md), including source-only regression and rendering evidence. This is still a beta source readiness assessment, not installer certification.

## Gates still requiring validation

1. **Real AI workflows:** representative frontend/backend tasks and shared discussions with the intended installed CLI/API providers, including authentication, rate limits and memory correctness. Existing opt-in provider/benchmark tools may incur charges; no live calls were made in this pass.
2. **Clean-machine application checks:** verify install/update/uninstall, key storage, dialogs, pointer lock and crash/quit recovery on a separate clean Windows machine. Local packaged launch/render/task checks do not substitute for this.
3. **Release signing:** supply signing credentials and validate the actual signed installer. macOS/Linux must be tested separately before advertised support.
4. **Hardware and extended use:** measure representative low/high-spec machines, full meetings/night lighting, long sessions and image-heavy boards. Publish hardware targets based on measurements.
5. **Remaining product scope:** remappable controls/controller support, profile backup/import/migrations and project-specific board storage remain roadmap items. Current room boards are device-wide; the privacy/user guides disclose this.

The founder authorized rebuilding and publishing the first Windows version with automatic updates. Unmet gates remain disclosed in [limitations](LIMITATIONS.md). See [release policy](../RELEASE_POLICY.md), [privacy](PRIVACY.md), [user guide](USER-GUIDE.md) and the [public release roadmap](PUBLIC-RELEASE-PLAN.md).
