import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../artifacts/certaproof/dist/public");
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

const disclosure =
  "Synthetic fixture results demonstrate the verification loop and do not establish vulnerabilities in the live World Monitor application (worldmonitor.app).";
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
    name: "Browser Client",
    purpose: "Synthetic analyst client that supplies an identity alias to the fixture.",
    kind: "client",
    source: "reference_model",
    interfaces: ["REST /api"],
    controls: ["Client-side security controls"],
    checks: ["Controlled identity selection"],
    limitation: "Reference model only; not a production browser session.",
  },
  {
    id: "component-edge",
    name: "Edge / API Gateway",
    purpose: "Reference entry point for browser requests and policy-aware routing.",
    kind: "gateway",
    source: "reference_model",
    interfaces: ["REST /api", "MCP relay"],
    controls: ["API security", "Secure communication mechanisms"],
    checks: ["Boundary and route inventory"],
    limitation: "Reference architecture only; live edge network was not probed.",
  },
  {
    id: "component-service",
    name: "Watchlist Service",
    purpose: "Synthetic service that checks requester identity against trusted watchlist ownership data.",
    kind: "service",
    source: "executed_fixture",
    interfaces: ["GET /demo-api/watchlists/watchlist-a", "JSON"],
    controls: ["Authorization and access control", "Data storage and privacy protections"],
    checks: ["Owner allow", "Cross-user deny", "Protected-content assertion"],
    limitation: "The service is implemented only inside the isolated fixture.",
  },
  {
    id: "component-data",
    name: "Cache / Storage Layer",
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
    name: "Node.js Sidecar",
    purpose: "Reference path for desktop IPC and local service orchestration.",
    kind: "sidecar",
    source: "reference_model",
    interfaces: ["Tauri IPC", "Cloud/API"],
    controls: ["Client-side security controls", "API security"],
    checks: ["IPC boundary review"],
    limitation: "Desktop coverage is reference architecture only.",
  },
  {
    id: "component-tauri",
    name: "Tauri Desktop Host",
    purpose: "Reference desktop client path for World Monitor desktop deployments.",
    kind: "client",
    source: "reference_model",
    interfaces: ["Tauri IPC"],
    controls: ["Client-side controls"],
    checks: ["IPC boundary validation"],
    limitation: "Desktop executable not loaded in this web assessment workspace.",
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
];

const createAssessments = () => [
  {
    id: "asm-world-monitor",
    name: "World Monitor Assessment",
    target: environment,
    environment: "demo",
    authorization: "Synthetic fixture authorization grant · Pre-approved scope",
    status: "in_progress",
    mode: "fixture",
    createdAt: "2026-09-29T08:42:00.000Z",
  },
];

let assessments = createAssessments();
let state = {
  validationRuns: [],
  findingConfirmed: false,
  remediation: { status: "proposed" },
  verification: null,
  originalMatrix: null,
  lastMatrix: null,
};
let sequence = 0;

function now() {
  return new Date().toISOString();
}

function nextId(prefix) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

function isBaselineCase(caseId) {
  return caseId === "case-a-a" || caseId === "case-b-b";
}

function isDeniedCase(caseId) {
  return caseId === "case-a-b" || caseId === "case-b-a";
}

function runPassed(run) {
  return run.outcome === "passed";
}

