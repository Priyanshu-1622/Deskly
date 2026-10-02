# Current limitations — Deskly 0.1.0

Deskly's first version targets Windows desktop use. These limits describe the current implementation, rather than promises about future releases. Read the [user guide](USER-GUIDE.md) for first-session steps and troubleshooting.

## AI and project work

- Demo mode simulates tasks and replies. Real work requires a configured hosted provider, local model or separately installed and signed-in Codex/Claude Code CLI.
- Provider availability, subscription eligibility, rate limits, model quality and charges depend on your provider. Connection checks do not certify every real project workflow.
- Only employees with assigned work, selected discussion replies or requested conversations call AI. Walking and sitting are local. Lightweight routing, context limits and token ceilings help control usage, but the proposed 60–70% cost reduction has not been measured.
- Keep write approvals enabled while learning. Review generated files and run your project's own checks. Approved shell commands have your operating-system permissions; the project file boundary is not a command sandbox.
- The task protocol uses bounded JSON replies and reviewed file chunks, not native provider tool-calling. Each file write is capped at 1 MB. Laptop editing is limited to UTF-8 text under 400 KB; larger/binary files are read-only previews.
- External email, deployment, payment and publishing actions are not implemented as executable employee tools.

## Memory, discussions and storage

- Verified memory enters employee prompts. Unverified employee notes need founder review; confirmed shared decisions create verified project notes.
- Saved discussions are project-scoped and bounded at 200 sessions. Delete old discussions when full. There is no automatic deletion of your transcripts.
- Room whiteboards are stored on this device and shared across projects. Export important boards before erasing data. Project-specific boards, cloud sync and full profile backup/import are not available yet.
- Project prompts, chats, task checkpoints and meeting histories can contain private content in local plain-text storage. API keys use operating-system encryption. See [privacy](PRIVACY.md) for retention and erasure.
- AI work still needs coordination and human review. Separate work areas and file claims reduce collisions; they do not make complex multi-agent projects automatically correct.

## Graphics and controls

- The office supports up to 50 employees. Four authored body/face and outfit variants, appearance controls and distance detail are available; some characters will still share a base model.
- Character motion is procedural. Authored animation clips, facial/lip animation and voice conversations remain future work. Office sound effects are included.
- Performance varies with GPU, screen resolution, team size, shadows and lighting. Adaptive quality and distance detail reduce load; there is no verified minimum hardware specification or guaranteed FPS yet.
- Keyboard/mouse controls and pointer lock are the primary desktop input. Full controller support and remappable shortcuts are not implemented.

## Distribution and updates

- Windows is the tested development platform. macOS/Linux targets remain unverified and are not advertised as supported packages.
- No signing credentials have been supplied. An unsigned Windows installer may trigger SmartScreen; do not bypass a warning for an untrusted or altered download. Compare the published SHA-256 checksum.
- Installed Windows builds check GitHub Releases at startup and every six hours and download newer versions in the background. Restart installation requires confirmation and no active tasks, conversations or commands. Save unsaved text and settings first. Source builds do not auto-update. Automatic rollback is not implemented; keep data backups. The first installer is unsigned; GitHub HTTPS and update checksums do not substitute for publisher signing.
- Source checks cannot substitute for clean-machine installation, native key-storage, extended-use and representative hardware testing. See [release readiness](RELEASE-READINESS.md) for actual verification status.

Report reproducible bugs through the repository issue template. Never include API keys, private projects or unredacted diagnostic text in public reports.
