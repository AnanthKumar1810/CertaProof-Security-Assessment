import { Router, type IRouter } from "express";
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

const coverage = [
  { area: "Authentication & session management", status: "not_assessed", checks: 3 },
  { area: "Authorization & access control", status: "confirmed", checks: 4 },
  { area: "Input validation & data handling", status: "not_assessed", checks: 4 },
  { area: "API security", status: "in_progress", checks: 5 },
  { area: "Client-side security controls", status: "not_assessed", checks: 3 },
  { area: "Secure communication", status: "not_assessed", checks: 3 },
  { area: "Data storage & privacy", status: "not_assessed", checks: 4 },
];

const components = [
  {
    id: "component-edge",
    name: "Edge / API gateway",
    purpose: "Entry point for browser requests and policy-aware routing.",
    kind: "web",
    source: "reference_model",
    interfaces: ["REST /api", "MCP relay"],
  },
  {
    id: "component-service",
    name: "Watchlist service",
    purpose: "Serves user-owned watchlists and applies resource authorization.",
    kind: "service",
    source: "reference_model",
    interfaces: ["GET /demo-api/watchlists/", "JSON"],
  },
  {
    id: "component-data",
    name: "Cache / data layer",
    purpose: "Stores watchlist resources and ownership metadata.",
    kind: "data",
    source: "reference_model",
    interfaces: ["PostgreSQL", "Cache"],
  },
  {
    id: "component-fixture",
    name: "Authorization fixture",
    purpose: "Explicitly isolated synthetic endpoint for deterministic validation.",
    kind: "fixture",
    source: "discovered",
    interfaces: ["GET /demo-api/watchlists/"],
  },
];

const assessments = [
  {
    id: "asm-world-monitor",
    name: "World Monitor · AuthZ review",
    target: "demo.worldmonitor.local",
    environment: "demo",
    authorization: "Synthetic fixture authorization · approved for demonstration",
    status: "in_progress",
    mode: "simulation",
    createdAt: "2026-09-29T08:42:00.000Z",
    progress: 38,
  },
];

const validationCases = [
  {
    id: "case-a-a",
    identity: "Analyst A",
    owner: "Analyst A",
    policy: "A → A · Allow",
    expected: "Owner can read Watchlist A",
    observed: "Watchlist A returned",
    vulnerable: false,
  },
  {
    id: "case-a-b",
    identity: "Analyst A",
    owner: "Analyst B",
    policy: "A → B · Deny",
    expected: "Cross-user request denied",
    observed: "403 · No protected content",
    vulnerable: false,
  },
  {
    id: "case-b-b",
    identity: "Analyst B",
    owner: "Analyst B",
    policy: "B → B · Allow",
    expected: "Owner can read Watchlist B",
    observed: "Watchlist B returned",
    vulnerable: false,
  },
  {
    id: "case-b-a",
    identity: "Analyst B",
    owner: "Analyst A",
    policy: "B → A · Deny",
    expected: "Deny and return no protected content",
    observed: "200 · Watchlist A content returned",
    vulnerable: true,
  },
];

let remediationApplied = false;
let latestRun:
  | {
      id: string;
      caseId: string;
      status: string;
      assertions: string[];
      request: string;
      response: string;
      origin: string;
      createdAt: string;
    }
  | undefined;
let verification:
  | {
      id: string;
      findingId: string;
      status: string;
      assertions: string[];
      createdAt: string;
      origin: string;
    }
  | undefined;

function now() {
  return new Date().toISOString();
}

