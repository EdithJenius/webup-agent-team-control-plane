import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { listFiles, readRole, readYaml } from "./lib/files.mjs";

const issue = (code, location, message) => ({ code, location, message });
const sortIssues = (issues) => issues.sort((left, right) => left.code.localeCompare(right.code) || left.location.localeCompare(right.location));

async function readTeamYaml(file, rootDir, issues) {
  const location = path.relative(rootDir, file);
  try {
    return await readYaml(file);
  } catch (error) {
    issues.push(issue("TEAM_FILE_INVALID", location, error.message));
    return null;
  }
}

export async function validateTeam(rootDir) {
  const issues = [];
  const team = await readTeamYaml(path.join(rootDir, "team/team.yaml"), rootDir, issues);
  const capabilities = await readTeamYaml(path.join(rootDir, "team/capabilities.yaml"), rootDir, issues);
  const workflowFiles = await listFiles(path.join(rootDir, "team/workflows"), ".yaml");
  const policyFiles = await listFiles(path.join(rootDir, "team/policies"), ".yaml");
  const documents = await Promise.all([...workflowFiles, ...policyFiles].map((file) => readTeamYaml(file, rootDir, issues)));
  if (!team || !capabilities || documents.some((document) => !document)) return sortIssues(issues);

  const roles = new Map((team.roles ?? []).map((role) => [role.id, role]));
  for (const role of roles.values()) {
    const specPath = path.resolve(rootDir, role.spec ?? "");
    let spec;
    try {
      spec = await readRole(specPath);
    } catch (error) {
      issues.push(issue(error.code === "ENOENT" ? "ROLE_SPEC_MISSING" : "TEAM_FILE_INVALID", role.spec ?? role.id, error.message));
      continue;
    }
    if (spec.frontmatter.id !== role.id) {
      issues.push(issue("ROLE_ID_MISMATCH", role.spec, `${spec.frontmatter.id ?? "missing"} != ${role.id}`));
    }
  }

  for (const capability of capabilities.capabilities ?? []) {
    for (const roleId of capability.allowed_roles ?? []) {
      if (!roles.has(roleId)) issues.push(issue("CAPABILITY_ROLE_UNKNOWN", `team/capabilities.yaml:${capability.id}`, roleId));
    }
  }

  const lifecycle = documents.find((document) => document?.kind === "delivery-lifecycle");
  const stages = lifecycle?.stages ?? [];
  const stageIds = new Set(stages.map((stage) => stage.id));
  if (stageIds.size !== stages.length || !Array.from({ length: 10 }, (_, index) => `P${index}`).every((id) => stageIds.has(id))) {
    issues.push(issue("TEAM_FILE_INVALID", "team/workflows/delivery-lifecycle.yaml:stages", "stages must contain unique P0-P9 ids"));
  }
  for (const stage of stages) {
    for (const dependency of [...(stage.depends_on ?? []), ...(stage.optional_dependency ? [stage.optional_dependency] : [])]) {
      if (!stageIds.has(dependency)) issues.push(issue("STAGE_DEPENDENCY_UNKNOWN", `team/workflows/delivery-lifecycle.yaml:${stage.id}`, dependency));
    }
  }

  const taskLifecycle = documents.find((document) => document?.kind === "task-lifecycle");
  const taskStates = new Set(taskLifecycle?.states ?? []);
  for (const [index, transition] of (taskLifecycle?.transitions ?? []).entries()) {
    for (const state of [transition.from, transition.to]) {
      if (!taskStates.has(state)) issues.push(issue("TASK_STATE_UNKNOWN", `team/workflows/task-lifecycle.yaml:transitions[${index}]`, state));
    }
  }
  return sortIssues(issues);
}

async function main() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const issues = await validateTeam(rootDir);
  process.stdout.write(`${JSON.stringify({ ok: issues.length === 0, issues })}\n`);
  process.exitCode = issues.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stdout.write(`${JSON.stringify({ ok: false, issues: [issue("TEAM_FILE_INVALID", "team", error.message)] })}\n`);
    process.exitCode = 1;
  });
}
