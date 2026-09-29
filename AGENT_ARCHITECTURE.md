# Agent instructions, memory, coordination and cost

## Current behavior

- Every role has a distinct default work playbook in `src/renderer/js/role-prompts.js`. The founder can replace it per employee under **Team & AI keys → Work instructions**. Existing saved teams use the role default until edited. The playbook is used for tasks, face-to-face replies and meeting ideas.
- Each employee has local memory. Completed real tasks add a short project note. An active employee can save a project note, or request approval for a global note that follows them across projects. The founder can add and remove either kind under **Memory & usage**. Memory is indexed by the selected project folder and employee; only a small relevant set is included in a model request.
- Active employees can claim files and post structured project updates with files, interface contracts and dependencies. Other active employees see new updates on their next model turn. Idle employees see updates only when later assigned work or asked a question. The runtime refuses a write to a file claimed by another active task.
- Office walking, sitting and ordinary idle behavior are renderer animations. They make no provider calls. Assigning a task, asking an employee a question, running a brainstorm or using the assistant can make provider calls.
- Provider-reported input, output and cached token counts are saved locally by month, project, employee, provider and model. **Memory & usage** displays the current month's totals. A configurable monthly token ceiling blocks new paid calls after reported usage reaches it; requests already in flight can cross the ceiling.
- An optional lightweight model per employee handles planning, short conversation and meeting ideas. Execution stays on the main model. A failed lightweight request falls back to the main model; an invalid lightweight plan is retried with the main model.

## Cost target

The 60–70% reduction is a target, not a measured result. It must be compared with the same tasks, quality criteria and model prices before and after optimization. The biggest current controls are zero idle calls, selective memory retrieval, optional model routing, bounded outputs, a per-task turn limit and provider usage metering. Stable prompt prefixes and append-only task messages can help provider prompt caches, but actual cache savings depend on the provider, model and request pattern. See [OpenAI prompt caching guidance](https://developers.openai.com/api/docs/guides/prompt-caching) and [Claude cost guidance](https://platform.claude.com/docs/en/about-claude/pricing).

The meter currently reports tokens, not dollars. A dollar estimate needs current prices for each configured provider and model, including cache rates. Generic and local endpoints may report usage differently or not at all. A monthly token ceiling is a guardrail, not a guaranteed billing cap.

## Remaining work before calling this mature

- Run realistic quality evaluations for each role and model choice. Tests confirm wiring and boundaries; they do not prove the prompts produce excellent work.
- Add a human-readable dependency board: task owners, interface contracts, blockers and review status together. Current updates and file claims provide the underlying data but not a full dependency graph.
- Add better memory editing, conflict resolution, expiry and import/export. Project memory currently follows a folder path identity; moving a project folder needs a migration path.
- Add provider-specific price catalogs or user-supplied rates, per-project spend budgets, live cost projections and alerts. Compare output quality and actual billed costs on the same benchmark tasks before claiming a savings percentage.
- Verify providers live and build the previously selected installed-Codex-login backend through a supported integration route.