function matrixConfirmed(matrix) {
  if (!matrix) return false;
  const runs = matrix.runIds.map((id) => state.validationRuns.find((run) => run.id === id)).filter(Boolean);
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

function runCase(caseId, matrixId) {
  const testCase = baseCases.find((item) => item.id === caseId);
  if (!testCase) throw new Error("Validation case not found");

  const ownershipAllowed = testCase.requesterAlias === testCase.ownerAlias;
  const protectedContentReturned =
    testCase.id === "case-b-a" && state.remediation.status === "proposed";
  const actualAllowed = ownershipAllowed || protectedContentReturned;
  const passed = actualAllowed === ownershipAllowed && (!isDeniedCase(testCase.id) || !protectedContentReturned);
  const createdAt = now();
  const actualResponse = actualAllowed
    ? `HTTP/1.1 200 OK\nContent-Type: application/json\n\n{"watchlistId":"${testCase.resourceId}","owner":"${testCase.owner}","items":["SYNTHETIC-ITEM-ALPHA","SYNTHETIC-ITEM-BETA"]}`
    : `HTTP/1.1 403 Forbidden\nContent-Type: application/json\n\n{"error":"forbidden","message":"Caller identity does not own this resource"}`;
  
  const run = {
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
        label: "Ownership authorization policy",
        status: passed ? "passed" : "failed",
        detail: passed ? `${testCase.policy} behaved as expected.` : `${testCase.policy} was violated (unauthorized object disclosure).`,
      },
      {
        label: "Protected-content leakage check",
        status:
          isDeniedCase(testCase.id) && protectedContentReturned
            ? "failed"
            : "passed",
        detail:
          isDeniedCase(testCase.id) && protectedContentReturned
            ? "Protected watchlist content was returned to an unauthorized caller."
            : isDeniedCase(testCase.id)
              ? "Zero protected watchlist content was leaked in the 403 response."
              : "Owner received only their own assigned synthetic watchlist.",
      },
      {
        label: "Controlled execution",
        status: "passed",
        detail: "Executed strictly against isolated demo fixture. Zero production requests.",
      },
    ],
    request: `GET /demo-api/watchlists/${testCase.resourceId} HTTP/1.1\nHost: ${environment}\nX-Demo-Identity: ${testCase.requesterAlias}\nAuthorization: Bearer demo-synthetic-token-[REDACTED]`,
    response: actualResponse,
    origin: state.remediation.status === "proposed" ? "Executed local fixture (vulnerable)" : "Executed local fixture (remediated v2)",
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

function computeTraceSha256(traceData) {
  if (typeof traceData === "string") {
    return crypto.createHash("sha256").update(traceData, "utf8").digest("hex");
  }
  const { sha256: _excluded, ...clean } = traceData;
  const json = JSON.stringify(clean, null, 2);
  return crypto.createHash("sha256").update(json, "utf8").digest("hex");
}

function makeEvidence(run, id, verificationId) {
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
    redaction: "Synthetic tokens and sensitive headers redacted · zero live user data",
    expected: run.expectedResponse,
    observed: run.actualResponse,
    request: run.request,
    response: run.response,
    assertions: run.assertions.map((a) => `${a.status === "passed" ? "Passed" : "Policy failed"} · ${a.label}: ${a.detail}`),
  };
  trace.sha256 = computeTraceSha256(trace);
  return trace;
}

