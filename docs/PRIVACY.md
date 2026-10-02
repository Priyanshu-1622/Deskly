# Privacy and local data

Deskly has no analytics, automatic crash uploads or background AI conversations. Movement, office sounds, the map and whiteboard edits run locally.

## When information leaves your device

An assigned task, employee reply, selected meeting reply, assistant question or provider connection test can send context to the provider you configured. Context may include your prompt, role instructions, verified memories, recent teammate updates, bounded conversation history, and project file/tool results relevant to the work. Hosted providers apply their own policies. Installed CLI connectors use the corresponding local CLI and its signed-in account; the CLI can contact its service. Ollama and custom endpoints send requests to the endpoint you select. Demo mode does not call a model.

Only selected meeting speakers request replies. Posting a message alone makes no AI call. A connection check with a hosted API makes a small request and may incur a charge.

## What is stored

- Settings, tasks, usage, audit records, project memories and shared conversations save in Electron's local application data directory. These records can contain private text and are not encrypted as a whole.
- API keys use OS-backed encrypted storage when available. Deskly refuses to save them when secure storage is unavailable. Do not share the secrets file or your entire application profile.
- Whiteboards and imported images save locally in IndexedDB. Boards currently belong to office rooms on this device, rather than separate projects. Change or clear sensitive board content before switching projects or taking screenshots.
- Meeting transcripts and memories are scoped to the selected project. Verified global notes intentionally carry across projects.
- Project files remain in the folder you chose. Approved commands run with your account's permissions and may reach outside that folder.

## Export, recovery and deletion

**Settings → Privacy & data → Save diagnostic report** exports only system/app versions, selected settings and activity counts. It excludes names, keys, project paths, file contents, prompts, memories, conversations, provider endpoints and raw errors. You choose where it saves and whether to share it. Nothing uploads automatically.

Audit exports and board backups can contain private text. Review them before sharing. Approval audit records store action type and risk, without the command or file content; the live approval still shows the complete action for review. Task checkpoints retain model messages, which can include commands and project content. Do not put credentials in prompts or commands. Damaged local files are preserved for recovery; atomic writes retain a backup. Interrupted task checkpoints expire after three days. Clearing finished task history also removes its saved checkpoints. Saved meeting histories can be deleted individually or erased with all Deskly data.

**Erase all Deskly data** removes the app profile after confirmation and restarts with fresh settings. Your project files are kept. **Reset settings & keys** only clears those settings and keys; it does not erase all other records. Removing the app is not a reliable substitute for erasing its local data.

Report a suspected private-data exposure using the process in [SECURITY.md](../SECURITY.md). Avoid posting keys, raw task logs or confidential project content in public issues.

## Update checks

Installed Windows builds contact this repository’s public GitHub Releases at startup and every six hours and download newer installers. GitHub receives ordinary network request information, including IP address and app update requests. No API keys, project text or conversations are sent by the updater. Installation requires restart confirmation. Source builds do not make automatic update requests.
