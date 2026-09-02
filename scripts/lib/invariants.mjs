const issue = (code, location, message) => ({ code, location, message });
const completeStates = new Set(["APPROVED", "COMPLETED"]);
const hardGates = ["build", "functionality", "conversion-path", "mobile", "accessibility", "performance", "security", "rollback"];
const independentReviewStates = new Set(["READY_FOR_REVIEW", "IN_REVIEW", "WAITING_APPROVAL", "APPROVED", "COMPLETED"]);
const writeStates = new Set(["CLAIMED", "IN_PROGRESS", "SELF_CHECK"]);
const validEvidenceStatuses = new Set(["active", "approved", "frozen", "valid", "production-candidate"]);
const nonCredentialTokenKeys = new Set(["designtoken", "colortoken", "spacingtoken"]);

export function validateTaskGraph(tasks) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const issues = [];
  for (const task of tasks) {
    for (const dependency of task.dependencies ?? []) {
      const upstream = byId.get(dependency.ref);
      if (!upstream) issues.push(issue("MISSING_DEPENDENCY", task.id, dependency.ref));
      else if (upstream.revision !== undefined && upstream.revision !== dependency.required_revision) {
        issues.push(issue("DEPENDENCY_REVISION_STALE", task.id, `${dependency.ref} revision ${upstream.revision} != ${dependency.required_revision}`));
      } else if (["READY", "CLAIMED", "IN_PROGRESS", "SELF_CHECK", "READY_FOR_REVIEW", "IN_REVIEW", "WAITING_APPROVAL", "APPROVED", "COMPLETED"].includes(task.status)
        && upstream.status !== dependency.required_status
        && !(dependency.required_status === "APPROVED" && completeStates.has(upstream.status))) {
        issues.push(issue("DEPENDENCY_NOT_SATISFIED", task.id, `${dependency.ref} is ${upstream.status}`));
      }
    }
  }
  return issues;
}

export function validateActiveLeases(leases, now = new Date()) {
  const active = leases.filter((lease) => lease.status === "active" && new Date(lease.expires_at) > now);
  const issues = [];
  const grouped = (items, key) => Map.groupBy(items, key);
  for (const [projectId, values] of grouped(active.filter((lease) => lease.lease_type === "project_control"), (lease) => lease.project_id)) {
    if (values.length > 1) issues.push(issue("MULTIPLE_ACTIVE_PROJECT_CONTROLLERS", projectId, `${values.length} active leases`));
  }
  for (const [subject, values] of grouped(active.filter((lease) => lease.lease_type === "task_write"), (lease) => lease.subject_ref)) {
    if (values.length > 1) issues.push(issue("MULTIPLE_ACTIVE_TASK_LEASES", subject, `${values.length} active leases`));
  }
  return issues;
}

export function validateTaskAssignments(tasks, leases, now = new Date()) {
  return tasks.flatMap((task) => {
    if (!writeStates.has(task.status)) return [];
    const matching = leases.filter((lease) => lease.id === task.lease_ref
      && lease.lease_type === "task_write"
      && lease.project_id === task.project_id
      && lease.subject_ref === task.id
      && lease.holder_instance === task.assignee
      && lease.holder_role === task.assignee_role
      && lease.status === "active"
      && new Date(lease.expires_at) > now);
    return matching.length === 1 ? [] : [issue("CLAIMED_WITHOUT_ACTIVE_LEASE", task.id, "one matching active write lease required")];
  });
}

export function validateIndependentChecker(tasks) {
  return tasks.flatMap((task) => {
    const identityFields = ["assignee", "assignee_role", "independent_verifier_instance", "independent_verifier_role"];
    const applies = independentReviewStates.has(task.status);
    if (!applies) return [];
    const missing = identityFields.filter((field) => typeof task[field] !== "string" || task[field].trim() === "");
    if (missing.length > 0) return [issue("CHECKER_IDENTITY_INCOMPLETE", task.id, missing.join(", "))];
    return task.assignee === task.independent_verifier_instance || task.assignee_role === task.independent_verifier_role
      ? [issue("CHECKER_NOT_INDEPENDENT", task.id, "maker and checker must differ by role and instance")]
      : [];
  });
}

export function isApprovalValid(approval, { approvalType, subjectRef, subjectRevision, scope, now = new Date(), requireHuman = true }) {
  return approval?.status === "active"
    && approval.approval_type === approvalType
    && approval.decision === "approved"
    && (!requireHuman || approval.decided_by_type === "human")
    && typeof approval.decided_by === "string" && approval.decided_by.trim() !== ""
    && approval.subject_ref === subjectRef
    && approval.subject_revision === subjectRevision
    && approval.scope === scope
    && new Date(approval.expires_at) > now;
}