function getEvidence() {
  const evidence = [];
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
    title: "Broken Object-Level Authorization (BOLA) on Watchlist Endpoint",
    category: "Authorization and access control",
    component: "Watchlist Service",
    severity: "high",
    severityAssessment: "Qualitative fixture severity · CVSS v4.0 pending formal calculator scoring",
    state: confirmed ? "confirmed" : "candidate",
    origin: confirmed ? "Executed local fixture" : "Simulated preview",
    updatedAt: state.lastMatrix?.createdAt ?? "2026-09-29T08:48:00.000Z",
    description:
      "The synthetic fixture returns protected Watchlist A content when Analyst B requests it, despite the ownership policy requiring a denial.",
    rationale: "Cross-user object access failures undermine tenant isolation and expose confidential analyst watchlist items to unauthorized parties.",
    prerequisites: "Valid authentication token for Analyst B and the identifier for Watchlist A.",
    expected: "403 Forbidden with zero protected watchlist content returned.",
    actual: original?.actualResponse ?? "Not run",
    steps: [
      "Authenticate as Analyst B.",
      "Issue a GET request targeting Watchlist A (/demo-api/watchlists/watchlist-a).",
      "Observe that the server returns HTTP 200 OK with private Watchlist A items instead of HTTP 403.",
    ],
    cause: "The endpoint failed to verify that the authenticated requester matches the owner of the requested watchlist before serializing and returning the record.",
    impact: "If present in a live multi-user application, any authenticated user could inspect any other user's private watchlist data.",
    remediation:
      "Derive requester identity strictly from verified session context, lookup the requested object from trusted storage, and deny with uniform HTTP 403 before serializing data.",
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
  const retestPending = state.remediation.status === "ready_for_retest";
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

  const activity = [
    state.verification
      ? {
          id: "activity-verification",
          type: "verification",
          title: "Full 4-case re-test completed",
          detail: verified
            ? "Verified: B → A denied (403), legitimate owners (A → A, B → B) retain access."
            : "Re-test finished but finding remains reproducible.",
          origin: state.verification.origin,
          time: state.verification.createdAt,
        }
      : null,
    state.remediation.status !== "proposed"
      ? {
          id: "activity-remediation",
          type: "remediation",
          title: "Ownership check remediation applied",
          detail: "Synthetic fixture policy updated to v2. Verification re-test required.",
          origin: "Executed local fixture",
          time: state.remediation.appliedAt,
        }
      : null,
    state.originalMatrix
      ? {
          id: "activity-validation",
          type: "validation",
          title: "4-case authorization matrix executed",
          detail:
            finding.state === "confirmed"
              ? "B → A violated ownership policy (cross-user content leaked)."
              : "Matrix executed without confirmed fixture vulnerability.",
          origin: state.validationRuns.find((run) => run.id === state.originalMatrix?.runIds[0])?.origin ?? "Executed local fixture",
          time: state.originalMatrix.createdAt,
        }
      : {
          id: "activity-scope",
          type: "scope",
          title: "Assessment boundary initialized",
          detail: "Synthetic identities (Analyst A/B) and resources (Watchlist A/B) ready.",
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
    currentStep: verified
      ? "Report"
      : remediationPending
      ? "Re-test"
      : finding.state === "confirmed"
      ? "Remediate"
      : state.lastMatrix
      ? "Evidence"
      : "Validate",
    nextAction: verified
      ? "Export disclosed security report with verification proof"
      : remediationPending
      ? "Execute the full 4-case re-test matrix to verify resolution"
      : finding.state === "confirmed"
      ? "Apply the isolated ownership remediation"
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
    descriptor: "Evidence-based security assessment",
    tagline: "Prove. Fix. Verify.",
    assessment: { ...assessments[0], progress: Math.round((completedChecks() / totalChecks()) * 100) },
    mode: modeLabel,
    integrations: [
      { name: "Validation Engine", purpose: "Controlled 4-case authorization matrix", status: "connected", mode: "Demo adapter" },
      { name: "Playwright", purpose: "Browser-level boundary validation", status: "connected", mode: "Demo adapter" },
      { name: "Evidence Store", purpose: "Cryptographic trace storage with SHA-256", status: "connected", mode: "Demo adapter" },
      { name: "Semgrep", purpose: "Static analysis rules for AST checking", status: "not_connected", mode: "Not configured (local runner required)" },
      { name: "OWASP ZAP", purpose: "Dynamic API security boundary scanner", status: "not_connected", mode: "Not configured (local runner required)" },
      { name: "Gitleaks", purpose: "Secret and credential exposure scanner", status: "not_connected", mode: "Not configured (local runner required)" },
      { name: "OSV-Scanner", purpose: "Open-source dependency vulnerability check", status: "not_connected", mode: "Not configured (local runner required)" },
    ],
  };
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res, statusCode, data) {
  const json = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(json);
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  // Handle API routes
  if (pathname.startsWith("/api/")) {
    const apiPath = pathname.slice(4);

    if (apiPath === "/healthz" && method === "GET") {
      return sendJson(res, 200, { status: "ok" });
    }

    if (apiPath === "/workspace" && method === "GET") {
      return sendJson(res, 200, getWorkspace());
    }

    if (apiPath === "/dashboard" && method === "GET") {
      return sendJson(res, 200, getDashboard());
    }

    if (apiPath === "/assessments" && method === "GET") {
      return sendJson(
        res,
        200,
        assessments.map((assessment) => ({
          ...assessment,
          progress: Math.round((completedChecks() / totalChecks()) * 100),
        })),
      );
    }

    if (apiPath === "/assessments" && method === "POST") {
      const input = await readBody(req);
      if (input.target && input.target.toLowerCase().includes("worldmonitor.app")) {
        return sendJson(res, 400, {
          error: "Target prohibited: Testing against production worldmonitor.app is forbidden. Use the isolated synthetic fixture (demo.worldmonitor.local).",
        });
      }
      const assessment = {
        id: `asm-${Date.now()}`,
        ...input,
        status: "draft",
        mode: input.environment === "authorized" ? "authorized_target" : input.environment === "local" ? "local_fixture" : "simulation",
        createdAt: now(),
      };
      assessments.unshift(assessment);
      return sendJson(res, 201, { ...assessment, progress: 0 });
    }

    if (apiPath.startsWith("/assessments/") && method === "GET") {
      const assessmentId = apiPath.slice(13);
      const assessment = assessments.find((item) => item.id === assessmentId);
      if (!assessment) return sendJson(res, 404, { error: "Assessment not found" });
      return sendJson(res, 200, {
        ...assessment,
        progress: Math.round((completedChecks() / totalChecks()) * 100),
        completedChecks: completedChecks(),
        totalChecks: totalChecks(),
        coverage: getCoverage(),
        components,
        modeLabel,
      });
    }

    if (apiPath === "/validation/cases" && method === "GET") {
      return sendJson(res, 200, getCases());
    }

    if (apiPath === "/validation/runs" && method === "POST") {
      const input = await readBody(req);
      try {
        const run = runCase(input.caseId);
        return sendJson(res, 201, run);
      } catch {
        return sendJson(res, 404, { error: "Validation case not found" });
      }
    }

    if (apiPath === "/validation/matrix" && method === "POST") {
      return sendJson(res, 201, runMatrix());
    }

    if (apiPath === "/findings" && method === "GET") {
      return sendJson(res, 200, [makeFinding()]);
    }

    if (apiPath.startsWith("/findings/") && method === "GET") {
      const findingId = apiPath.slice(10);
      if (findingId !== "finding-001") {
        return sendJson(res, 404, { error: "Finding not found" });
      }
      return sendJson(res, 200, makeFinding());
    }

    if (apiPath === "/evidence" && method === "GET") {
      return sendJson(res, 200, getEvidence());
    }

    if (apiPath.startsWith("/remediation/") && method === "POST") {
      const findingId = apiPath.slice(13);
      if (findingId !== "finding-001") {
        return sendJson(res, 404, { error: "Finding not found" });
      }
      if (findingState() !== "confirmed") {
        return sendJson(res, 409, { error: "Run the complete authorization matrix before applying remediation." });
      }
      if (state.remediation.status !== "proposed") {
        return sendJson(res, 200, {
          findingId,
          status: state.remediation.status,
          message: "The synthetic fixture remediation is already applied. Run the full re-test to verify resolution.",
        });
      }
      state.remediation = { status: "ready_for_retest", appliedAt: now() };
      return sendJson(res, 200, {
        findingId,
        status: "ready_for_retest",
        message: "Synthetic fixture policy v2 applied. Applying a fix is not verification: execute the full 4-case re-test matrix to prove resolution.",
      });
    }

    if (apiPath.startsWith("/verification/") && method === "POST") {
      const findingId = apiPath.slice(14);
      if (findingId !== "finding-001") {
        return sendJson(res, 404, { error: "Finding not found" });
      }
      if (state.remediation.status === "proposed") {
        return sendJson(res, 409, { error: "Apply the synthetic remediation before running a re-test." });
      }
      const originalMatrix = state.lastMatrix;
      const originalRunIds = originalMatrix?.runIds ?? [];
      const matrix = runMatrix();
      
      // Verification requires:
      // 1. Cross-user access is denied
      // 2. Legitimate owners retain access (A -> A, B -> B)
      const baselinesPass = matrix.runs.filter((run) => isBaselineCase(run.caseId)).every(runPassed);
      const deniedPass = matrix.runs.filter((run) => isDeniedCase(run.caseId)).every(runPassed);
      const noContentLeaked = matrix.runs.every((run) => !run.protectedContentReturned);
      const passed = matrix.runs.length === 4 && baselinesPass && deniedPass && noContentLeaked;

      state.verification = {
        id: nextId("verify"),
        findingId,
        status: passed ? "verified_fixed" : "still_reproducible",
        originalRunIds,
        retestRunIds: matrix.runs.map((run) => run.id),
        policyVersion: matrix.policyVersion,
        assertions: [
          {
            label: "Legitimate owner access",
            status: baselinesPass ? "passed" : "failed",
            detail: baselinesPass
              ? "Analyst A and Analyst B retain full access to their own respective watchlists."
              : "Owner access broken (denying all users is not an acceptable fix).",
          },
          {
            label: "Cross-user object denial",
            status: deniedPass ? "passed" : "failed",
            detail: deniedPass
              ? "All cross-user requests (B → A, A → B) correctly return 403 Forbidden."
              : "Cross-user request succeeded without authorization.",
          },
          {
            label: "Protected-content assertion",
            status: noContentLeaked ? "passed" : "failed",
            detail: noContentLeaked
              ? "Zero protected watchlist content was leaked in denied responses."
              : "Protected watchlist data was serialized in response.",
          },
          {
            label: "Controlled 4-case re-test execution",
            status: "passed",
            detail: "The complete four-case matrix was re-executed against fixture policy v2.",
          },
        ],
        createdAt: now(),
        origin: "Executed local fixture (re-test)",
      };
      return sendJson(res, 201, state.verification);
    }

    if (apiPath === "/reports" && method === "POST") {
      const input = await readBody(req);
      const findings = [makeFinding()];
      const evidenceList = getEvidence();
      const reportStatus = evidenceList.length > 0 ? "ready" : "pending_evidence";
      return sendJson(res, 201, {
        id: nextId("report"),
        format: input.format,
        status: reportStatus,
        disclosure,
        generatedAt: now(),
        assessment: getDashboard().assessment,
        modeLabel,
        coverage: getCoverage(),
        limitations: "This report documents a controlled synthetic fixture demonstration. It does not establish vulnerabilities in the live World Monitor application.",
        findings,
        evidence: evidenceList,
        remediation: state.remediation,
        verification: state.verification ?? null,
      });
    }

    if (apiPath === "/demo/reset" && method === "POST") {
      assessments = createAssessments();
      state = {
        validationRuns: [],
        findingConfirmed: false,
        remediation: { status: "proposed" },
        verification: null,
        originalMatrix: null,
        lastMatrix: null,
      };
      return sendJson(res, 200, { status: "reset", message: "Synthetic assessment state reset to clean candidate." });
    }

    return sendJson(res, 404, { error: `Endpoint not found: ${pathname}` });
  }

  // Handle static files
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, "");
  if (safePath === "/" || safePath === "\\") {
    safePath = "/index.html";
  }

  let filePath = path.join(publicDir, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    // SPA fallback to index.html
    const indexHtml = path.join(publicDir, "index.html");
    if (fs.existsSync(indexHtml)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      fs.createReadStream(indexHtml).pipe(res);
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`CertaProof preview server running at http://localhost:${PORT}`);
});
