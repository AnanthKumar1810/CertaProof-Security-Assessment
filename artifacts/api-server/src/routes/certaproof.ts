import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import {
  ApplyRemediationParams,
  CreateAssessmentBody,
  GenerateReportBody,
  GetAssessmentParams,
  GetFindingParams,
  RunRetestParams,
  RunValidationBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

const disclosure =
  "Synthetic fixture results demonstrate the workflow and do not establish vulnerabilities in the live World Monitor application.";
const modeLabel = "Demo · synthetic fixture — no live World Monitor traffic";
const environment = "demo.worldmonitor.local";

const coverageTemplate = [
  {
    area: "Authentication and session management",
    status: "not_assessed",
    plannedChecks: 4,
    completedChecks: 0,
    evidence: 0,
    limitations: "No live identity provider or production session was inspected.",
  },
  {
    area: "Authorization and access control",
    status: "not_assessed",
    plannedChecks: 4,
    completedChecks: 0,
    evidence: 0,
    limitations: "Only the synthetic watchlist ownership matrix is in scope.",
  },
  {
    area: "Input validation and data handling",
    status: "not_assessed",
    plannedChecks: 4,
    completedChecks: 0,
    evidence: 0,
    limitations: "No production request parsing or data pipeline was inspected.",
  },
  {
    area: "API security",
    status: "not_assessed",
    plannedChecks: 5,
    completedChecks: 0,
    evidence: 0,
    limitations: "The endpoint is a deterministic fixture, not a live API.",
  },
  {
    area: "Client-side security controls",
    status: "not_assessed",
    plannedChecks: 3,
    completedChecks: 0,
    evidence: 0,
    limitations: "Browser controls are represented only by the demo workspace.",
  },
  {
    area: "Secure communication mechanisms",
    status: "not_assessed",
    plannedChecks: 3,
    completedChecks: 0,
    evidence: 0,
    limitations: "Transport controls for the live deployment were not assessed.",
  },
  {
    area: "Data storage and privacy protections",
    status: "not_assessed",
    plannedChecks: 4,
    completedChecks: 0,
    evidence: 0,
    limitations: "Synthetic watchlists contain no real user data.",
  },
];

const components = [
  {
    id: "component-browser",
    name: "Browser",
    purpose: "Synthetic analyst client that supplies an identity alias to the fixture.",
    kind: "client",
    source: "reference_model",
    interfaces: ["REST /api"],
    controls: ["Client-side security controls"],
    checks: ["Controlled identity selection"],
    limitation: "Not a production World Monitor browser session.",
  },
  {
    id: "component-edge",
    name: "Edge / API gateway",
    purpose: "Reference entry point for browser requests and policy-aware routing.",
    kind: "gateway",
    source: "reference_model",
    interfaces: ["REST /api", "MCP relay"],
    controls: ["API security", "Secure communication mechanisms"],
    checks: ["Boundary and route inventory"],
    limitation: "Reference architecture only.",
  },
  {
    id: "component-service",
    name: "Watchlist service",
    purpose: "Synthetic service that checks requester identity against trusted watchlist ownership data.",
    kind: "service",
    source: "reference_model",
    interfaces: ["GET /demo-api/watchlists/watchlist-a", "JSON"],
    controls: ["Authorization and access control", "Data storage and privacy protections"],
    checks: ["Owner allow", "Cross-user deny", "Protected-content assertion"],
    limitation: "The service is implemented only inside the isolated fixture.",
  },
  {
    id: "component-data",
    name: "Cache / data layer",
    purpose: "Reference store for watchlist resources and ownership metadata.",
    kind: "data",
    source: "reference_model",
    interfaces: ["PostgreSQL", "Cache"],
    controls: ["Data storage and privacy protections"],
    checks: ["Trusted owner lookup"],
    limitation: "No production database was connected.",
  },
  {
    id: "component-sidecar",
    name: "Node.js sidecar",
    purpose: "Reference path for desktop IPC and local service orchestration.",
    kind: "sidecar",
    source: "reference_model",
    interfaces: ["Tauri IPC", "Cloud/API"],
    controls: ["Client-side security controls", "API security"],
    checks: ["IPC boundary review"],
    limitation: "Desktop coverage is not a live inspection.",
  },
];

const baseCases = [
  {
    id: "case-a-a",
    identity: "Analyst A",
    requesterAlias: "analyst-a",
    owner: "Analyst A",
    ownerAlias: "analyst-a",
    resourceId: "watchlist-a",
    policy: "A → A · Allow",
    expected: "200 OK · Watchlist A content returned to its owner",
  },
  {
    id: "case-a-b",
    identity: "Analyst A",
    requesterAlias: "analyst-a",
    owner: "Analyst B",
    ownerAlias: "analyst-b",
    resourceId: "watchlist-b",
    policy: "A → B · Deny",
    expected: "403 Forbidden · no protected content",
  },
  {
    id: "case-b-b",
    identity: "Analyst B",
    requesterAlias: "analyst-b",
    owner: "Analyst B",
    ownerAlias: "analyst-b",
    resourceId: "watchlist-b",
    policy: "B → B · Allow",
    expected: "200 OK · Watchlist B content returned to its owner",
  },
  {
    id: "case-b-a",
    identity: "Analyst B",
    requesterAlias: "analyst-b",
    owner: "Analyst A",
    ownerAlias: "analyst-a",
    resourceId: "watchlist-a",
    policy: "B → A · Deny",
    expected: "403 Forbidden · no protected content",
  },
] as const;

type ValidationRun = {
  id: string;
  matrixId?: string;
  caseId: string;
  identity: string;
  identityAlias: string;
  owner: string;
  resourceId: string;
  policy: string;
  policyVersion: string;
  status: "passed" | "failed" | "inconclusive";
  outcome: "passed" | "policy_failed" | "execution_error";
  expectedResponse: string;
  actualResponse: string;
  protectedContentReturned: boolean;
  assertions: Array<{ label: string; status: "passed" | "failed" | "error"; detail: string }>;
  request: string;
  response: string;
  origin: string;
  createdAt: string;
};

type DemoState = {
  validationRuns: ValidationRun[];
  originalMatrix?: { id: string; runIds: string[]; policyVersion: string; createdAt: string };
  lastMatrix?: { id: string; runIds: string[]; policyVersion: string; createdAt: string };
  findingConfirmed: boolean;
  remediation: { status: "proposed" | "applied" | "ready_for_retest"; appliedAt?: string };
  verification?: {
    id: string;
    findingId: string;
    status: "verified_fixed" | "still_reproducible" | "inconclusive";
    originalRunIds: string[];
    retestRunIds: string[];
    policyVersion: string;
    assertions: Array<{ label: string; status: "passed" | "failed" | "error"; detail: string }>;
    createdAt: string;
    origin: string;
  };
};

const createAssessments = () => [
  {
    id: "asm-world-monitor",
    name: "World Monitor · AuthZ review",
    target: environment,
    environment: "demo",
    authorization: "Synthetic fixture authorization · approved for demonstration",
    status: "in_progress",
    mode: "simulation",
    createdAt: "2026-09-29T08:42:00.000Z",
  },
];

let assessments = createAssessments();
let state: DemoState = {
  validationRuns: [],
  findingConfirmed: false,
  remediation: { status: "proposed" },
};
let sequence = 0;

function now() {
  return new Date().toISOString();
}

function nextId(prefix: string) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

function isBaselineCase(caseId: string) {
  return caseId === "case-a-a" || caseId === "case-b-b";
}

function isDeniedCase(caseId: string) {
  return caseId === "case-a-b" || caseId === "case-b-a";
}

function runPassed(run: ValidationRun) {
  return run.outcome === "passed";
}

function matrixConfirmed(matrix?: { runIds: string[] }) {
  if (!matrix) return false;
  const runs = matrix.runIds.map((id) => state.validationRuns.find((run) => run.id === id)).filter(Boolean) as ValidationRun[];
  const baselinesPass = runs.filter((run) => isBaselineCase(run.caseId)).every(runPassed);
  const vulnerableCase = runs.find((run) => run.caseId === "case-b-a");
  return runs.length === 4 && baselinesPass && vulnerableCase?.outcome === "policy_failed" && vulnerableCase.protectedContentReturned;
}

function findingState() {
  return state.findingConfirmed ? "confirmed" : "candidate";
}

function totalChecks() {
  return coverageTemplate.reduce((total, item) => total + item.plannedChecks, 0);
}

function completedChecks() {
  return state.lastMatrix ? 4 : 0;
}

function getCoverage() {
  return coverageTemplate.map((item) => {
    if (item.area === "Authorization and access control" && state.lastMatrix) {
      return {
        ...item,
        status: "demonstrated_fixture",
        completedChecks: 4,
        evidence: state.validationRuns.filter((run) => run.matrixId === state.lastMatrix?.id).length,
      };
    }
    return { ...item };
  });
}

function getCases() {
  return baseCases.map((item) => {
    const latest = [...state.validationRuns].reverse().find((run) => run.caseId === item.id);
    return {
      ...item,
      observed: latest?.actualResponse ?? "Not run",
      status: latest ? (latest.outcome === "passed" ? "passed" : latest.outcome === "policy_failed" ? "failed" : "inconclusive") : "not_run",
      lastRunId: latest?.id,
      lastRunAt: latest?.createdAt,
      latestRun: latest,
      vulnerable: item.id === "case-b-a" && !state.remediation.status.includes("retest") && !state.verification,
    };
  });
}

function runCase(caseId: string, matrixId?: string): ValidationRun {
  const testCase = baseCases.find((item) => item.id === caseId);
  if (!testCase) throw new Error("Validation case not found");

  const ownershipAllowed = testCase.requesterAlias === testCase.ownerAlias;
  const protectedContentReturned =
    testCase.id === "case-b-a" && state.remediation.status === "proposed";
  const actualAllowed = ownershipAllowed || protectedContentReturned;
  const passed = actualAllowed === ownershipAllowed && (!isDeniedCase(testCase.id) || !protectedContentReturned);
  const createdAt = now();
  const actualResponse = actualAllowed
    ? `HTTP/1.1 200 OK\n{\"watchlistId\":\"${testCase.resourceId}\",\"items\":[\"synthetic-item-redacted\"]}`
    : "HTTP/1.1 403 Forbidden\n{\"error\":\"forbidden\"}";
  const run: ValidationRun = {
    id: nextId("run"),
    matrixId,
    caseId: testCase.id,
    identity: testCase.identity,
    identityAlias: testCase.requesterAlias,
    owner: testCase.owner,
    resourceId: testCase.resourceId,
    policy: testCase.policy,
    policyVersion: state.remediation.status === "proposed" ? "fixture-policy-v1" : "fixture-policy-v2",
    status: passed ? "passed" : "failed",
    outcome: passed ? "passed" : "policy_failed",
    expectedResponse: testCase.expected,
    actualResponse: actualAllowed
      ? `200 OK · ${testCase.resourceId} content returned`
      : "403 Forbidden · no protected content",
    protectedContentReturned,
    assertions: [
      {
        label: "Ownership policy",
        status: passed ? "passed" : "failed",
        detail: passed ? `${testCase.policy} behaved as expected.` : `${testCase.policy} was violated.`,
      },
      {
        label: "Protected-content assertion",
        status:
          isDeniedCase(testCase.id) && protectedContentReturned
            ? "failed"
            : "passed",
        detail:
          isDeniedCase(testCase.id) && protectedContentReturned
            ? "Protected content returned although policy required denial."
            : isDeniedCase(testCase.id)
              ? "No protected watchlist content appeared in the denied response."
              : "The owner received only the synthetic resource assigned to that identity.",
      },
      {
        label: "Execution",
        status: "passed",
        detail: "Synthetic fixture request completed without an execution error.",
      },
    ],
    request: `GET /demo-api/watchlists/${testCase.resourceId} HTTP/1.1\nX-Demo-Identity: ${testCase.requesterAlias}\nHost: ${environment}`,
    response: actualResponse,
    origin: state.remediation.status === "proposed" ? "Simulated demonstration" : "Executed local fixture",
    createdAt,
  };
  state.validationRuns.push(run);
  return run;
}

function runMatrix() {
  const matrixId = nextId("matrix");
  const policyVersion = state.remediation.status === "proposed" ? "fixture-policy-v1" : "fixture-policy-v2";
  const runs = baseCases.map((item) => runCase(item.id, matrixId));
  state.lastMatrix = {
    id: matrixId,
    runIds: runs.map((run) => run.id),
    policyVersion,
    createdAt: now(),
  };
  if (!state.originalMatrix) state.originalMatrix = state.lastMatrix;
  if (matrixConfirmed(state.lastMatrix)) state.findingConfirmed = true;
  return { id: matrixId, policyVersion, createdAt: state.lastMatrix.createdAt, runs };
}

function makeEvidence(run: ValidationRun, id: string, verificationId?: string) {
  const trace = {
    id,
    findingId: "finding-001",
    testId: run.caseId,
    runId: run.id,
    verificationId,
    assessmentId: "asm-world-monitor",
    identityAlias: run.identityAlias,
    resourceId: run.resourceId,
    environment,
    origin: run.origin,
    timestamp: run.createdAt,
    revision: run.policyVersion,
    redaction: "Synthetic item values redacted · no secrets or live user data",
    expected: run.expectedResponse,
    observed: run.actualResponse,
    request: run.request,
    response: run.response,
    assertions: run.assertions.map((assertion) => `${assertion.status === "passed" ? "Passed" : "Policy failed"} · ${assertion.detail}`),
  };
  const json = JSON.stringify(trace, null, 2);
  const sha256 = crypto.createHash("sha256").update(json, "utf8").digest("hex");
  return { ...trace, sha256 };
}

function getEvidence() {
  const evidence: any[] = [];
  const original = state.originalMatrix?.runIds
    .map((id) => state.validationRuns.find((run) => run.id === id))
    .find((run) => run?.caseId === "case-b-a");
  if (original) evidence.push(makeEvidence(original, "evidence-original-b-a"));
  const retest = state.verification?.retestRunIds
    .map((id) => state.validationRuns.find((run) => run.id === id))
    .find((run) => run?.caseId === "case-b-a");
  if (retest) evidence.push(makeEvidence(retest, "evidence-retest-b-a", state.verification?.id));
  return evidence;
}

function makeFinding() {
  const confirmed = findingState() === "confirmed";
  const original = state.originalMatrix?.runIds
    .map((id) => state.validationRuns.find((run) => run.id === id))
    .find((run) => run?.caseId === "case-b-a");
  return {
    id: "finding-001",
    title: "Cross-user watchlist data returned by synthetic authorization fixture",
    category: "Authorization and access control",
    component: "Watchlist service",
    severity: "high",
    severityAssessment: "Provisional fixture severity · assessment pending for any live target",
    state: confirmed ? "confirmed" : "candidate",
    origin: confirmed ? "Simulated demonstration" : "Prepared synthetic scenario",
    updatedAt: state.lastMatrix?.createdAt ?? "2026-09-29T08:48:00.000Z",
    description:
      "The synthetic fixture returns protected Watchlist A content when Analyst B requests it, despite the ownership policy requiring a denial.",
    rationale: "A cross-user object access failure can expose private watchlists and undermine tenant isolation.",
    prerequisites: "Use the explicit synthetic endpoint with Analyst B credentials and the Watchlist A resource.",
    expected: "Deny the request and return no protected watchlist content.",
    actual: original?.actualResponse ?? "Not run",
    steps: [
      "Select Analyst B as the requesting identity.",
      "Select Watchlist A as the requested resource.",
      "Run the complete four-case matrix against GET /demo-api/watchlists/watchlist-a.",
      "Inspect the redacted response and ownership assertions.",
    ],
    cause: "The pre-remediation synthetic service path did not check trusted watchlist ownership before serializing the resource.",
    impact: "If representative of a production authorization path, a user could read another user's watchlist data.",
    remediation:
      "Derive the requester from authenticated context, load ownership from trusted stored data, and deny before serializing a watchlist when the owner does not match.",
    evidence: getEvidence(),
    verification: state.verification ? [state.verification] : [],
    remediationState: state.remediation.status,
    remediationAppliedAt: state.remediation.appliedAt,
    environment,
    assessmentId: "asm-world-monitor",
    policyVersion: state.originalMatrix?.policyVersion ?? state.lastMatrix?.policyVersion ?? "fixture-policy-v1",
    disclosure,
  };
}

function getChecklist() {
  const confirmed = findingState() === "confirmed";
  const verified = state.verification?.status === "verified_fixed";
  const retestPending = state.remediation.status !== "proposed" && !verified;
  return [
    {
      key: "test",
      label: "Test completed",
      status: state.lastMatrix ? "complete" : "pending",
      detail: state.lastMatrix ? "4-case authorization matrix executed." : "Run the full matrix to validate ownership.",
    },
    {
      key: "preserved",
      label: "Request/response preserved",
      status: state.lastMatrix ? "complete" : "pending",
      detail: state.lastMatrix ? `${getEvidence().length} trace(s) stored.` : "Raw sanitized traces are captured.",
    },
    {
      key: "assertions",
      label: "Assertions recorded",
      status: state.lastMatrix ? "complete" : "pending",
      detail: state.lastMatrix ? "Policy and data assertions evaluated." : "Awaiting matrix execution.",
    },
    {
      key: "impact",
      label: "Impact documented",
      status: confirmed ? "complete" : "pending",
      detail: confirmed ? "BOLA cross-user impact documented." : "Confirm the fixture policy failure first.",
    },
    {
      key: "remediation",
      label: "Remediation documented",
      status: state.remediation.status !== "proposed" ? "complete" : "pending",
      detail: state.remediation.status !== "proposed" ? "Fixture policy v2 applied." : "Awaiting ownership check implementation.",
    },
    {
      key: "retest",
      label: "Re-test verified",
      status: verified ? "complete" : retestPending ? "in_progress" : "pending",
      detail: verified ? "4-case re-test confirmed fix." : "Re-run the matrix after remediation.",
    },
  ];
}

function getDashboard() {
  const finding = makeFinding();
  const verified = state.verification?.status === "verified_fixed";
  const remediationPending = state.remediation.status !== "proposed" && !verified;
  const checklist = getChecklist();
  const latestRun = state.validationRuns[state.validationRuns.length - 1];
  const activity = [
    state.verification
      ? {
          id: "activity-verification",
          type: "verification",
          title: "Full re-test completed",
          detail: verified ? "All owners retain access and cross-user requests are denied." : "The re-test did not prove the fix.",
          origin: state.verification.origin,
          time: state.verification.createdAt,
        }
      : null,
    state.remediation.status !== "proposed"
      ? {
          id: "activity-remediation",
          type: "remediation",
          title: "Synthetic remediation applied",
          detail: "The fixture policy moved to v2; verification is still separate.",
          origin: "Executed local fixture",
          time: state.remediation.appliedAt,
        }
      : null,
    state.originalMatrix
      ? {
          id: "activity-validation",
          type: "validation",
          title: "Full authorization matrix completed",
          detail: finding.state === "confirmed" ? "B → A violated the deny policy and returned protected content." : "The matrix completed without a confirmed fixture finding.",
           origin: state.validationRuns.find((run) => run.id === state.originalMatrix?.runIds[0])?.origin ?? "Simulated demonstration",
           time: state.originalMatrix.createdAt,
        }
      : {
          id: "activity-scope",
          type: "scope",
          title: "Demo scope ready",
          detail: "Synthetic identities and resources are isolated.",
          origin: "Workspace",
          time: "2026-09-29T08:42:00.000Z",
        },
  ].filter(Boolean);
  return {
    openAssessments: assessments.filter((item) => item.status !== "complete").length,
    candidates: finding.state === "candidate" ? 1 : 0,
    confirmed: finding.state === "confirmed" ? 1 : 0,
    remediationPending: remediationPending ? 1 : 0,
    verified: verified ? 1 : 0,
    completedChecks: completedChecks(),
    totalChecks: totalChecks(),
    progress: Math.round((completedChecks() / totalChecks()) * 100),
    currentStep: verified ? "Report" : remediationPending ? "Re-test" : finding.state === "confirmed" ? "Remediate" : state.lastMatrix ? "Evidence" : "Validate",
    nextAction: verified
      ? "Export the report with the verification result"
      : remediationPending
        ? "Run the same four-case matrix again to verify the fix"
        : finding.state === "confirmed"
          ? "Apply the isolated fixture remediation"
          : "Run the full four-case authorization matrix",
    activity,
    checklist,
    coverage: getCoverage(),
    assessment: assessments[0],
    modeLabel,
  };
}

function getWorkspace() {
  return {
    product: "CertaProof",
    assessment: { ...assessments[0], progress: Math.round((completedChecks() / totalChecks()) * 100) },
    mode: modeLabel,
    integrations: [
      { name: "Semgrep", purpose: "Static source analysis", status: "not_connected", mode: "Not configured" },
      { name: "OWASP ZAP", purpose: "Dynamic API and web security checks", status: "not_connected", mode: "Not configured" },
      { name: "Playwright", purpose: "Browser-level validation", status: "connected", mode: "Demo adapter" },
      { name: "Gitleaks", purpose: "Secret scanning", status: "not_connected", mode: "Not configured" },
      { name: "OSV-Scanner", purpose: "Dependency vulnerability analysis", status: "not_connected", mode: "Not configured" },
      { name: "TypeScript validation engine", purpose: "Controlled authorization matrix", status: "connected", mode: "Demo adapter" },
      { name: "Redis / BullMQ", purpose: "Queued assessment execution", status: "unavailable", mode: "Unavailable" },
      { name: "PostgreSQL / Prisma", purpose: "Durable assessment state", status: "unavailable", mode: "Unavailable" },
      { name: "Evidence storage", purpose: "Redacted trace storage", status: "connected", mode: "Demo adapter" },
    ],
  };
}

router.get("/workspace", (_req, res) => res.json(getWorkspace()));
router.get("/assessments", (_req, res) =>
  res.json(assessments.map((assessment) => ({ ...assessment, progress: Math.round((completedChecks() / totalChecks()) * 100) }))),
);

router.post("/assessments", (req, res) => {
  const input = CreateAssessmentBody.parse(req.body);
  if (input.target && input.target.toLowerCase().includes("worldmonitor.app")) {
    res.status(400).json({
      error: "Target prohibited: Testing against production worldmonitor.app is forbidden. Use the isolated synthetic fixture (demo.worldmonitor.local).",
    });
    return;
  }
  const assessment = {
    id: `asm-${Date.now()}`,
    ...input,
    status: "draft",
    mode: input.environment === "authorized" ? "authorized_target" : input.environment === "local" ? "local_fixture" : "simulation",
    createdAt: now(),
  };
  assessments.unshift(assessment);
  res.status(201).json({ ...assessment, progress: 0 });
});

router.get("/assessments/:assessmentId", (req, res) => {
  const { assessmentId } = GetAssessmentParams.parse(req.params);
  const assessment = assessments.find((item) => item.id === assessmentId);
  if (!assessment) {
    res.status(404).json({ error: "Assessment not found" });
    return;
  }
  res.json({
    ...assessment,
    progress: Math.round((completedChecks() / totalChecks()) * 100),
    completedChecks: completedChecks(),
    totalChecks: totalChecks(),
    coverage: getCoverage(),
    components,
    modeLabel,
  });
});

router.get("/dashboard", (_req, res) => res.json(getDashboard()));
router.get("/validation/cases", (_req, res) => res.json(getCases()));

router.post("/validation/runs", (req, res) => {
  const input = RunValidationBody.parse(req.body);
  try {
    const run = runCase(input.caseId);
    res.status(201).json(run);
  } catch {
    res.status(404).json({ error: "Validation case not found" });
  }
});

router.post("/validation/matrix", (_req, res) => {
  res.status(201).json(runMatrix());
});

router.get("/findings", (_req, res) => res.json([makeFinding()]));
router.get("/findings/:findingId", (req, res) => {
  const { findingId } = GetFindingParams.parse(req.params);
  if (findingId !== "finding-001") {
    res.status(404).json({ error: "Finding not found" });
    return;
  }
  res.json(makeFinding());
});
router.get("/evidence", (_req, res) => res.json(getEvidence()));

router.post("/remediation/:findingId", (req, res) => {
  const { findingId } = ApplyRemediationParams.parse(req.params);
  if (findingId !== "finding-001") {
    res.status(404).json({ error: "Finding not found" });
    return;
  }
  if (findingState() !== "confirmed") {
    res.status(409).json({ error: "Run the complete authorization matrix before applying remediation." });
    return;
  }
  if (state.remediation.status !== "proposed") {
    res.json({
      findingId,
      status: state.remediation.status,
      message: "The synthetic fixture remediation is already applied. Run the full re-test to verify it.",
    });
    return;
  }
  state.remediation = { status: "ready_for_retest", appliedAt: now() };
  res.json({
    findingId,
    status: "ready_for_retest",
    message: "Synthetic fixture policy v2 is applied. Applying a fix is not verification; run the full matrix again.",
  });
});

router.post("/verification/:findingId", (req, res) => {
  const { findingId } = RunRetestParams.parse(req.params);
  if (findingId !== "finding-001") {
    res.status(404).json({ error: "Finding not found" });
    return;
  }
  if (state.remediation.status === "proposed") {
    res.status(409).json({ error: "Apply the synthetic remediation before running a re-test." });
    return;
  }
  const originalMatrix = state.lastMatrix;
  const originalRunIds = originalMatrix?.runIds ?? [];
  const matrix = runMatrix();
  const passed = matrix.runs.length === 4 && matrix.runs.every(runPassed) && matrix.runs.every((run) => !run.protectedContentReturned);
  state.verification = {
    id: nextId("verify"),
    findingId,
    status: passed ? "verified_fixed" : "still_reproducible",
    originalRunIds,
    retestRunIds: matrix.runs.map((run) => run.id),
    policyVersion: matrix.policyVersion,
    assertions: [
      { label: "Owner access", status: matrix.runs.filter((run) => isBaselineCase(run.caseId)).every(runPassed) ? "passed" : "failed", detail: "Analyst A and Analyst B retain access to their own watchlists." },
      { label: "Cross-user denial", status: matrix.runs.filter((run) => isDeniedCase(run.caseId)).every(runPassed) ? "passed" : "failed", detail: "Both cross-user requests returned a denial." },
      { label: "Protected-content assertion", status: matrix.runs.every((run) => !run.protectedContentReturned) ? "passed" : "failed", detail: "Denied responses contain no protected watchlist content." },
      { label: "Execution", status: "passed", detail: "The complete four-case matrix was re-run." },
    ],
    createdAt: now(),
    origin: "Executed local fixture",
  };
  res.status(201).json(state.verification);
});

router.post("/reports", (req, res) => {
  const input = GenerateReportBody.parse(req.body);
  const evidence = getEvidence();
  const status = evidence.length > 0 ? "ready" : "pending_evidence";
  res.status(201).json({
    id: nextId("report"),
    format: input.format,
    status,
    disclosure,
    generatedAt: now(),
    assessment: getDashboard().assessment,
    modeLabel,
    coverage: getCoverage(),
    limitations: "This is a synthetic fixture workflow. It is not evidence of a live World Monitor vulnerability.",
    findings: [makeFinding()],
    evidence,
    remediation: state.remediation,
    verification: state.verification ?? null,
  });
});

router.post("/demo/reset", (_req, res) => {
  assessments = createAssessments();
  state = { validationRuns: [], findingConfirmed: false, remediation: { status: "proposed" } };
  res.json({ status: "reset", message: "Synthetic assessment state reset to the fresh candidate." });
});

export default router;