export function hasValidProductionReleaseApproval(model, now = new Date()) {
  const candidate = (model.artifacts?.artifacts ?? []).find((artifact) => artifact.artifact_id === model.state.release_candidate_ref
    && artifact.status === "production-candidate");
  if (!candidate) return false;
  return model.approvals.some((approval) => isApprovalValid(approval, {
    approvalType: "production-release", subjectRef: candidate.artifact_id, subjectRevision: candidate.revision,
    scope: "production-release", now, requireHuman: true,
  }));
}

export function validateRights(model, now = new Date()) {
  const sources = new Map((model.sources?.sources ?? []).map((source) => [source.source_id, source]));
  const approvals = new Map((model.approvals ?? []).map((approval) => [approval.id, approval]));
  return (model.artifacts?.artifacts ?? []).flatMap((artifact) => {
    if (artifact.status !== "production-candidate") return [];
    const issues = artifact.usage_status === "production_approved" ? []
      : [issue("ASSET_NOT_PRODUCTION_APPROVED", artifact.artifact_id, artifact.usage_status)];
    if (artifact.contains_production_materials !== true) return issues;
    if ((artifact.source_refs ?? []).length === 0) issues.push(issue("SOURCE_REF_REQUIRED", artifact.artifact_id, "production materials require source refs"));
    for (const sourceRef of artifact.source_refs ?? []) {
      const source = sources.get(sourceRef);
      if (!source) issues.push(issue("SOURCE_REF_UNRESOLVED", artifact.artifact_id, sourceRef));
      else if (source.usage_status !== "production_approved") issues.push(issue("SOURCE_NOT_PRODUCTION_APPROVED", artifact.artifact_id, sourceRef));
    }
    let validRightsApproval = false;
    for (const approvalRef of artifact.approval_refs ?? []) {
      const approval = approvals.get(approvalRef);
      if (!approval || approval.approval_type !== "asset-rights") continue;
      if (isApprovalValid(approval, {
        approvalType: "asset-rights", subjectRef: artifact.artifact_id, subjectRevision: artifact.revision,
        scope: "production-material-rights", now, requireHuman: true,
      })) validRightsApproval = true;
      else issues.push(issue("RIGHTS_APPROVAL_INVALID", artifact.artifact_id, approvalRef));
    }
    if (!validRightsApproval) issues.push(issue("RIGHTS_APPROVAL_MISSING", artifact.artifact_id, "valid asset-rights approval required"));
    return issues;
  });
}

export function validateApprovalBindings(model) {
  const approvalIds = new Set(model.approvals.map((approval) => approval.id));
  const subjects = new Map([
    [model.charter.id, model.charter],
    [model.state.id, model.state],
    ...model.tasks.map((task) => [task.id, task]),
    ...(model.artifacts.artifacts ?? []).map((artifact) => [artifact.artifact_id, artifact]),
  ]);
  const referenceIssues = (model.artifacts.artifacts ?? []).flatMap((artifact) => (artifact.approval_refs ?? []).flatMap((approvalRef) => approvalIds.has(approvalRef)
    ? [] : [issue("APPROVAL_REF_NOT_FOUND", artifact.artifact_id, approvalRef)]));
  return referenceIssues.concat(model.approvals.flatMap((approval) => {
    const issues = [];
    const subject = subjects.get(approval.subject_ref);
    if (!subject) issues.push(issue("APPROVAL_SUBJECT_MISSING", approval.id, approval.subject_ref));
    else if (subject.revision !== approval.subject_revision) issues.push(issue("APPROVAL_SUBJECT_STALE", approval.id, `${approval.subject_revision} != ${subject.revision}`));
    if (approval.approval_type === "content-state-promotion" && approval.decision === "approved"
      && (approval.decided_by_type !== "human" || typeof approval.decided_by !== "string" || approval.decided_by.trim() === "")) {
      issues.push(issue("CONTENT_PROMOTION_REQUIRES_HUMAN", approval.id, "creative_proposal to client_approved requires a named human"));
    }
    return issues;
  }));
}

export function validateSecretShape(value, location = "root") {
  if (Array.isArray(value)) return value.flatMap((item, index) => validateSecretShape(item, `${location}[${index}]`));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) => {
    const current = `${location}.${key}`;
    const normalized = key.replaceAll(/[_\-\s]/g, "").toLowerCase();
    const credentialKey = normalized === "token"
      || normalized === "authorization"
      || normalized === "bearer"
      || normalized === "credential"
      || normalized === "credentials"
      || (normalized.endsWith("token") && !nonCredentialTokenKeys.has(normalized))
      || normalized.endsWith("password")
      || normalized.endsWith("passphrase")
      || normalized.endsWith("privatekey")
      || normalized.endsWith("apikey")
      || normalized.endsWith("secret");
    const own = normalized !== "secretref" && credentialKey
      ? [issue("RAW_SECRET_FIELD", current, "use secret_ref instead")] : [];
    return own.concat(validateSecretShape(nested, current));
  });
}

