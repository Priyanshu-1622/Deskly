# Deskly 0.1.0 — first Windows version

First early-access Windows release. Windows 10/11, 64-bit. This installer is unsigned; Windows may display an unknown-publisher warning. macOS and Linux downloads are not provided.

## Included

- First-person office, outdoor grounds, regional time and day/night lighting, guide, room atlas, whiteboards and office sounds.
- Editable employee roles, work instructions, résumés and appearance; four character/body and outfit variants.
- Hosted/local AI connectors and separately installed Codex/Claude Code sign-ins.
- Project work areas, reviewed file writes/commands, task cancellation/resume, verified memory and team handoffs.
- Shared meeting conversations with selected replies, persistent history, deletion and confirmed decisions. Member selection uses the meeting page's scroll.
- Frame-error recovery, guarded startup, low-quality crash recovery, safer text editing and bounded chats.
- Improved character/texture size, distance detail for people and trees, disposed preview/audio resources and smaller runtime notifications.
- Themed brass/dark scrollbars, stable Team cards during live updates, reduced background rendering behind panels and GPU resource preparation during loading.
- Moving main-menu office renders every animation frame, with adaptive resolution enabled; static panels retain reduced background rendering.
- Automatic Windows update checks and background downloads from GitHub Releases, a Settings → Updates page, and confirmed restart installation blocked during active work.

## Verification before packaging

111 source regression tests and lint passed; dependency audit reported zero known vulnerabilities. Source and packaged guided demo-task checks passed with zero renderer errors. Packaged assets, development-file exclusion, Electron fuses, fixed GitHub update configuration and installer manifest checksum were verified. See [release readiness](RELEASE-READINESS.md). Clean-machine install/update/uninstall, a real future-version upgrade, publisher signing, extended hardware testing and real AI quality/cost evaluation remain unverified.

## Installation and updating

Download Deskly-Setup-0.1.0-x64.exe and SHA256SUMS.txt from this release. The packaged app does not require Node.js. Local/CLI AI options may require separately installed tools. New releases download automatically; choose Restart to update after saving unsaved editor text and settings and finishing active work. Keep backups of important projects and app data. Update rollback is not implemented.

For support, contact desklymanager1@gmail.com or open a GitHub issue without including keys or private project data.

See [current limitations](LIMITATIONS.md), [user guide](USER-GUIDE.md) and [privacy](PRIVACY.md). This version does not claim validated AI cost savings, guaranteed FPS, signing certification or macOS/Linux support.
