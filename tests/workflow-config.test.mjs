import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readYaml } from "../scripts/lib/files.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("workflow encodes dependencies, review loops, human release, and eight gates", async () => {
  const delivery = await readYaml(path.join(root, "team/workflows/delivery-lifecycle.yaml"));
  const tasks = await readYaml(path.join(root, "team/workflows/task-lifecycle.yaml"));
  const approvals = await readYaml(path.join(root, "team/workflows/approval-gates.yaml"));
  const quality = await readYaml(path.join(root, "team/policies/quality-gates.yaml"));
  const concurrency = await readYaml(path.join(root, "team/policies/concurrency.yaml"));
  const knowledge = await readYaml(path.join(root, "knowledge/index.yaml"));
  assert.deepEqual(delivery.stages.map((stage) => stage.id), ["P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9"]);
  assert(tasks.transitions.some((item) => item.from === "IN_REVIEW" && item.to === "CHANGES_REQUESTED"));
  assert(!tasks.automation.includes("claim-ready-task"));
  assert(approvals.gates.some((gate) => gate.id === "production-release" && gate.actor === "named-human"));
  assert.deepEqual(quality.gates.map((gate) => gate.id), ["build", "functionality", "conversion-path", "mobile", "accessibility", "performance", "security", "rollback"]);
  assert.equal(concurrency.project_control.max_active_per_project, 1);
  assert.equal(concurrency.task_write.max_active_per_task, 1);
  assert.deepEqual(knowledge.required_dimensions, ["client", "project", "market", "language", "industry", "knowledge_type", "version", "evidence_source", "sensitivity", "reuse_scope"]);
});

test("brand approval binds formal content and invalidates substantive changes", async () => {
  const approvals = await readYaml(path.join(root, "team/workflows/approval-gates.yaml"));
  const brand = approvals.gates.find((gate) => gate.id === "brand-direction");
  assert.deepEqual(brand.subjects, ["brand-positioning", "brand-promise", "core-story", "formal-claim", "formal-copy"]);
  assert.deepEqual(brand.invalidated_by, [
    "positioning-change",
    "brand-promise-change",
    "core-story-change",
    "formal-claim-change",
    "formal-copy-change",
  ]);
  assert.equal(brand.requires_human_reapproval, true);
});

test("P5 records an owned evidence-based decision and P6 follows the selected branch", async () => {
  const delivery = await readYaml(path.join(root, "team/workflows/delivery-lifecycle.yaml"));
  const p5 = delivery.stages.find((stage) => stage.id === "P5");
  const p6 = delivery.stages.find((stage) => stage.id === "P6");
  assert.equal(p5.trigger_decision.owner, "product-delivery-lead");
  assert.deepEqual(p5.trigger_decision.outcomes, ["triggered", "skipped"]);
  assert.deepEqual(p5.trigger_decision.conditions, [
    "advanced-webgl-threejs-shader-or-media-timeline",
    "css-gsap-insufficient",
    "flagship-specialist-validation",
    "gpu-memory-frame-risk",
  ]);
  assert.deepEqual(p5.trigger_decision.invalid_conditions, ["prestige-only"]);
  assert.deepEqual(p5.trigger_decision.evidence, [
    "approved-visual-direction",
    "storyboard",
    "performance-budget",
    "accessibility-budget",
    "frontend-integration-boundary",
    "asset-rights",
  ]);
  assert.equal(p5.task_creation.triggered, true);
  assert.equal(p5.task_creation.skipped, false);
  assert.equal(p5.task_creation.no_empty_task_when_skipped, true);
  assert.deepEqual(p6.branch_dependencies.triggered.required_artifacts, [
    "motion-subsystem-api",
    "l0-l4-fallbacks",
    "performance-report",
  ]);
  assert.deepEqual(p6.branch_dependencies.triggered.required_approvals, ["advanced-motion-direction"]);
  assert.equal(p6.branch_dependencies.triggered.api_acceptance_owner, "frontend-commerce-lead");
  assert.deepEqual(p6.branch_dependencies.skipped.required_stages, ["P4"]);
  assert.deepEqual(p6.branch_dependencies.skipped.required_approvals, ["visual-narrative-direction"]);
  assert.equal(p6.branch_dependencies.skipped.p5_task_created, false);
});

test("advanced motion capability encodes all valid triggers and rejects prestige-only use", async () => {
  const capabilities = await readYaml(path.join(root, "team/capabilities.yaml"));
  const advanced = capabilities.capabilities.find((item) => item.id === "advanced-motion-3d");
  assert.deepEqual(advanced.trigger_conditions, [
    "advanced-webgl-threejs-shader-or-media-timeline",
    "css-gsap-insufficient",
    "flagship-specialist-validation",
    "gpu-memory-frame-risk",
  ]);
  assert.deepEqual(advanced.invalid_triggers, ["prestige-only"]);
});

test("quality policy requires advanced motion evidence without agent-relaxed thresholds", async () => {
  const quality = await readYaml(path.join(root, "team/policies/quality-gates.yaml"));
  assert.equal(quality.advanced_motion_evidence.thresholds_source, "project-charter");
  assert.equal(quality.advanced_motion_evidence.agent_may_relax_thresholds, false);
  assert.deepEqual(quality.advanced_motion_evidence.required_metrics, [
    "frame-rate-fps",
    "frame-time-ms",
    "memory-mb",
    "gpu-profile",
    "device-pixel-ratio",
    "media-payload-bytes",
    "load-time-ms",
    "recovery-time-ms",
  ]);
  assert.deepEqual(quality.advanced_motion_evidence.required_context, ["device", "input-mode", "network", "fallback-level", "run-count", "raw-report"]);
});
