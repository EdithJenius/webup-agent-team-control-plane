import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readYaml } from "../scripts/lib/files.mjs";
import { loadSchemaRegistry, validateAgainst } from "../scripts/lib/schemas.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("URL-only fixture preserves unknowns and does not grant image production rights", async () => {
  const base = path.join(root, "tests/fixtures/projects/url-only-valid");
  const ajv = await loadSchemaRegistry(root);
  const charter = await readYaml(path.join(base, "charter.yaml"));
  const sources = await readYaml(path.join(base, "sources/register.yaml"));
  assert.deepEqual(validateAgainst(ajv, "https://webup.local/schemas/project-charter", charter, "charter.yaml"), []);
  assert.deepEqual(validateAgainst(ajv, "https://webup.local/schemas/source-register", sources, "sources/register.yaml"), []);
  assert.equal(charter.input_mode, "url_only");
  assert(charter.unknowns.includes("client-ownership-confirmation"));
  assert(sources.sources.every((source) => source.usage_status === "publicly_observed"));
});
