import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";
import { validateApprovalBindings, validateIndependentChecker, validateProjectControlLease, validateProjectIdentity, validateReleaseReadiness, validateRights, validateSecretShape, validateTaskAssignments } from "../scripts/lib/invariants.mjs";
import { projectStatus } from "../scripts/project-status.mjs";
import { validateProject } from "../scripts/validate-project.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const now = new Date("2026-08-19T00:00:00+08:00");
const hardGates = ["build", "functionality", "conversion-path", "mobile", "accessibility", "performance", "security", "rollback"];

function releaseModel() {
  const evidence = hardGates.map((id) => ({
    artifact_id: `EV-${id}`, revision: 1, status: "valid", usage_status: "internal_analysis",
    source_refs: [], approval_refs: [],
  }));
  const candidate = {
    artifact_id: "REL-1", revision: 2, status: "production-candidate", usage_status: "production_approved",
    contains_production_materials: false, source_refs: [], approval_refs: [],
  };
  return {
    state: {
      current_stage: "P8", release_candidate_ref: candidate.artifact_id, rollback_ref: "ROLLBACK-1",
      quality_gates: hardGates.map((id) => ({ id, result: "passed", evidence_ref: `EV-${id}`, evidence_revision: 1 })),
    },
    artifacts: { artifacts: [...evidence, candidate] },
    approvals: [{
      id: "APR-REL", status: "active", approval_type: "production-release", subject_ref: candidate.artifact_id,
      subject_revision: candidate.revision, decision: "approved", decided_by: "release-owner", decided_by_type: "human",
      scope: "production-release", expires_at: "2026-08-20T00:00:00+08:00",
    }],
  };
}

function expectCode(issues, code) {
  assert(issues.some((entry) => entry.code === code), `${code} missing from ${JSON.stringify(issues)}`);
}

test("production release approval fails closed for every invalid binding", () => {
  const variants = [
    ["expired", { expires_at: "2026-08-18T00:00:00+08:00" }],
    ["agent", { decided_by_type: "agent" }],
    ["unnamed", { decided_by: "   " }],
    ["wrong subject", { subject_ref: "REL-OLD" }],
    ["old revision", { subject_revision: 1 }],
    ["wrong scope", { scope: "preview-only" }],
  ];
  for (const [label, changes] of variants) {
    const model = releaseModel();
    Object.assign(model.approvals[0], changes);
    expectCode(validateReleaseReadiness(model, now), "MISSING_HUMAN_RELEASE_APPROVAL", label);
  }
});

test("independent review requires complete and distinct maker/checker identities", () => {
  const complete = {
    id: "TASK-1", status: "IN_REVIEW", assignee: "maker-1", assignee_role: "frontend-commerce-lead",
    independent_verifier_instance: "checker-1", independent_verifier_role: "independent-quality-lead",
  };
  for (const field of ["assignee", "assignee_role", "independent_verifier_instance", "independent_verifier_role"]) {
    const task = { ...complete };
    delete task[field];
    expectCode(validateIndependentChecker([task]), "CHECKER_IDENTITY_INCOMPLETE");
  }
  expectCode(validateIndependentChecker([{ ...complete, independent_verifier_instance: complete.assignee }]), "CHECKER_NOT_INDEPENDENT");
  expectCode(validateIndependentChecker([{ ...complete, independent_verifier_role: complete.assignee_role }]), "CHECKER_NOT_INDEPENDENT");
});

test("maker identity alone does not require a checker before review", () => {
  assert.deepEqual(validateIndependentChecker([{
    id: "TASK-1", status: "IN_PROGRESS", assignee: "maker-1", assignee_role: "frontend-commerce-lead",
  }]), []);
});

test("a draft may pre-register only the checker role", () => {
  assert.deepEqual(validateIndependentChecker([{
    id: "TASK-1", status: "DRAFT", independent_verifier_role: "independent-quality-lead",
  }]), []);
});

