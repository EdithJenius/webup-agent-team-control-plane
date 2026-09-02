# Agent Team Entry Contract

## Recovery order

1. Read `team/team.yaml`, `team/CONVERSATION-RUNTIME.md`, the assigned role file, and relevant workflow/policy files.
2. Require an explicit `project-id`; never scan projects and start unfinished work.
3. Read `projects/$PROJECT_ID/charter.yaml`, `state.yaml`, project-control lease, assigned task, approvals, decisions, sources, and artifact index.
4. Run `npm run validate:team` and `npm run validate:project -- --project "$PROJECT_ID"`.
5. When Codex task tools are available, verify live role tasks instead of trusting stale thread references.
6. Report recovery state, conflicts, blockers, and allowed next actions before writing.
7. Execute only a task explicitly assigned to this instance with a valid lease.

## Conversation continuity

- Every persistent role conversation must receive the current project's recovery capsule before an assignment.
- A conversation ID is routing metadata, never task authority. Authority comes only from the current task file and matching lease.
- After context compaction or recovery uncertainty, stop task execution and rebuild state from the repository before continuing.
- Human approvals and cross-role discussion are surfaced through the active project-controller conversation unless the named human explicitly chooses another conversation.

## Authority boundaries

- Only the active project controller may change the charter, global project stage, or approval state.
- A downstream role may reject an input with structured evidence and modification direction; it may not rewrite the upstream specialist's artifact.
- Production release always requires named human approval and a rollback reference.
- Validators and status commands are read-only and never create assignments, leases, approvals, projects, or releases.
- Raw secrets never enter this repository; store only approved external `secret_ref` values.
