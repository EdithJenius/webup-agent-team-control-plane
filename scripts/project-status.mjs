import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findValidProjectControlLease, hasValidProductionReleaseApproval } from "./lib/invariants.mjs";
import { parseProjectArgs, validateProject } from "./validate-project.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const usageStatuses = ["publicly_observed", "client_claimed", "license_verified", "production_approved", "prohibited"];

function sourceSummary(sources) {
  return Object.fromEntries([
    ["total", sources.length],
    ...usageStatuses.map((status) => [status, sources.filter((source) => source.usage_status === status).length]),
  ]);
}

function pendingApprovals(model, now) {
  const approvedTypes = new Set(model.approvals
    .filter((approval) => approval.status === "active" && approval.decision === "approved"
      && typeof approval.decided_by === "string" && approval.decided_by.trim() !== ""
      && new Date(approval.expires_at) > now)
    .map((approval) => approval.approval_type));
  const required = new Set(model.tasks.flatMap((task) => task.required_approvals ?? []));
  if ((model.state.current_stage === "P8" || model.state.current_stage === "P9")
    && !hasValidProductionReleaseApproval(model, now)) required.add("production-release");
  return [...required]
    .filter((approvalType) => approvalType === "production-release"
      ? !hasValidProductionReleaseApproval(model, now) : !approvedTypes.has(approvalType))
    .sort();
}

export async function projectStatus(repositoryRoot, options) {
  const { model, issues } = await validateProject(repositoryRoot, options.projectId, options.projectsDir, options.now);
  const activeController = findValidProjectControlLease(model, options.now);
  const projectController = activeController ? {
    lease_ref: activeController.id,
    holder_role: activeController.holder_role,
    holder_instance: activeController.holder_instance,
    expires_at: activeController.expires_at,
  } : null;
  const assignedTasks = model.tasks.filter((task) => task.assignee === options.instance).map((task) => ({
    id: task.id,
    revision: task.revision,
    status: task.status,
    owner_role: task.owner_role,
    blockers: task.blockers ?? [],
  }));
  const blockers = [...new Set(model.tasks.flatMap((task) => task.blockers ?? []))].sort();
  const warnings = [...new Set([
    ...(model.charter.unknowns ?? []),
    ...issues.map((entry) => `${entry.code}:${entry.location}`),
    "live-task-verification-required",
  ])].sort();

  return {
    project_id: model.projectId,
    charter_revision: model.charter.revision,
    current_stage: model.state.current_stage,
    permission_level: model.state.permission_level,
    project_controller: projectController,
    assigned_tasks: assignedTasks,
    blockers,
    approvals: pendingApprovals(model, options.now),
    source_summary: sourceSummary(model.sources.sources ?? []),
    next_allowed_actions: [...(model.state.next_allowed_actions ?? [])],
    warnings,
    auto_claimed: false,
  };
}

async function main() {
  let options;
  try {
    options = parseProjectArgs(process.argv.slice(2), ["--instance"]);
    if (!options.instance) throw new Error("--instance is required");
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
    return;
  }
  try {
    process.stdout.write(`${JSON.stringify(await projectStatus(rootDir, options))}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
