import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validateCommand = "npm run validate:project -- --project url-only-valid --projects-dir tests/fixtures/projects";
const statusCommand = "npm run status -- --project url-only-valid --projects-dir tests/fixtures/projects --instance main-control";

function cleanEnvironment() {
  const env = { ...process.env };
  delete env.PROJECT_ID;
  delete env.INSTANCE_ID;
  return env;
}

function runNpm(args) {
  return spawnSync("npm", args, {
    cwd: root,
    encoding: "utf8",
    env: cleanEnvironment(),
  });
}

test("operations guide uses copyable literal recovery commands", async () => {
  const guide = await readFile(path.join(root, "docs/operations/team-control-plane.md"), "utf8");

  assert(guide.includes(validateCommand));
  assert(guide.includes(statusCommand));
  assert.doesNotMatch(guide, /PROJECT_ID=url-only-valid[^\n]*\$PROJECT_ID/);
  assert.doesNotMatch(guide, /INSTANCE_ID=main-control[^\n]*\$INSTANCE_ID/);
});

test("documented fixture recovery commands run without temporary identifier variables", () => {
  const validation = runNpm([
    "run", "validate:project", "--", "--project", "url-only-valid", "--projects-dir", "tests/fixtures/projects",
  ]);
  assert.equal(validation.status, 0, validation.stderr || validation.stdout);
  assert.equal(JSON.parse(validation.stdout.slice(validation.stdout.indexOf("{"))).ok, true);

  const status = runNpm([
    "run", "status", "--", "--project", "url-only-valid", "--projects-dir", "tests/fixtures/projects", "--instance", "main-control",
  ]);
  assert.equal(status.status, 0, status.stderr || status.stdout);
  const report = JSON.parse(status.stdout.slice(status.stdout.indexOf("{")));
  assert.equal(report.project_id, "url-only-valid");
  assert.equal(report.auto_claimed, false);
});
