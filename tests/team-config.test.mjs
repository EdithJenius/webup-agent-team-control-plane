import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readRole, readYaml } from "../scripts/lib/files.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("team manifest fixes ownership and disables automatic task claiming", async () => {
  const team = await readYaml(path.join(root, "team/team.yaml"));
  const capabilities = await readYaml(path.join(root, "team/capabilities.yaml"));
  assert.equal(team.project_control_role, "product-delivery-lead");
  assert.equal(team.defaults.permission_level, "C");
  assert.equal(team.defaults.auto_claim_ready_tasks, false);
  assert.equal(team.defaults.production_release_requires_human, true);
  assert.deepEqual(Object.keys(team.service_tiers), ["quick", "standard", "flagship"]);
  assert.deepEqual(team.roles.filter((role) => role.participation === "core").map((role) => role.id), [
    "product-delivery-lead",
    "brand-content-lead",
    "visual-interaction-lead",
    "frontend-commerce-lead",
    "independent-quality-lead",
  ]);
  assert(capabilities.capabilities.some((item) => item.id === "web-research"));
  assert(capabilities.capabilities.some((item) => item.id === "site-capture"));
  assert(!team.roles.some((role) => role.id === "search-agent"));
});

test("all nine capabilities declare auditable inputs, outputs, safe fallbacks, and resolvable roles", async () => {
  const team = await readYaml(path.join(root, "team/team.yaml"));
  const registry = await readYaml(path.join(root, "team/capabilities.yaml"));
  const roleIds = new Set(team.roles.map((role) => role.id));
  assert.equal(registry.capabilities.length, 9);
  for (const capability of registry.capabilities) {
    for (const field of ["inputs", "outputs", "failure_fallback"]) {
      assert(Array.isArray(capability[field]), `${capability.id} ${field} must be an array`);
      assert(capability[field].length > 0, `${capability.id} ${field} must not be empty`);
      for (const value of capability[field]) {
        assert.equal(typeof value, "string", `${capability.id} ${field} values must be strings`);
        assert(value.trim().length > 0, `${capability.id} ${field} values must not be blank`);
      }
    }
    assert(Array.isArray(capability.allowed_roles) && capability.allowed_roles.length > 0, `${capability.id} must allow a registered role`);
    for (const roleId of capability.allowed_roles) {
      assert(roleIds.has(roleId), `${capability.id} references unknown role ${roleId}`);
    }
  }
  const byId = new Map(registry.capabilities.map((capability) => [capability.id, capability]));
  assert(byId.get("web-research").failure_fallback.includes("never-bypass-access-control"));
  assert(byId.get("site-capture").failure_fallback.includes("never-bypass-access-control"));
  assert(byId.get("brand-generation").failure_fallback.includes("never-fabricate-evidence"));
  assert(byId.get("asset-inventory").failure_fallback.includes("never-use-unverified-assets-in-production"));
  assert(byId.get("frontend-commerce-build").failure_fallback.includes("never-auto-publish"));
});

