# Shared group conversations

Implemented in source October 2, 2026 after the user returned and asked to start. No installer was rebuilt or packaged.

## Requested experience

- During a meeting, the founder can send a message that every participating employee can read.
- Participants can discuss it together, suggest ideas, and respond to one another in one shared conversation.
- The same experience works for smaller groups, including calling two employees into the CEO office and talking to both at once.

## Implemented behavior

1. C/M calls a meeting and reopens its shared discussion, in any existing meeting room or the CEO office.
2. Post to everyone stores a founder message with no AI calls. Select participants for one reply each, sequentially. Each reads the bounded shared history, including earlier replies in the round, their role playbook and project context.
3. Stop cancels the active request and remaining speakers. Missing keys/provider errors appear under the relevant speaker and do not block the next selected reply.
4. Conversations save locally in `group-conversations.json`, scoped to the selected project, with atomic writes and backup recovery. Interrupted rounds keep completed messages and recover idle; they never replay paid calls automatically. The saved selector filters by room and participant set. Ended conversations are read only.
5. Only a founder-confirmed shared decision is promoted to verified project memory for all participants. Ideas remain conversation history. Existing meeting notes and action items still reach the room whiteboard when ended.
6. Replies reuse existing providers, lightweight-model routing, usage accounting, concurrency control and token limits. Discussion does not invoke Deskly task tools; installed CLI connectors retain their existing restricted response configuration.
7. Browser preview uses clearly labeled simulated replies and local storage. Real AI requires the desktop provider setup.

## Verification

- All 86 automated tests pass; lint passes.
- New regression tests cover shared reply context, selected-only calls, zero-call posting, validation, concurrent-round rejection, cancellation, provider errors, confirmed memory, project boundaries and restart recovery.
- `DESKLY_GROUP_CHECK=1 node tools/visual-smoke.cjs` uses an isolated desktop profile: 15 participants, three selected replies, decisions saved for all 15, a two-person CEO discussion, missing-key recovery, reopening history and closing the panel. No renderer errors.
- Paid provider discussion quality has not been measured by this check; no live API calls are needed for it.

## Limits

History stores up to 500 messages per conversation and 200 conversations. Replies use the latest 16 relevant messages, capped to 16,000 characters, plus the latest founder message and existing project context. There is no automatic background debate, voice conversation or automatic task execution.

Do not rebuild or package the app without asking the user first.
