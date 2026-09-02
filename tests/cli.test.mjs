import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (script, args = []) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8" });

test("team validator succeeds and emits JSON", () => {
  const result = run("scripts/validate-team.mjs");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(result.stdout), { ok: true, issues: [] });
});

test("project validator requires an explicit project id", () => {
  const result = run("scripts/validate-project.mjs");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--project is required/);
});

test("validator does not mutate a valid fixture", async () => {
  const file = path.join(root, "tests/fixtures/projects/url-only-valid/state.yaml");
  const before = await readFile(file, "utf8");
  const result = run("scripts/validate-project.mjs", ["--project", "url-only-valid", "--projects-dir", "tests/fixtures/projects"]);
  const after = await readFile(file, "utf8");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(after, before);
});

test("status reports URL-only recovery without claiming work", () => {
  const result = run("scripts/project-status.mjs", ["--project", "url-only-valid", "--projects-dir", "tests/fixtures/projects", "--instance", "main-control"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const status = JSON.parse(result.stdout);
  assert.equal(status.project_id, "url-only-valid");
  assert.equal(status.current_stage, "P1");
  assert.equal(status.auto_claimed, false);
  assert.equal(status.source_summary.total, 1);
  assert.equal(status.source_summary.production_approved, 0);
  assert(status.warnings.includes("client-ownership-confirmation"));
});

test("project validation rejects two active write leases", () => {
  const result = run("scripts/validate-project.mjs", [
    "--project", "lease-conflict", "--projects-dir", "tests/fixtures/projects", "--now", "2026-08-19T00:00:00+08:00",
  ]);
  assert.equal(result.status, 1);
  assert.deepEqual(new Set(JSON.parse(result.stdout).issues.map((issue) => issue.code)), new Set(["MULTIPLE_ACTIVE_TASK_LEASES"]));
});

test("project validation rejects release without human approval and rollback", () => {
  const result = run("scripts/validate-project.mjs", [
    "--project", "release-without-human", "--projects-dir", "tests/fixtures/projects", "--now", "2026-08-19T00:00:00+08:00",
  ]);
  assert.equal(result.status, 1);
  const codes = new Set(JSON.parse(result.stdout).issues.map((issue) => issue.code));
  assert.deepEqual(codes, new Set(["MISSING_HUMAN_RELEASE_APPROVAL", "MISSING_ROLLBACK_REFERENCE"]));
});
