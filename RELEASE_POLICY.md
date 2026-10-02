# Release and update policy

Deskly is a pre-release desktop app. An unpacked build is a test artifact, not a signed production installer.

## Candidate gates

Run `npm ci`, `npm run check`, the full `npm audit`, `npm run smoke`, and package the app after approval. Automatic CI checks tests, lint and Windows desktop rendering. Packaging and package uploads run only when a workflow is manually dispatched; the release-candidate workflow also covers macOS and Linux. A successful build alone does not verify install/uninstall or platform keychain behavior.

Before a public release, verify native folder dialogs, encrypted-key save/restart/delete, full screen and pointer lock, task approvals and cancellation, recovery after a forced renderer crash, active-task quit/resume, map/boards and the single-floor office. Test the installer on a clean machine for each advertised platform.

Windows signing uses `CSC_LINK` and `CSC_KEY_PASSWORD`. macOS signing and notarization also require `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`. Store these in repository Actions secrets; never commit certificates or keys. Confirm the resulting signature and notarization before publishing. No signing credentials have been supplied in this workspace.

## Updates

Installed Windows builds check this repository's public GitHub Releases at startup and every six hours using electron-updater. New versions download automatically; installation requires an explicit restart confirmation and no active tasks, conversations or commands. Save unsaved editor text and settings first. The main process fixes the provider; renderer IPC cannot supply an update URL or file. Downgrades and install-on-quit are disabled. Publish the versioned NSIS installer, its blockmap, latest.yml, SHA-256 checksums and release notes together. Each release needs a greater version than the previous release. Keep the GitHub release non-prerelease so the stable updater can discover it; clearly label 0.x versions as early access in the release title and notes.

Manual downloads remain available from GitHub Releases. The first Windows installer is unsigned: HTTPS and manifest checksums protect transfer integrity but do not establish a signed publisher. Preserve signature verification defaults; add publisher signing when credentials are available. Automatic rollback and clean-machine update migration testing remain release gates. Back up local app data and projects before incompatible migrations.

Weekly Dependabot and full audit checks track dependencies. For a confirmed vulnerability, prepare a tested patch release promptly and explain the affected versions. Never advertise a clean dependency audit as proof that all application code is secure.

## Live AI and cost evaluation

`npm run providers:live` is opt-in through `DESKLY_LIVE_PROVIDERS`; each HTTP check makes a small real call. CLI checks inspect installed sign-in without buying a model response. `npm run benchmark:agents` runs matching tasks with the main and lightweight models, records provider-reported tokens and latency, and saves replies for quality review. It requires explicit provider configuration and can incur charges. Compare billed cost, cached-token pricing and quality on representative multi-turn projects before making a savings claim. A 60–70% reduction remains an unverified target.

## Local data

Task checkpoints can contain file text and command output. They are stored locally in plain text, retained for up to three days after interruption/failure, and removed when finished history is cleared. Keys use OS-backed encryption and are never included in audit records. Erase all Deskly data clears the app's own profile after confirmation; project files are separate. No crash uploads or analytics are enabled.
