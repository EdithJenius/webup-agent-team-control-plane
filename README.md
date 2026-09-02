# Webup Agent Team Control Plane

Webup is a Git-backed control plane for multi-agent website delivery. It turns
task dependencies, write leases, independent review, human approvals, asset
rights, release gates, and recovery state into versioned, machine-verifiable
records.

The project is intentionally a thin control plane. Markdown explains roles and
decisions, YAML stores team and project state, JSON Schema defines contracts,
and read-only Node.js commands validate or summarize that state. Webup does not
silently claim work, approve releases, or deploy production systems.

## Why Webup

Long-running agent work becomes difficult when several conversations or tools
can edit the same project. Ordinary task lists do not answer questions such as:

- Which instance currently owns a write?
- Was an artifact reviewed by someone other than its maker?
- Does an approval still refer to the current revision?
- Are production assets licensed for their intended use?
- Can a release be rolled back, and did a named human approve it?

Webup encodes those questions as invariants that can fail closed in CI.

## Included

- Seven role contracts with explicit ownership and escalation boundaries
- Nine reusable capabilities with auditable inputs, outputs, and fallbacks
- Dependency-aware task and project-control leases
- Revision-bound approvals and independent maker/checker review
- Source and asset-rights records
- Eight production release gates, including security and rollback
- A reusable project template and read-only recovery commands
- JSON Schemas, validators, operational documentation, and 57 automated tests

## Quick Start

Requirements: Node.js 22 or newer.

```bash
git clone https://github.com/EdithJenius/webup-agent-team-control-plane.git
cd webup-agent-team-control-plane
npm ci
npm test
npm run validate:team
```

Create a project from the safe template, then give every command an explicit
project ID:

```bash
cp -R projects/_template projects/example
npm run validate:project -- --project example
npm run status -- --project example --instance main-control
```

The status command is read-only. It reports recoverable state and conflicts but
does not create leases, approvals, assignments, or releases. See the
[operations guide](docs/operations/team-control-plane.md) for the complete
recovery workflow.

## Repository Map

| Path | Purpose |
| --- | --- |
| `team/` | Roles, capabilities, policies, workflows, and runtime contract |
| `schemas/` | Machine-readable project, task, lease, approval, and source contracts |
| `scripts/` | Team validation, project validation, and read-only status commands |
| `projects/_template/` | Empty project structure with safe initial state |
| `tests/` | Positive, negative, and security regression coverage |
| `knowledge/` | Empty namespaced structure for approved reusable knowledge |

## Safety Model

- A ready task is never automatically claimed.
- One project has at most one active project-control lease.
- One task has at most one active write lease.
- Makers cannot independently approve their own artifacts.
- Production release requires current evidence, a named human approval, and a
  rollback reference.
- Public availability does not grant production asset rights.
- Repository state may contain external `secret_ref` identifiers, never raw
  credentials.

Real client projects, credentials, browser state, media, and private project
records are not part of this public repository.

## Project Status

Webup is an early-stage open-source project under active development. The core
contracts and validators are usable today; interfaces may evolve before 1.0.
Issues that include small reproducible project records are especially useful.

## Contributing and Security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Please
report vulnerabilities through GitHub private vulnerability reporting as
described in [SECURITY.md](SECURITY.md).

## 中文简介

Webup 是一个面向多 Agent 网页交付的 Git 控制平面。它把任务依赖、写入租约、
独立复核、人工审批、素材权利、发布门禁和恢复状态保存为可校验的仓库记录，避免
多个 Agent 自动抢占工作、互相覆盖或自行批准上线。验证器和状态命令只读，不会
自动认领任务、创建审批或触发发布。

## License

Licensed under the [Apache License 2.0](LICENSE).
