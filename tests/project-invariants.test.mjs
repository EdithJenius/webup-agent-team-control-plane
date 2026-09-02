import assert from "node:assert/strict";
import test from "node:test";
import { validateActiveLeases, validateApprovalBindings, validateIndependentChecker, validateReleaseReadiness, validateRights, validateSecretShape, validateTaskAssignments, validateTaskGraph } from "../scripts/lib/invariants.mjs";

test("rejects a task marked READY when its dependency is incomplete", () => {
  const issues = validateTaskGraph([
    { id: "A", status: "IN_PROGRESS", dependencies: [] },
    { id: "B", status: "READY", dependencies: [{ ref: "A", required_status: "COMPLETED", required_revision: 1 }] },
  ]);
  assert(issues.some((issue) => issue.code === "DEPENDENCY_NOT_SATISFIED"));
});

test("rejects two active write leases on one task", () => {
  const leases = ["one", "two"].map((id) => ({ id, lease_type: "task_write", subject_ref: "TASK-1", status: "active", expires_at: "2026-08-20T00:00:00+08:00" }));
  const issues = validateActiveLeases(leases, new Date("2026-08-19T00:00:00+08:00"));
  assert(issues.some((issue) => issue.code === "MULTIPLE_ACTIVE_TASK_LEASES"));
});

test("rejects two active project-control leases on one project", () => {
  const leases = ["one", "two"].map((id) => ({ id, project_id: "project-a", lease_type: "project_control", subject_ref: "project-a", status: "active", expires_at: "2026-08-20T00:00:00+08:00" }));
  const issues = validateActiveLeases(leases, new Date("2026-08-19T00:00:00+08:00"));
  assert(issues.some((issue) => issue.code === "MULTIPLE_ACTIVE_PROJECT_CONTROLLERS"));
});

test("rejects a dependency bound to a stale upstream revision", () => {
  const issues = validateTaskGraph([
    { id: "A", revision: 2, status: "COMPLETED", dependencies: [] },
    { id: "B", revision: 1, status: "READY", dependencies: [{ ref: "A", required_status: "COMPLETED", required_revision: 1 }] },
  ]);
  assert(issues.some((issue) => issue.code === "DEPENDENCY_REVISION_STALE"));
});

test("rejects the same maker and checker instance", () => {
  const issues = validateIndependentChecker([{ id: "TASK-1", status: "IN_REVIEW", assignee: "thread-a", assignee_role: "frontend-commerce-lead", independent_verifier_instance: "thread-a", independent_verifier_role: "frontend-commerce-lead" }]);
  assert(issues.some((issue) => issue.code === "CHECKER_NOT_INDEPENDENT"));
});

test("rejects a claimed task without a matching active write lease", () => {
  const issues = validateTaskAssignments([{ id: "TASK-1", status: "CLAIMED", assignee: "thread-a" }], [], new Date("2026-08-19T00:00:00+08:00"));
  assert(issues.some((issue) => issue.code === "CLAIMED_WITHOUT_ACTIVE_LEASE"));
});

test("invalidates an approval bound to an old artifact revision", () => {
  const issues = validateApprovalBindings({
    charter: { id: "charter", revision: 1 }, state: { id: "state", revision: 1 }, tasks: [],
    artifacts: { artifacts: [{ artifact_id: "ART-1", revision: 2 }] },
    approvals: [{ id: "APR-1", subject_ref: "ART-1", subject_revision: 1 }],
  });
  assert(issues.some((issue) => issue.code === "APPROVAL_SUBJECT_STALE"));
});

test("requires a named human for creative proposal approval", () => {
  const issues = validateApprovalBindings({
    charter: { id: "charter", revision: 1 }, state: { id: "state", revision: 1 }, tasks: [],
    artifacts: { artifacts: [{ artifact_id: "ART-1", revision: 1 }] },
    approvals: [{ id: "APR-1", approval_type: "content-state-promotion", subject_ref: "ART-1", subject_revision: 1, decision: "approved", decided_by_type: "agent" }],
  });
  assert(issues.some((issue) => issue.code === "CONTENT_PROMOTION_REQUIRES_HUMAN"));
});

test("rejects a production candidate without production-approved rights", () => {
  const issues = validateRights({ artifacts: { artifacts: [{ artifact_id: "ART-1", status: "production-candidate", usage_status: "publicly_observed" }] } });
  assert(issues.some((issue) => issue.code === "ASSET_NOT_PRODUCTION_APPROVED"));
});

test("rejects raw secret-shaped fields but permits secret_ref", () => {
  assert(validateSecretShape({ api_key: "raw-value" }, "project").some((issue) => issue.code === "RAW_SECRET_FIELD"));
  assert.deepEqual(validateSecretShape({ secret_ref: "vault://commerce/storefront" }, "project"), []);
});

test("rejects production readiness without all gates, human approval, and rollback", () => {
  const issues = validateReleaseReadiness({
    state: { current_stage: "P8", release_candidate_ref: "release-1" },
    approvals: [], artifacts: { artifacts: [] }, tasks: [], leases: [], sources: { sources: [] },
  });
  assert.deepEqual(new Set(issues.map((issue) => issue.code)), new Set(["MISSING_HARD_GATES", "MISSING_HUMAN_RELEASE_APPROVAL", "MISSING_ROLLBACK_REFERENCE"]));
});

test("requires production approval to bind the current release candidate", () => {
  const gates = ["build", "functionality", "conversion-path", "mobile", "accessibility", "performance", "security", "rollback"].map((id) => ({ id, result: "passed" }));
  const issues = validateReleaseReadiness({
    state: { current_stage: "P8", release_candidate_ref: "release-1", rollback_ref: "rollback-1", quality_gates: gates },
    approvals: [{ approval_type: "production-release", subject_ref: "other-release", decision: "approved", decided_by_type: "human" }],
  });
  assert(issues.some((issue) => issue.code === "MISSING_HUMAN_RELEASE_APPROVAL"));
});