test("release gates require unique ids and current resolvable evidence", () => {
  const duplicate = releaseModel();
  duplicate.state.quality_gates.push({ ...duplicate.state.quality_gates[0] });
  expectCode(validateReleaseReadiness(duplicate, now), "DUPLICATE_HARD_GATE");

  const unknown = releaseModel();
  unknown.state.quality_gates.push({ id: "visual-polish", result: "passed", evidence_ref: "EV-build", evidence_revision: 1 });
  expectCode(validateReleaseReadiness(unknown, now), "UNKNOWN_HARD_GATE");

  const missing = releaseModel();
  delete missing.state.quality_gates[0].evidence_ref;
  expectCode(validateReleaseReadiness(missing, now), "GATE_EVIDENCE_MISSING");

  const dangling = releaseModel();
  dangling.state.quality_gates[0].evidence_ref = "EV-MISSING";
  expectCode(validateReleaseReadiness(dangling, now), "GATE_EVIDENCE_UNRESOLVED");

  const stale = releaseModel();
  stale.state.quality_gates[0].evidence_revision = 2;
  expectCode(validateReleaseReadiness(stale, now), "GATE_EVIDENCE_STALE");

  const invalid = releaseModel();
  invalid.artifacts.artifacts[0].status = "superseded";
  expectCode(validateReleaseReadiness(invalid, now), "GATE_EVIDENCE_INVALID");

  const draft = releaseModel();
  draft.artifacts.artifacts[0].status = "draft";
  expectCode(validateReleaseReadiness(draft, now), "GATE_EVIDENCE_INVALID");
});

test("production material candidates require approved sources and bound rights approvals", () => {
  const artifact = {
    artifact_id: "ART-1", revision: 2, status: "production-candidate", usage_status: "production_approved",
    contains_production_materials: true, source_refs: ["SRC-1"], approval_refs: [],
  };
  const model = {
    artifacts: { artifacts: [artifact] },
    sources: { sources: [{ source_id: "SRC-1", usage_status: "publicly_observed" }] },
    approvals: [],
  };
  const issues = validateRights(model, now);
  expectCode(issues, "SOURCE_NOT_PRODUCTION_APPROVED");
  expectCode(issues, "RIGHTS_APPROVAL_MISSING");

  model.sources.sources = [];
  expectCode(validateRights(model, now), "SOURCE_REF_UNRESOLVED");
});

test("production candidates without production materials do not require source rights", () => {
  const model = {
    artifacts: { artifacts: [{
      artifact_id: "REL-1", revision: 1, status: "production-candidate", usage_status: "production_approved",
      contains_production_materials: false, source_refs: [], approval_refs: [],
    }] },
    sources: { sources: [] }, approvals: [],
  };
  assert.deepEqual(validateRights(model, now), []);
});

test("production material candidates accept current source rights and a bound approval", () => {
  const artifact = {
    artifact_id: "ART-1", revision: 2, status: "production-candidate", usage_status: "production_approved",
    contains_production_materials: true, source_refs: ["SRC-1"], approval_refs: ["APR-RIGHTS"],
  };
  const model = {
    artifacts: { artifacts: [artifact] },
    sources: { sources: [{ source_id: "SRC-1", usage_status: "production_approved" }] },
    approvals: [{
      id: "APR-RIGHTS", status: "active", approval_type: "asset-rights", decision: "approved",
      decided_by: "rights-owner", decided_by_type: "human", subject_ref: artifact.artifact_id,
      subject_revision: artifact.revision, scope: "production-material-rights", expires_at: "2026-08-20T00:00:00+08:00",
    }],
  };
  assert.deepEqual(validateRights(model, now), []);
});

