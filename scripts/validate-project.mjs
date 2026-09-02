import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateActiveLeases, validateApprovalBindings, validateIndependentChecker, validateProjectControlLease, validateProjectIdentity, validateReleaseReadiness, validateRights, validateSecretShape, validateTaskAssignments, validateTaskGraph } from "./lib/invariants.mjs";
import { loadProject } from "./lib/project-model.mjs";
import { loadSchemaRegistry, validateAgainst } from "./lib/schemas.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const valueOptions = new Set(["--project", "--projects-dir", "--now"]);
const sortIssues = (issues) => issues.sort((left, right) => left.code.localeCompare(right.code) || left.location.localeCompare(right.location));

export function parseProjectArgs(args, extraValueOptions = []) {
  const allowed = new Set([...valueOptions, ...extraValueOptions]);
  const options = { projectsDir: "projects", now: new Date() };
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!allowed.has(name)) throw new Error(`unknown option: ${name}`);
    if (value === undefined || value.startsWith("--")) throw new Error(`${name} requires a value`);
    if (name === "--project") options.projectId = value;
    else if (name === "--projects-dir") options.projectsDir = value;
    else if (name === "--now") {
      options.now = new Date(value);
      if (Number.isNaN(options.now.valueOf())) throw new Error("--now must be an ISO-8601 timestamp");
    } else options[name.slice(2).replaceAll("-", "_")] = value;
  }
  if (!options.projectId) throw new Error("--project is required");
  return options;
}

export async function validateProject(repositoryRoot, projectId, projectsDir = "projects", now = new Date()) {
  const model = await loadProject(repositoryRoot, projectId, projectsDir);
  const ajv = await loadSchemaRegistry(repositoryRoot);
  const issues = [
    ...validateAgainst(ajv, "https://webup.local/schemas/project-charter", model.charter, "charter.yaml"),
    ...validateAgainst(ajv, "https://webup.local/schemas/project-state", model.state, "state.yaml"),
    ...validateAgainst(ajv, "https://webup.local/schemas/source-register", model.sources, "sources/register.yaml"),
    ...validateAgainst(ajv, "https://webup.local/schemas/artifact-index", model.artifacts, "artifacts/index.yaml"),
    ...model.tasks.flatMap((record) => validateAgainst(ajv, "https://webup.local/schemas/task", record, `tasks/${record.id ?? "unknown"}`)),
    ...model.approvals.flatMap((record) => validateAgainst(ajv, "https://webup.local/schemas/approval", record, `approvals/${record.id ?? "unknown"}`)),
    ...model.leases.flatMap((record) => validateAgainst(ajv, "https://webup.local/schemas/lease", record, `leases/${record.id ?? "unknown"}`)),
    ...model.changeRequests.flatMap((record) => validateAgainst(ajv, "https://webup.local/schemas/change-request", record, `change-requests/${record.id ?? "unknown"}`)),
    ...validateTaskGraph(model.tasks),
    ...validateProjectIdentity(model),
    ...validateActiveLeases(model.leases, now),
    ...validateProjectControlLease(model, now),
    ...validateTaskAssignments(model.tasks, model.leases, now),
    ...validateIndependentChecker(model.tasks),
    ...validateApprovalBindings(model),
    ...validateSecretShape(model, "project"),
    ...validateRights(model, now),
    ...validateReleaseReadiness(model, now),
  ];
  return { model, issues: sortIssues(issues) };
}

async function main() {
  let options;
  try {
    options = parseProjectArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
    return;
  }
  try {
    const { issues } = await validateProject(rootDir, options.projectId, options.projectsDir, options.now);
    process.stdout.write(`${JSON.stringify({ ok: issues.length === 0, issues })}\n`);
    process.exitCode = issues.length === 0 ? 0 : 1;
  } catch (error) {
    const issues = [{ code: "PROJECT_FILE_INVALID", location: options.projectId, message: error.message }];
    process.stdout.write(`${JSON.stringify({ ok: false, issues })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
