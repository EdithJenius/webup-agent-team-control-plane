import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listFiles, readJson, readRole, readYaml } from "../scripts/lib/files.mjs";

test("reads YAML, JSON, role frontmatter, and sorted file lists", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "webup-files-"));
  await mkdir(path.join(root, "nested"));
  await writeFile(path.join(root, "state.yaml"), "status: READY\nrevision: 2\n");
  await writeFile(path.join(root, "record.json"), '{"kind":"task"}\n');
  await writeFile(path.join(root, "role.md"), "---\nid: role-a\nkind: role\n---\n# Role A\n");
  await writeFile(path.join(root, "nested", "z.yaml"), "id: z\n");

  assert.deepEqual(await readYaml(path.join(root, "state.yaml")), { status: "READY", revision: 2 });
  assert.deepEqual(await readJson(path.join(root, "record.json")), { kind: "task" });
  assert.deepEqual(await readRole(path.join(root, "role.md")), {
    frontmatter: { id: "role-a", kind: "role" },
    body: "# Role A\n",
  });
  assert.deepEqual(await listFiles(root, ".yaml"), [
    path.join(root, "nested", "z.yaml"),
    path.join(root, "state.yaml"),
  ]);
});