test("production material candidates allow unrelated valid approvals beside asset rights", () => {
  const artifact = {
    artifact_id: "ART-1", revision: 2, status: "production-candidate", usage_status: "production_approved",
    contains_production_materials: true, source_refs: ["SRC-1"], approval_refs: ["APR-RIGHTS", "APR-DIRECTION"],
  };
  const approval = {
    status: "active", decision: "approved", decided_by: "human-owner", decided_by_type: "human",
    subject_ref: artifact.artifact_id, subject_revision: artifact.revision, expires_at: "2026-08-20T00:00:00+08:00",
  };
  const model = {
    artifacts: { artifacts: [artifact] },
    sources: { sources: [{ source_id: "SRC-1", usage_status: "production_approved" }] },
    approvals: [
      { id: "APR-RIGHTS", ...approval, approval_type: "asset-rights", scope: "production-material-rights" },
      { id: "APR-DIRECTION", ...approval, approval_type: "visual-direction", scope: "visual-direction" },
    ],
  };
  assert.deepEqual(validateRights(model, now), []);
  assert.deepEqual(validateApprovalBindings({
    ...model, charter: { id: "CHARTER-1", revision: 1 }, state: { id: "STATE-1", revision: 1 }, tasks: [],
  }), []);
});

test("a dangling artifact approval ref fails even when asset rights are valid", () => {
  const artifact = {
    artifact_id: "ART-1", revision: 2, status: "production-candidate", usage_status: "production_approved",
    contains_production_materials: true, source_refs: ["SRC-1"], approval_refs: ["APR-RIGHTS", "APR-MISSING"],
  };
  const model = {
    charter: { id: "CHARTER-1", revision: 1 }, state: { id: "STATE-1", revision: 1 }, tasks: [],
    artifacts: { artifacts: [artifact] }, sources: { sources: [{ source_id: "SRC-1", usage_status: "production_approved" }] },
    approvals: [{
      id: "APR-RIGHTS", status: "active", approval_type: "asset-rights", decision: "approved",
      decided_by: "rights-owner", decided_by_type: "human", subject_ref: artifact.artifact_id,
      subject_revision: artifact.revision, scope: "production-material-rights", expires_at: "2026-08-20T00:00:00+08:00",
    }],
  };
  assert.deepEqual(validateRights(model, now), []);
  expectCode(validateApprovalBindings(model), "APPROVAL_REF_NOT_FOUND");
});

test("asset-rights approval still fails when expired or bound incorrectly", () => {
  const artifact = {
    artifact_id: "ART-1", revision: 2, status: "production-candidate", usage_status: "production_approved",
    contains_production_materials: true, source_refs: ["SRC-1"], approval_refs: ["APR-RIGHTS"],
  };
  const baseApproval = {
    id: "APR-RIGHTS", status: "active", approval_type: "asset-rights", decision: "approved",
    decided_by: "rights-owner", decided_by_type: "human", subject_ref: artifact.artifact_id,
    subject_revision: artifact.revision, scope: "production-material-rights", expires_at: "2026-08-20T00:00:00+08:00",
  };
  for (const changes of [
    { expires_at: "2026-08-18T00:00:00+08:00" }, { subject_ref: "ART-OLD" },
    { subject_revision: 1 }, { scope: "preview-only" },
  ]) {
    const model = {
      artifacts: { artifacts: [artifact] },
      sources: { sources: [{ source_id: "SRC-1", usage_status: "production_approved" }] },
      approvals: [{ ...baseApproval, ...changes }],
    };
    expectCode(validateRights(model, now), "RIGHTS_APPROVAL_MISSING");
  }
});

test("raw secret detection covers credential keys without flagging ordinary text", () => {
  for (const key of ["token", "ACCESS-TOKEN", "private_key", "Private-Key", "authorization", "Bearer_Token", "credential", "client-secret"]) {
    expectCode(validateSecretShape({ [key]: "raw-value" }, "project"), "RAW_SECRET_FIELD");
  }
  assert.deepEqual(validateSecretShape({ secret_ref: "vault://commerce/storefront", token_budget: 1000, authorization_status: "pending", credential_policy: "required" }), []);
});

test("design-system token fields are not treated as credentials", () => {
  assert.deepEqual(validateSecretShape({
    design_token: "brand-primary", "color-token": "blue-500", spacing_token: "space-4",
    "DESIGN-TOKEN": "brand-secondary", token_status: "approved",
  }), []);
});