function makeFinding() {
  return {
    id: "finding-001",
    title: "Cross-user watchlist data returned by authorization fixture",
    category: "Authorization & access control",
    component: "Authorization fixture",
    severity: "high",
    state: latestRun?.status === "failed" ? "confirmed" : "candidate",
    origin: "Simulated demonstration",
    updatedAt: now(),
    description:
      "The isolated synthetic fixture returns protected Watchlist A content when Analyst B requests it, despite the policy requiring a denial.",
    rationale:
      "A cross-user object access failure can expose private watchlists and undermine tenant isolation.",
    prerequisites: "Use the explicit synthetic endpoint with Analyst B credentials.",
    expected: "Deny the request and return no protected resource content.",
    actual: "The fixture returns HTTP 200 with Watchlist A data.",
    steps: [
      "Select Analyst B as the requesting identity.",
      "Select Analyst A as the resource owner.",
      "Run the controlled validation against GET /demo-api/watchlists/.",
      "Inspect the redacted response and content assertion.",
    ],
    cause: "The fixture is missing an object-permission check before serializing the resource.",
    impact: "If representative of a production authorization path, a user could read another user's watchlist data.",
    remediation:
      "Enforce resource ownership in the service layer before returning a watchlist. Denied responses must not contain protected content.",
    evidence: [
      {
        id: "evidence-001",
        findingId: "finding-001",
        testId: "case-b-a",
        runId: latestRun?.id ?? "run-pending",
        environment: "demo.worldmonitor.local",
        origin: "Simulated demonstration",
        timestamp: latestRun?.createdAt ?? "2026-09-29T08:48:00.000Z",
        revision: "fixture-r3",
        redaction: "Secrets redacted · synthetic identities only",
        request:
          "GET /demo-api/watchlists/ HTTP/1.1\nX-Demo-Identity: analyst-b\nHost: demo.worldmonitor.local",
        response: remediationApplied
          ? "HTTP/1.1 403 Forbidden\n{\"error\":\"forbidden\"}"
          : "HTTP/1.1 200 OK\n{\"watchlistId\":\"watchlist-a\",\"items\":[\"...redacted...\"]}",
        assertions: [
          "Policy A → B is deny",
          remediationApplied
            ? "Protected content absent from denied response"
            : "Protected content present in denied response",
        ],
      },
    ],
    verification: verification ? [verification] : [],
  };
}

router.get("/workspace", (_req, res) => {
  res.json({
    product: "Security Assessment of the World Monitor Application",
    assessment: assessments[0],
    mode: "Simulated demonstration",
    integrations: [
      {
        name: "OWASP ZAP",
        purpose: "Dynamic API and web security checks",
        status: "not_connected",
        mode: "Not connected",
      },
      {
        name: "Semgrep",
        purpose: "Static source analysis",
        status: "not_connected",
        mode: "Not connected",
      },
      {
        name: "Playwright",
        purpose: "Browser-level validation",
        status: "connected",
        mode: "Executed local fixture",
      },
    ],
  });
});

router.get("/assessments", (_req, res) => res.json(assessments));

router.post("/assessments", (req, res) => {
  const input = CreateAssessmentBody.parse(req.body);
  const assessment = {
    id: `asm-${Date.now()}`,
    ...input,
    status: "draft",
    mode: input.environment === "authorized" ? "authorized_target" : "simulation",
    createdAt: now(),
    progress: 0,
  };
  assessments.unshift(assessment);
  res.status(201).json(assessment);
});

router.get("/assessments/:assessmentId", (req, res) => {
  const { assessmentId } = GetAssessmentParams.parse(req.params);
  const assessment = assessments.find((item) => item.id === assessmentId);
  if (!assessment) {
    res.status(404).json({ error: "Assessment not found" });
    return;
  }
  res.json({ ...assessment, coverage, components });
});