test("all seven role specs expose the complete stable contract", async () => {
  const team = await readYaml(path.join(root, "team/team.yaml"));
  const required = [
    "identity", "mission", "owns", "does_not_own", "entry_conditions",
    "required_inputs", "outputs", "self_checks", "downstream_acceptance",
    "human_approval_points", "permissions", "capabilities", "escalation_rules",
  ];
  for (const item of team.roles) {
    const role = await readRole(path.join(root, item.spec));
    assert.equal(role.frontmatter.kind, "role");
    assert.equal(role.frontmatter.id, item.id);
    for (const key of required) assert.ok(key in role.frontmatter, `${item.id} missing ${key}`);
    assert.match(role.body, /^# /);
  }
});

test("brand contract separates evidence states and reserves approval for a named human", async () => {
  const brand = await readRole(path.join(root, "team/roles/brand-content-lead.md"));
  assert.deepEqual(brand.frontmatter.content_states, [
    "observed_fact",
    "inference",
    "creative_proposal",
    "client_approved",
    "rejected",
  ]);
  assert.equal(brand.frontmatter.content_unit_status_constraint, "every-content-unit-exactly-one-status");
  assert(brand.frontmatter.self_checks.includes("every-content-unit-exactly-one-status"));
  assert(brand.frontmatter.downstream_acceptance.includes("every-content-unit-exactly-one-status"));
  assert(brand.frontmatter.outputs.includes("copy-candidate"));
  assert(brand.frontmatter.outputs.includes("client-approved-copy"));
  const promotion = brand.frontmatter.content_state_transitions.find(
    (item) => item.from === "creative_proposal" && item.to === "client_approved",
  );
  assert.equal(promotion.actor, "named-human");
  assert.deepEqual(promotion.requires, ["artifact-revision", "approval-record"]);
  assert.equal(promotion.agent_may_execute, false);
});

test("visual contract makes responsive and accessible handoff rules machine readable", async () => {
  const visual = await readRole(path.join(root, "team/roles/visual-interaction-lead.md"));
  const contract = visual.frontmatter.responsive_interaction_contract;
  assert.deepEqual(contract.continuous_change_rules, ["fluid-sizing", "fluid-spacing", "content-priority-preserved"]);
  assert.deepEqual(contract.content_reflow, ["priority-based-reordering", "no-semantic-loss"]);
  assert.deepEqual(contract.container_rules, ["max-width", "responsive-gutters", "nested-containment"]);
  assert.deepEqual(contract.text_boundaries, ["min-max-measure", "wrapping", "overflow"]);
  assert.deepEqual(contract.media_cropping, ["art-direction", "focal-point", "aspect-ratio"]);
  assert.deepEqual(contract.target_matrix, ["devices", "viewport-widths", "input-modes"]);
  assert.deepEqual(contract.state_matrix, ["default", "hover", "focus", "active", "disabled", "loading", "error", "empty"]);
  assert.deepEqual(contract.accessibility_interactions, ["keyboard", "focus", "touch", "reduced-motion"]);
  assert.deepEqual(contract.immutable_intent, ["core-cta-label", "core-cta-priority", "core-cta-destination"]);
  assert.deepEqual(contract.return_conditions, ["missing-responsive-rule", "missing-state", "inaccessible-interaction", "core-cta-change"]);
});

test("frontend and motion contracts use a two-step integration handoff without self-acceptance", async () => {
  const frontend = await readRole(path.join(root, "team/roles/frontend-commerce-lead.md"));
  const motion = await readRole(path.join(root, "team/roles/motion-3d-lead.md"));
  assert(!frontend.frontmatter.entry_conditions.includes("accepted-integration-contract"));
  assert(!frontend.frontmatter.required_inputs.includes("p5-outcome"));
  assert(frontend.frontmatter.outputs.includes("frontend-integration-boundary"));
  assert.equal(frontend.frontmatter.integration_handoff.pre_p5_output, "frontend-integration-boundary");
  assert.equal(frontend.frontmatter.integration_handoff.pre_p5_output_versioned, true);
  assert.equal(frontend.frontmatter.integration_handoff.post_p5_input, "motion-subsystem-api");
  assert.equal(frontend.frontmatter.integration_handoff.post_p5_acceptance_owner, "frontend-commerce-lead");
  assert.deepEqual(frontend.frontmatter.integration_handoff.self_acceptance_prohibited, ["frontend-integration-boundary"]);
  assert(motion.frontmatter.entry_conditions.includes("versioned-frontend-integration-boundary"));
  assert(motion.frontmatter.required_inputs.includes("frontend-integration-boundary"));
  assert(motion.frontmatter.outputs.includes("motion-subsystem-api"));
  assert.equal(motion.frontmatter.integration_handoff.input_acceptance_owner, "motion-3d-lead");
  assert.equal(motion.frontmatter.integration_handoff.output_acceptance_owner, "frontend-commerce-lead");
});

test("motion contract defines L0-L4 fallbacks and degradation mapping", async () => {
  const motion = await readRole(path.join(root, "team/roles/motion-3d-lead.md"));
  assert.deepEqual(Object.keys(motion.frontmatter.fallback_levels), ["L0", "L1", "L2", "L3", "L4"]);
  for (const level of Object.values(motion.frontmatter.fallback_levels)) {
    assert.deepEqual(level.preserves, ["core-product-understanding", "content-access", "keyboard-operation", "conversion-path"]);
    assert.ok(level.content);
    assert.ok(level.trigger);
  }
  assert.deepEqual(motion.frontmatter.degradation_mapping, {
    "prefers-reduced-motion": "L3",
    "no-webgl": "L2",
    "context-loss": "L4",
    "resource-failure": "L4",
    "slow-network": "L2",
    "low-performance-device": "L1",
  });
});
