import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadSchemaRegistry, validateAgainst } from "../scripts/lib/schemas.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("all schemas compile and reject a task without an explicit owner", async () => {
  const ajv = await loadSchemaRegistry(root);
  assert.equal(validateAgainst(ajv, "https://webup.local/schemas/task", {
    schema_version: 1, kind: "task", id: "TASK-1", project_id: "project-a", revision: 1,
  }, "task.yaml").some((issue) => issue.message.includes("owner_role")), true);
});

test("source register accepts URL-only evidence and explicit rights state", async () => {
  const ajv = await loadSchemaRegistry(root);
  const issues = validateAgainst(ajv, "https://webup.local/schemas/source-register", {
    schema_version: 1,
    kind: "source-register",
    id: "sources-project-a",
    project_id: "project-a",
    revision: 1,
    status: "active",
    owner_role: "product-delivery-lead",
    created_at: "2026-08-19T00:00:00+08:00",
    updated_at: "2026-08-19T00:00:00+08:00",
    created_by: "product-delivery-lead",
    updated_by: "product-delivery-lead",
    sources: [{
      source_id: "SRC-1", source_url: "https://example.com/", source_role: "unknown",
      provided_by: "client", retrieved_at: "2026-08-19T00:00:00+08:00",
      retrieval_method: "public-web", access_scope: "public", snapshot_refs: [], page_refs: [],
      asset_refs: [], content_hash: "sha256:example", usage_status: "publicly_observed",
      evidence_status: "observed_fact", known_limits: ["ownership-unconfirmed"],
    }],
  }, "sources/register.yaml");
  assert.deepEqual(issues, []);
});

test("project facts are strict evidence records", async () => {
  const ajv = await loadSchemaRegistry(root);
  const base = {
    schema_version: 1, kind: "project-charter", id: "charter-project-a", project_id: "project-a",
    revision: 1, status: "active", owner_role: "product-delivery-lead",
    created_at: "2026-08-19T00:00:00+08:00", updated_at: "2026-08-19T00:00:00+08:00",
    created_by: "product-delivery-lead", updated_by: "product-delivery-lead",
    input_mode: "url_only", service_tier: "standard", permission_level: "C",
    markets: [], business_goals: [], success_metrics: [], audiences: [], brand: {},
    conversion_paths: [], budgets: {}, approval_requirements: [], unknowns: [], risks: [],
  };
  const fact = {
    fact_id: "FACT-1", statement: "Observed public statement", evidence_status: "observed_fact",
    evidence_refs: ["SRC-1"], market_scope: ["global"],
  };
  assert.deepEqual(validateAgainst(ajv, "https://webup.local/schemas/project-charter", { ...base, facts: [fact] }, "charter.yaml"), []);
  const invalid = validateAgainst(ajv, "https://webup.local/schemas/project-charter", { ...base, facts: [{ ...fact, unapproved: true }] }, "charter.yaml");
  assert(invalid.some((issue) => issue.message.includes("must NOT have additional properties")));
});

test("production candidates explicitly declare whether source rights apply", async () => {
  const ajv = await loadSchemaRegistry(root);
  const record = {
    schema_version: 1, kind: "artifact-index", id: "artifacts-project-a", project_id: "project-a", revision: 1,
    status: "active", owner_role: "product-delivery-lead", created_at: "2026-08-19T00:00:00+08:00",
    updated_at: "2026-08-19T00:00:00+08:00", created_by: "product-delivery-lead", updated_by: "product-delivery-lead",
    artifacts: [{
      artifact_id: "REL-1", artifact_type: "release-candidate", owner_role: "frontend-commerce-lead", revision: 1,
      status: "production-candidate", location: "artifacts/REL-1", content_hash: "sha256:release",
      source_refs: [], approval_refs: [], usage_status: "production_approved",
    }],
  };
  const missingApplicability = validateAgainst(ajv, "https://webup.local/schemas/artifact-index", record, "artifacts/index.yaml");
  assert(missingApplicability.some((entry) => entry.message.includes("contains_production_materials")));
  record.artifacts[0].contains_production_materials = false;
  assert.deepEqual(validateAgainst(ajv, "https://webup.local/schemas/artifact-index", record, "artifacts/index.yaml"), []);
});
