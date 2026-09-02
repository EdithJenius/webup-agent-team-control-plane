import { access } from "node:fs/promises";
import path from "node:path";
import { listFiles, readYaml } from "./files.mjs";

async function optionalYaml(filePath, fallback) {
  try { await access(filePath); return await readYaml(filePath); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

async function records(directory) {
  try { return await Promise.all((await listFiles(directory, ".yaml")).map(readYaml)); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}

export async function loadProject(rootDir, projectId, projectsDir = "projects") {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(projectId)) throw new Error(`Invalid project id: ${projectId}`);
  const baseDir = path.resolve(rootDir, projectsDir, projectId);
  return {
    projectId,
    baseDir,
    charter: await readYaml(path.join(baseDir, "charter.yaml")),
    state: await readYaml(path.join(baseDir, "state.yaml")),
    sources: await readYaml(path.join(baseDir, "sources/register.yaml")),
    artifacts: await readYaml(path.join(baseDir, "artifacts/index.yaml")),
    tasks: await records(path.join(baseDir, "tasks")),
    approvals: await records(path.join(baseDir, "approvals")),
    leases: await records(path.join(baseDir, "leases")),
    changeRequests: await records(path.join(baseDir, "change-requests")),
    decisions: await optionalYaml(path.join(baseDir, "decisions/index.yaml"), { decisions: [] }),
  };
}