export function validateProjectIdentity(model) {
  const records = [
    ["charter.yaml", model.charter],
    ["state.yaml", model.state],
    ["sources/register.yaml", model.sources],
    ["artifacts/index.yaml", model.artifacts],
    ...model.tasks.map((record) => [`tasks/${record.id ?? "unknown"}`, record]),
    ...model.approvals.map((record) => [`approvals/${record.id ?? "unknown"}`, record]),
    ...model.leases.map((record) => [`leases/${record.id ?? "unknown"}`, record]),
    ...model.changeRequests.map((record) => [`change-requests/${record.id ?? "unknown"}`, record]),
  ];
  return records.flatMap(([location, record]) => record.project_id === model.projectId ? []
    : [issue("PROJECT_ID_MISMATCH", location, `${record.project_id ?? "missing"} != ${model.projectId}`)]);
}

export function findValidProjectControlLease(model, now = new Date()) {
  if (!model.state.project_control_lease_ref) return null;
  return model.leases.find((lease) => lease.id === model.state.project_control_lease_ref
    && lease.lease_type === "project_control"
    && lease.project_id === model.projectId
    && lease.subject_ref === model.projectId
    && lease.holder_role === model.state.owner_role
    && lease.status === "active"
    && new Date(lease.expires_at) > now) ?? null;
}

export function validateProjectControlLease(model, now = new Date()) {
  if (model.state.project_control_lease_ref) {
    return findValidProjectControlLease(model, now) ? []
      : [issue("PROJECT_CONTROL_LEASE_INVALID", "state.yaml", model.state.project_control_lease_ref)];
  }
  const unreferenced = model.leases.some((lease) => lease.lease_type === "project_control"
    && lease.project_id === model.projectId && lease.status === "active" && new Date(lease.expires_at) > now);
  return unreferenced ? [issue("PROJECT_CONTROL_LEASE_INVALID", "state.yaml", "active project-control lease is not referenced")] : [];
}

export function validateReleaseReadiness(model, now = new Date()) {
  if (model.state.current_stage !== "P8" && model.state.current_stage !== "P9") return [];
  const issues = [];
  const gates = model.state.quality_gates ?? [];
  const passedGates = gates.filter((gate) => gate.result === "passed");
  const passed = new Set(passedGates.map((gate) => gate.id));
  const counts = Map.groupBy(gates, (gate) => gate.id);
  for (const [gateId, entries] of counts) {
    if (entries.length > 1) issues.push(issue("DUPLICATE_HARD_GATE", "state.yaml", gateId));
    if (!hardGates.includes(gateId)) issues.push(issue("UNKNOWN_HARD_GATE", "state.yaml", gateId));
  }
  if (hardGates.some((gate) => !passed.has(gate))) issues.push(issue("MISSING_HARD_GATES", "state.yaml", "all eight gates must pass"));
  const artifacts = new Map((model.artifacts?.artifacts ?? []).map((artifact) => [artifact.artifact_id, artifact]));
  for (const gate of passedGates) {
    if (!gate.evidence_ref || !gate.evidence_revision) {
      issues.push(issue("GATE_EVIDENCE_MISSING", `state.yaml:${gate.id}`, "passed gate requires evidence ref and revision"));
      continue;
    }
    const evidence = artifacts.get(gate.evidence_ref);
    if (!evidence) issues.push(issue("GATE_EVIDENCE_UNRESOLVED", `state.yaml:${gate.id}`, gate.evidence_ref));
    else if (evidence.revision !== gate.evidence_revision) issues.push(issue("GATE_EVIDENCE_STALE", `state.yaml:${gate.id}`, `${gate.evidence_revision} != ${evidence.revision}`));
    else if (!validEvidenceStatuses.has(evidence.status) || evidence.usage_status === "prohibited") {
      issues.push(issue("GATE_EVIDENCE_INVALID", `state.yaml:${gate.id}`, evidence.status));
    }
  }
  if (!hasValidProductionReleaseApproval(model, now)) {
    issues.push(issue("MISSING_HUMAN_RELEASE_APPROVAL", "approvals", "named human approval required"));
  }
  if (!model.state.rollback_ref) issues.push(issue("MISSING_ROLLBACK_REFERENCE", "state.yaml", "rollback_ref required"));
  return issues;
}
