# Persistent multi-conversation runtime contract

This file is mandatory recovery context for every role conversation in the web-design-upgrade team. It exists so context compaction, a new conversation, or a long-running project cannot silently collapse the team back into one general-purpose Agent.

## RECOVERY_CAPSULE_V1

Every assignment message must state:

- `TOOLKIT_MODE=member` or `TOOLKIT_MODE=controller`
- `PROJECT_ID=<explicit project id>`
- `ROLE=<stable role id>`
- `ASSIGNED_TASK=<task id or NONE>`
- `FIXED_INPUTS=<commit/artifact revisions when applicable>`

On every fresh turn, compaction, handoff, or uncertainty, the role must:

1. Read `AGENTS.md`, `team/team.yaml`, this file, its role file, and relevant policy/workflow files.
2. Require the explicit `PROJECT_ID`; never scan projects to find work.
3. Read the project charter, state, project-control lease, conversation registry, assigned task, matching task lease, dependencies, approvals, decisions, sources, and artifact index.
4. Run `npm run validate:team` and `npm run validate:project -- --project "$PROJECT_ID"`.
5. When Codex task tools exist, verify the live role conversation before trusting a stored conversation ID or stale thread summary.
6. Report recovered state, conflicts, blockers, and allowed actions before writing.
7. Execute only `ASSIGNED_TASK` when its assignee, role, dependency revisions, allowed paths, and active lease all match. `ASSIGNED_TASK=NONE` means remain idle and do not create work.

## Authority hierarchy

When information conflicts, use this order:

1. Current Git-tracked project records and frozen artifact revisions.
2. Active task and matching lease.
3. Bound human approvals and decisions.
4. Verified live conversation identity.
5. Conversation history and summaries.

Conversation text can explain work but cannot grant approval, production rights, a write lease, or permission beyond the repository record. The active project controller alone changes charter, global stage, approval state, and cross-role assignments.

## Multi-role operating rules

- Stable roles stay in separate persistent conversations; the controller routes work and consolidates results for the human in the controller conversation.
- Every cross-role professional assignment must be routed to the matching persistent role conversation in the active project's conversation registry. A controller-local temporary subagent must never substitute for that persistent role.
- The controller may use temporary subagents only for work inside the `product-delivery-lead` responsibility boundary. Each persistent specialist conversation may use temporary subagents only to decompose or parallelize work inside its own assigned role boundary; the persistent role remains the accountable Owner and returns the formal result.
- Before a persistent role uses a temporary subagent, its repository task and lease must already authorize that role conversation. Temporary subagent output has no independent task authority and cannot bypass maker, downstream review, or independent QA gates.
- The human does not need to monitor role conversations. Role conversations return decisions, blockers, evidence, and review verdicts to the controller.
- `auto_claim_ready_tasks` remains false. A role never starts an unfinished task merely because it exists, because another conversation may already be executing it.
- Parallel work is allowed only for genuinely independent tasks with separate explicit assignments and leases. A downstream dependency cannot run before the accepted upstream revision exists.
- Creative roles may create multiple options inside their assigned stage; this is not permission for downstream roles to begin early.
- A downstream rejection must preserve specialist ownership and include the upstream artifact/section, evidence or decision needed, modification direction, new acceptance criteria, blocking reason, and global downstream impact. It must not rewrite the upstream artifact.
- The project controller may issue global coordination direction but does not take over specialist craft ownership.
- Makers self-check before freezing. Downstream acceptance and independent QA remain separate. Production release always requires named-human approval and a rollback reference.

## Human-approval policy

- Permission level `C` is the default during project setup, unfamiliar domains, early strategy, and major new project stages.
- After a workflow is stable, repeated, and low-risk, the named human may explicitly move a project or task toward level `A` autonomy.
- No role may infer that repeated approvals have automatically lowered the permission level.
- The controller surfaces one mature decision package at a time in the controller conversation; specialist conversations do not require the human to follow multiple windows.

## Global non-negotiable gates

Every release path must preserve build, functionality, conversion path, mobile, accessibility, performance, security, and rollback. Advanced motion additionally requires L0–L4 fallbacks, accessible essential content, non-trapped scrolling, contact access without 3D, and file-bound production rights.

## Compaction fail-safe

If a role cannot state the explicit project, role, assigned task, fixed inputs, active lease, allowed paths, and current dependency state, it is not recovered. It must stop, reread the records above, and report the gap instead of continuing from memory.