test("write-state tasks require the exact fully bound task lease", () => {
  const task = {
    id: "TASK-1", project_id: "project-a", status: "IN_PROGRESS", assignee: "maker-1",
    assignee_role: "frontend-commerce-lead", lease_ref: "LEASE-1",
  };
  const lease = {
    id: "LEASE-1", project_id: "project-a", lease_type: "task_write", subject_ref: task.id,
    holder_instance: task.assignee, holder_role: task.assignee_role, status: "active", expires_at: "2026-08-20T00:00:00+08:00",
  };
  const variants = [
    ["wrong ref", { ...task, lease_ref: "LEASE-X" }, lease],
    ["wrong role", task, { ...lease, holder_role: "visual-interaction-lead" }],
    ["wrong project", task, { ...lease, project_id: "project-b" }],
    ["wrong subject", task, { ...lease, subject_ref: "TASK-X" }],
    ["expired", task, { ...lease, expires_at: "2026-08-18T00:00:00+08:00" }],
    ["missing", task, null],
  ];
  for (const [label, candidateTask, candidateLease] of variants) {
    expectCode(validateTaskAssignments([candidateTask], candidateLease ? [candidateLease] : [], now), "CLAIMED_WITHOUT_ACTIVE_LEASE", label);
  }
});

test("project identity checks every project-owned record class", () => {
  const matching = { project_id: "project-a" };
  const collections = ["tasks", "approvals", "leases", "changeRequests"];
  for (const collection of collections) {
    const model = {
      projectId: "project-a", charter: matching, state: matching, sources: matching, artifacts: matching,
      tasks: [], approvals: [], leases: [], changeRequests: [],
    };
    model[collection] = [{ id: `${collection}-1`, project_id: "project-b" }];
    expectCode(validateProjectIdentity(model), "PROJECT_ID_MISMATCH");
  }
  for (const recordName of ["charter", "state", "sources", "artifacts"]) {
    const model = {
      projectId: "project-a", charter: matching, state: matching, sources: matching, artifacts: matching,
      tasks: [], approvals: [], leases: [], changeRequests: [], [recordName]: { project_id: "project-b" },
    };
    expectCode(validateProjectIdentity(model), "PROJECT_ID_MISMATCH");
  }
});

test("project controller rejects every invalid lease binding", () => {
  const model = {
    projectId: "project-a",
    state: { project_control_lease_ref: "LEASE-PC", owner_role: "product-delivery-lead" },
    leases: [{
      id: "LEASE-PC", lease_type: "project_control", project_id: "project-a", subject_ref: "project-a",
      holder_role: "product-delivery-lead", holder_instance: "main-control", status: "active",
      expires_at: "2026-08-20T00:00:00+08:00",
    }],
  };
  const variants = [
    ["wrong role", { holder_role: "frontend-commerce-lead" }],
    ["wrong project", { project_id: "project-b" }],
    ["wrong subject", { subject_ref: "project-b" }],
    ["expired", { expires_at: "2026-08-18T00:00:00+08:00" }],
    ["inactive", { status: "released" }],
  ];
  for (const [label, changes] of variants) {
    const candidate = structuredClone(model);
    Object.assign(candidate.leases[0], changes);
    expectCode(validateProjectControlLease(candidate, now), "PROJECT_CONTROL_LEASE_INVALID", label);
  }
  const missing = structuredClone(model);
  missing.leases = [];
  expectCode(validateProjectControlLease(missing, now), "PROJECT_CONTROL_LEASE_INVALID");

  const unreferenced = structuredClone(model);
  unreferenced.state.project_control_lease_ref = null;
  expectCode(validateProjectControlLease(unreferenced, now), "PROJECT_CONTROL_LEASE_INVALID");
});

async function withFixture(run) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "webup-m2-regression-"));
  const projectsDir = path.join(temporaryRoot, "projects");
  await mkdir(projectsDir, { recursive: true });
  await cp(path.join(root, "schemas"), path.join(temporaryRoot, "schemas"), { recursive: true });
  await cp(path.join(root, "tests/fixtures/projects/url-only-valid"), path.join(projectsDir, "url-only-valid"), { recursive: true });
  try { await run(temporaryRoot, "projects", path.join(projectsDir, "url-only-valid")); }
  finally { await rm(temporaryRoot, { recursive: true, force: true }); }
}

