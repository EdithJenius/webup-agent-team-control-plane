# Team Control Plane Operations

This guide restores and validates the reusable web-design team control plane. Run commands from the repository root and always select a project explicitly. Repository files remain the source of truth for project and control-plane state.

## Install and verify

```bash
npm ci
npm test
npm run validate:team
npm run validate:project -- --project url-only-valid --projects-dir tests/fixtures/projects
npm run status -- --project url-only-valid --projects-dir tests/fixtures/projects --instance main-control
```

`npm ci` installs the dependencies pinned by `package-lock.json` into the local workspace. It can create or replace `node_modules`, so it is not a filesystem-read-only command. It does not modify tracked project records.

`validate-team`, `validate-project`, and `status` are read-only with respect to repository project and control-plane state. They do not create leases, assign or claim tasks, approve work, advance stages, run `next_allowed_actions`, publish, or modify project files.

## Exit codes

- `0`: validation succeeded, or a readable status report was produced. A status report may still contain warnings requiring operator action.
- `1`: validation failed or the selected project could not be read. Inspect the JSON `issues` array or stderr.
- `2`: CLI misuse, including a missing required `--project` or `--instance`, an unknown option, or an invalid `--now` value.

Use an explicit `--now` timestamp when reproducing lease or approval decisions:

```bash
node scripts/validate-project.mjs --project url-only-valid --projects-dir tests/fixtures/projects --now 2026-08-19T00:00:00+08:00
node scripts/project-status.mjs --project url-only-valid --projects-dir tests/fixtures/projects --instance main-control --now 2026-08-19T00:00:00+08:00
```

## Recovery protocol

1. Read [`AGENTS.md`](../../AGENTS.md), [`team/team.yaml`](../../team/team.yaml), the selected role contract, workflows, and policies.
2. Select one explicit project ID. Never scan projects and automatically start unfinished work.
3. Run team validation, project validation, and status using that project ID and the current instance ID.
4. Review the charter revision, current stage, project-control lease, assigned tasks, blockers, pending approvals, source summary, warnings, and `next_allowed_actions`.
5. Check live Codex task status through the Codex platform. Repository records can describe expected or last-known task references, but cannot prove that a live task still exists, is running, or is waiting for input.
6. Report the recovered state before taking action. `READY` and `next_allowed_actions` never authorize automatic execution or claiming.
7. Only work on an explicitly assigned task with satisfied dependencies and the required valid lease.

The no-auto-claim rule is absolute: validation and status never assign work, and an operator must not infer authority from an unclaimed or merely ready task.

## Source and production-rights review

Inspect these records together:

- `projects/<project-id>/sources/register.yaml` for every source's `usage_status`, evidence state, limits, and retrieval metadata;
- `projects/<project-id>/artifacts/index.yaml` for `source_refs`, `approval_refs`, production-material applicability, revision, and artifact usage state;
- `projects/<project-id>/approvals/` for current, unexpired, revision-bound approvals.

`publicly_observed`, `client_claimed`, and `license_verified` do not equal `production_approved`. A production candidate containing production materials requires resolvable production-approved sources and a current named-human `asset-rights` approval. Unknown or prohibited rights must remain blocked or use an approved placeholder; public availability alone never grants production reuse.

## Negative safety fixtures

These fixtures must fail validation without being mutated:

```bash
node scripts/validate-project.mjs --project lease-conflict --projects-dir tests/fixtures/projects --now 2026-08-19T00:00:00+08:00
node scripts/validate-project.mjs --project release-without-human --projects-dir tests/fixtures/projects --now 2026-08-19T00:00:00+08:00
```

The first reports `MULTIPLE_ACTIVE_TASK_LEASES`. The second reports only `MISSING_HUMAN_RELEASE_APPROVAL` and `MISSING_ROLLBACK_REFERENCE`.

## Creating a real project

`projects/_template` and `tests/fixtures/projects` are templates and test data, not real client projects. Creating `projects/<real-project-id>/` is a separate, explicit later action requiring project authority and accepted inputs. It must not be inferred from recovery, validation, this guide, or the presence of a client URL.

For an authorized real project stored under the default `projects/` directory, omit `--projects-dir tests/fixtures/projects` and pass its explicit literal project ID to `--project`; status also requires an explicit instance ID.

## Implementation references

- [Team entry point](../../AGENTS.md)
- [Team manifest](../../team/team.yaml)
- [Team validator](../../scripts/validate-team.mjs)
- [Project validator](../../scripts/validate-project.mjs)
- [Project recovery status](../../scripts/project-status.mjs)