router.get("/dashboard", (_req, res) => {
  res.json({
    openAssessments: assessments.filter((item) => item.status !== "complete").length,
    candidates: remediationApplied ? 0 : 1,
    confirmed: latestRun?.status === "failed" ? 1 : 0,
    verified: verification?.status === "verified_fixed" ? 1 : 0,
    progress: verification?.status === "verified_fixed" ? 100 : latestRun ? 72 : 38,
    activity: [
      {
        id: "activity-validation",
        type: "validation",
        title: latestRun ? "Controlled validation completed" : "Validation matrix ready",
        detail: latestRun
          ? "B → A produced a protected-content assertion"
          : "Select the cross-user case to create evidence",
        origin: "Simulated demonstration",
        time: latestRun?.createdAt ?? "09:14",
      },
      {
        id: "activity-evidence",
        type: "evidence",
        title: "Evidence trace attached",
        detail: "Redacted request and response are linked to finding-001",
        origin: "Recorded",
        time: "08:52",
      },
      {
        id: "activity-scope",
        type: "scope",
        title: "Demo scope approved",
        detail: "Synthetic identities and resources are isolated",
        origin: "Workspace",
        time: "08:42",
      },
    ],
    nextAction: verification
      ? "Export the report with the verification result"
      : remediationApplied
        ? "Run the same test again to verify the fix"
        : latestRun
          ? "Apply the demo fix without treating it as verified"
          : "Run controlled validation for the B → A case",
  });
});

router.get("/validation/cases", (_req, res) => res.json(validationCases));

router.post("/validation/runs", (req, res) => {
  const input = RunValidationBody.parse(req.body);
  const validationCase = validationCases.find((item) => item.id === input.caseId);
  if (!validationCase) {
    res.status(404).json({ error: "Validation case not found" });
    return;
  }
  const failed = validationCase.vulnerable && !remediationApplied;
  latestRun = {
    id: `run-${Date.now()}`,
    caseId: input.caseId,
    status: failed ? "failed" : "passed",
    assertions: [
      validationCase.policy,
      validationCase.expected,
      failed
        ? "Failed · protected resource content was returned"
        : "Passed · denied response contains no protected content",
    ],
    request: `GET /demo-api/watchlists/\\nX-Demo-Identity: ${validationCase.identity.toLowerCase().replace(" ", "-")}`,
    response: failed
      ? "HTTP 200 OK\\n{ watchlistId: \"watchlist-a\", items: [REDACTED] }"
      : validationCase.vulnerable
        ? "HTTP 403 Forbidden\\n{ error: \"forbidden\" }"
        : `HTTP 200 OK\\n{ watchlistId: \"watchlist-${validationCase.owner.slice(-1).toLowerCase()}\" }`,
    origin: remediationApplied ? "Executed local fixture" : "Simulated demonstration",
    createdAt: now(),
  };
  res.status(201).json(latestRun);
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

router.get("/evidence", (_req, res) => res.json(makeFinding().evidence));

router.post("/remediation/:findingId", (req, res) => {
  const { findingId } = ApplyRemediationParams.parse(req.params);
  if (findingId !== "finding-001") {
    res.status(404).json({ error: "Finding not found" });
    return;
  }
  remediationApplied = true;
  res.json({
    findingId,
    status: "ready_for_retest",
    message:
      "Demo fixture policy updated. Applying a fix is not verification; run the same test again.",
  });
});

router.post("/verification/:findingId", (req, res) => {
  const { findingId } = RunRetestParams.parse(req.params);
  if (findingId !== "finding-001") {
    res.status(404).json({ error: "Finding not found" });
    return;
  }
  const status = remediationApplied ? "verified_fixed" : "still_reproducible";
  verification = {
    id: `verify-${Date.now()}`,
    findingId,
    status,
    assertions: [
      "Owners retain access",
      "Cross-user requests are denied",
      remediationApplied
        ? "Denied responses contain no protected content"
        : "Denied response still contains protected content",
      "The complete four-case matrix was re-run",
    ],
    createdAt: now(),
    origin: remediationApplied ? "Executed local fixture" : "Simulated demonstration",
  };
  res.status(201).json(verification);
});

router.post("/reports", (req, res) => {
  const input = GenerateReportBody.parse(req.body);
  res.status(201).json({
    id: `report-${Date.now()}`,
    format: input.format,
    status: "ready",
    disclosure,
    generatedAt: now(),
  });
});

export default router;