async function updateYaml(file, update) {
  const value = parse(await readFile(file, "utf8"));
  update(value);
  await writeFile(file, stringify(value));
}

test("explicit project identity mismatches fail validation and remain visible in status", async () => {
  await withFixture(async (temporaryRoot, projectsDir, projectDir) => {
    await updateYaml(path.join(projectDir, "charter.yaml"), (charter) => { charter.project_id = "other-project"; });
    const { issues } = await validateProject(temporaryRoot, "url-only-valid", projectsDir, now);
    expectCode(issues, "PROJECT_ID_MISMATCH");
    const status = await projectStatus(temporaryRoot, { projectId: "url-only-valid", projectsDir, now, instance: "main-control" });
    assert(status.warnings.some((warning) => warning.startsWith("PROJECT_ID_MISMATCH:")));
  });
});

test("project-control lease ref must resolve to the exact active project lease", async () => {
  await withFixture(async (temporaryRoot, projectsDir, projectDir) => {
    await updateYaml(path.join(projectDir, "state.yaml"), (state) => { state.project_control_lease_ref = "LEASE-PC"; });
    await mkdir(path.join(projectDir, "leases"), { recursive: true });
    await writeFile(path.join(projectDir, "leases/wrong.yaml"), stringify({
      schema_version: 1, kind: "lease", id: "LEASE-WRONG", project_id: "url-only-valid", revision: 1,
      status: "active", owner_role: "product-delivery-lead", created_at: "2026-08-19T00:00:00+08:00",
      updated_at: "2026-08-19T00:00:00+08:00", created_by: "product-delivery-lead", updated_by: "product-delivery-lead",
      lease_type: "project_control", holder_role: "product-delivery-lead", holder_instance: "main-control",
      subject_ref: "url-only-valid", started_at: "2026-08-19T00:00:00+08:00", heartbeat_at: "2026-08-19T00:00:00+08:00",
      expires_at: "2026-08-20T00:00:00+08:00",
    }));
    const { issues } = await validateProject(temporaryRoot, "url-only-valid", projectsDir, now);
    expectCode(issues, "PROJECT_CONTROL_LEASE_INVALID");
  });
});

test("status uses release approval validity and reports every invalid approval as pending", async () => {
  await withFixture(async (temporaryRoot, projectsDir, projectDir) => {
    const model = releaseModel();
    await updateYaml(path.join(projectDir, "state.yaml"), (state) => Object.assign(state, model.state));
    await updateYaml(path.join(projectDir, "artifacts/index.yaml"), (index) => {
      index.artifacts = model.artifacts.artifacts.map((artifact) => ({
        artifact_type: "quality-evidence", owner_role: "independent-quality-lead", location: `artifacts/${artifact.artifact_id}`,
        content_hash: `sha256:${artifact.artifact_id}`, ...artifact,
      }));
    });
    await mkdir(path.join(projectDir, "approvals"), { recursive: true });
    const approval = {
      schema_version: 1, kind: "approval", revision: 1, project_id: "url-only-valid", owner_role: "product-delivery-lead",
      created_at: "2026-08-19T00:00:00+08:00", updated_at: "2026-08-19T00:00:00+08:00",
      created_by: "product-delivery-lead", updated_by: "product-delivery-lead", decided_at: "2026-08-19T00:00:00+08:00",
      ...model.approvals[0], scope: "preview-only",
    };
    await writeFile(path.join(projectDir, "approvals/release.yaml"), stringify(approval));
    const validation = spawnSync(process.execPath, [
      "scripts/validate-project.mjs", "--project", "url-only-valid", "--projects-dir", path.dirname(projectDir),
      "--now", "2026-08-19T00:00:00+08:00",
    ], { cwd: root, encoding: "utf8" });
    assert.equal(validation.status, 1, validation.stderr || validation.stdout);
    expectCode(JSON.parse(validation.stdout).issues, "MISSING_HUMAN_RELEASE_APPROVAL");
    const status = await projectStatus(temporaryRoot, { projectId: "url-only-valid", projectsDir, now, instance: "main-control" });
    assert(status.approvals.includes("production-release"));
  });
});
