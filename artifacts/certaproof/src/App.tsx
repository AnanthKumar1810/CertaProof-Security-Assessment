import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Code,
  Copy,
  Database,
  Download,
  FileCheck2,
  FileText,
  Filter,
  Gauge,
  GitBranch,
  HelpCircle,
  Info,
  Layers3,
  Link as LinkIcon,
  Lock,
  LockKeyhole,
  Menu,
  Network,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  WrapText,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from "wouter";
import {
  getGetAssessmentQueryKey,
  getGetDashboardQueryKey,
  getGetFindingQueryKey,
  getGetWorkspaceQueryKey,
  getHealthCheckQueryKey,
  getListAssessmentsQueryKey,
  getListEvidenceQueryKey,
  getListFindingsQueryKey,
  getListValidationCasesQueryKey,
  useApplyRemediation,
  useCreateAssessment,
  useGenerateReport,
  useGetAssessment,
  useGetDashboard,
  useGetFinding,
  useGetWorkspace,
  useHealthCheck,
  useListAssessments,
  useListEvidence,
  useListFindings,
  useListValidationCases,
  useRunRetest,
  useRunValidation,
} from "@workspace/api-client-react";
import { ErrorBoundary } from "@/components/error-boundary";
import NotFound from "@/pages/not-found";
import { BrandLockup } from "@/components/EvidenceSeal";
import { computeSha256 } from "@/lib/hash";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5000,
    },
  },
});

// Truth-in-presentation disclosures
const DISCLOSURE_TEXT =
  "Results shown are from an isolated test fixture and do not establish vulnerabilities in the live World Monitor application.";
const MODE_FIXTURE_LABEL = "Isolated fixture: demo.worldmonitor.local · Zero production traffic";

const cx = (...items: Array<string | false | undefined | null>) => items.filter(Boolean).join(" ");

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function formatDate(value?: string) {
  if (!value) return "Not available";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(value?: string) {
  if (!value) return "Not available";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function LoadingCard() {
  return (
    <div className="card card-pad" aria-label="Loading content">
      <div className="skeleton" style={{ width: "35%", height: 16 }} />
      <div className="skeleton" style={{ width: "75%", height: 14, marginTop: 14 }} />
      <div className="skeleton" style={{ width: "55%", height: 14, marginTop: 10 }} />
    </div>
  );
}

function ErrorCard({
  retry,
  message = "Workspace endpoint unavailable. Check your local preview server.",
}: {
  retry?: () => void;
  message?: string;
}) {
  return (
    <div className="error-card" role="alert">
      <strong>Unable to reach workspace service</strong>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{message}</p>
      {retry && (
        <button className="btn btn-outline" style={{ marginTop: 14 }} onClick={retry} data-testid="button-retry">
          <RefreshCw size={13} /> Retry connection
        </button>
      )}
    </div>
  );
}

function Tag({ children, tone = "slate" }: { children: ReactNode; tone?: string }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

function Button({
  children,
  variant = "outline",
  onClick,
  testId,
  type = "button",
  disabled = false,
  style,
  ariaLabel,
  title,
}: {
  children: ReactNode;
  variant?: string;
  onClick?: () => void;
  testId: string;
  type?: "button" | "submit";
  disabled?: boolean;
  style?: CSSProperties;
  ariaLabel?: string;
  title?: string;
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant}`}
      onClick={onClick}
      disabled={disabled}
      style={style}
      data-testid={testId}
      aria-label={ariaLabel}
      title={title}
    >
      {children}
    </button>
  );
}

const statusText: Record<string, string> = {
  not_run: "Not run",
  passed: "Passed",
  failed: "Policy failed",
  policy_failed: "Policy failed",
  inconclusive: "Inconclusive",
  candidate: "Candidate signal",
  under_validation: "Under validation",
  confirmed: "Confirmed finding",
  remediation_in_progress: "Remediation in progress",
  rejected: "Rejected",
  proposed: "Proposed fix",
  applied: "Applied (Awaiting re-test)",
  ready_for_retest: "Awaiting re-test",
  verified_fixed: "Verified fixed",
  still_reproducible: "Still reproducible",
  not_assessed: "Not assessed",
  planned: "Planned (0 checks)",
  in_progress: "In progress",
  validation_required: "Validation required",
  awaiting_evidence: "Awaiting evidence",
  remediation: "Remediation",
  verified: "Verified",
  demonstrated_fixture: "Assessed (4 checks)",
  complete: "Complete",
  pending: "Pending",
};

/**
 * Honest StatusTag adhering strictly to:
 * - Amber for review / candidate / awaiting re-test
 * - Red for failed controls / still reproducible / confirmed vulnerabilities (a confirmed vulnerability is not green)
 * - Green / Teal ONLY for verified outcomes / passing controls
 * - Never communicates status using color alone (always icon + text).
 */
function StatusTag({ value }: { value?: string }) {
  const tone =
    value === "verified_fixed" || value === "verified" || value === "passed" || value === "complete" || value === "demonstrated_fixture"
      ? "teal"
      : value === "high" || value === "critical" || value === "failed" || value === "policy_failed" || value === "still_reproducible"
      ? "red"
      : value === "confirmed" || value === "candidate" || value === "under_validation" || value === "remediation_in_progress" || value === "validation_required" || value === "awaiting_evidence" || value === "remediation" || value === "in_progress" || value === "ready_for_retest" || value === "proposed" || value === "applied"
      ? "amber"
      : "slate";

  const icon =
    tone === "teal" ? (
      <CheckCircle2 size={12} aria-hidden="true" />
    ) : tone === "red" ? (
      <XCircle size={12} aria-hidden="true" />
    ) : tone === "amber" ? (
      <AlertTriangle size={12} aria-hidden="true" />
    ) : (
      <Info size={12} aria-hidden="true" />
    );

  return (
    <Tag tone={tone}>
      {icon}
      <span>{statusText[value ?? ""] ?? value?.replaceAll("_", " ") ?? "Unknown"}</span>
    </Tag>
  );
}

function AssertionRow({ assertion }: { assertion: any }) {
  const status = typeof assertion === "string" ? (assertion.toLowerCase().includes("failed") ? "failed" : "passed") : assertion.status;
  const label = typeof assertion === "string" ? assertion : `${assertion.label}: ${assertion.detail}`;
  return (
    <div className="assertion" data-status={status}>
      {status === "passed" ? (
        <CheckCircle2 size={15} aria-hidden="true" />
      ) : status === "error" || status === "failed" ? (
        <XCircle size={15} aria-hidden="true" />
      ) : (
        <AlertTriangle size={15} aria-hidden="true" />
      )}
      <span>{label}</span>
    </div>
  );
}

// Exactly 4 structured navigation groups as specified
const navGroups = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Overview", icon: Gauge },
      { href: "/assessments", label: "Assessments", icon: ClipboardCheck },
      { href: "/attack-surface", label: "Attack surface", icon: Network },
    ],
  },
  {
    label: "Verification",
    items: [
      { href: "/findings", label: "Findings", icon: AlertTriangle },
      { href: "/validation", label: "Validation", icon: ShieldCheck },
      { href: "/evidence", label: "Evidence", icon: FileCheck2 },
    ],
  },
  {
    label: "Resolution",
    items: [
      { href: "/remediation", label: "Remediation", icon: GitBranch },
      { href: "/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    label: "Utilities",
    items: [
      { href: "/settings", label: "Settings", icon: Settings2 },
      { href: "/integrations", label: "Integrations", icon: LinkIcon },
      { href: "/guide", label: "Demo guide", icon: BookOpen },
    ],
  },
];

function Shell({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const assessments = useListAssessments({ query: { queryKey: getListAssessmentsQueryKey() } });
  const currentId = location.match(/\/assessments\/([^/?]+)/)?.[1] ?? (assessments.data as any)?.[0]?.id ?? "";

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  return (
    <div className="app-shell">
      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="mobile-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 240px Desktop Sidebar */}
      <aside className={cx("sidebar", mobileOpen && "mobile-open")} aria-label="Main Navigation">
        <div className="brand-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Link href="/" data-testid="link-brand" onClick={() => setMobileOpen(false)}>
              <BrandLockup variant="dark" />
            </Link>
            {mobileOpen && (
              <button
                className="btn btn-ghost"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation drawer"
                style={{ color: "#E2E8F0", padding: 4 }}
              >
                <X size={18} />
              </button>
            )}
          </div>
          <div className="brand-tagline">Prove. Fix. Verify.</div>
        </div>

        <nav>
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/" ? location === "/" : location === item.href || location.startsWith(`${item.href}/`);
                return (
                  <Link
                    href={item.href}
                    key={item.href}
                    className={cx("nav-link", active && "active")}
                    data-testid={`link-nav-${item.label.toLowerCase().replaceAll(" ", "-")}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="nav-icon" aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <strong>World Monitor</strong>
          <span>Isolated fixture environment</span>
          <div style={{ color: "#2DD4BF", fontSize: 10, marginTop: 4, letterSpacing: "0.04em", fontWeight: 600 }}>
            ZERO PRODUCTION TRAFFIC
          </div>
        </div>
      </aside>

      {/* Main Surface */}
      <div className="main">
        {/* 64px Compact Header */}
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="btn btn-ghost mobile-toggle"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? "Close navigation drawer" : "Open navigation drawer"}
              aria-expanded={mobileOpen}
              data-testid="button-mobile-nav-toggle"
            >
              <Menu size={18} />
            </button>
            {assessments.data && (
              <select
                className="select"
                style={{ width: "auto", minWidth: 200, height: 32, padding: "2px 8px", fontSize: 13 }}
                value={currentId}
                onChange={(event) => navigate(`/assessments/${event.target.value}`)}
                aria-label="Active assessment scope"
              >
                {(assessments.data as any[]).map((assessment) => (
                  <option value={assessment.id} key={assessment.id}>
                    {assessment.name.replace(/ · SIH\d+/gi, "").replace(/SIH\d+/gi, "").trim()}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="top-actions">
            <div className="mode-badge fixture" title={MODE_FIXTURE_LABEL}>
              <span className="mode-dot" aria-hidden="true" />
              <span>Demo environment</span>
            </div>

            {/* Secondary top-bar action: New assessment */}
            {!location.startsWith("/assessments") && (
              <Link href="/assessments?new=1" className="btn btn-outline" data-testid="link-new-assessment" style={{ height: 32, fontSize: 13 }}>
                <Plus size={13} aria-hidden="true" /> New assessment
              </Link>
            )}
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}

function Page({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="content">
      <div className="page-head">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          {description && <p className="lede">{description}</p>}
        </div>
        {actions && <div className="head-actions">{actions}</div>}
      </div>
      {children}
    </main>
  );
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note: string;
}) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        <span className="metric-number">{value}</span>
        <span className="metric-note">{note}</span>
      </div>
    </div>
  );
}

function ProofStepper({ data }: { data: any }) {
  // Steps: 1. Validate, 2. Evidence, 3. Remediate, 4. Re-test, 5. Report
  const isVerified = data.activeVerified;
  const isAwaitingRetest = data.activeRemediationPending;
  const isConfirmed = data.activeFindingState === "confirmed";
  const hasExecutedRuns = data.completedChecks > 0;

  let activeStep = 0;
  if (isVerified) activeStep = 4;
  else if (isAwaitingRetest) activeStep = 3;
  else if (isConfirmed) activeStep = 2;
  else if (hasExecutedRuns) activeStep = 1;

  const steps = [
    { label: "1. Validate", desc: "4-case matrix" },
    { label: "2. Evidence", desc: "Preserve trace" },
    { label: "3. Remediate", desc: "Apply fix" },
    { label: "4. Re-test", desc: "Verify fix" },
    { label: "5. Report", desc: "Export proof" },
  ];

  return (
    <div className="proof-stepper" aria-label="Assessment Progress Pipeline">
      {steps.map((step, idx) => {
        const passed = idx < activeStep;
        const current = idx === activeStep;
        return (
          <div key={step.label} className={cx("stepper-item", passed && "passed", current && "active")}>
            <div className="stepper-circle">{passed ? <Check size={14} /> : idx + 1}</div>
            <div className="stepper-label">{step.label}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{step.desc}</div>
          </div>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------
// VIEW 1: Overview (/)
// -------------------------------------------------------------
function Overview() {
  const q = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });

  if (q.isLoading) {
    return (
      <Page eyebrow="CertaProof" title="Assessment overview" description="Loading workspace...">
        <LoadingCard />
      </Page>
    );
  }

  if (q.isError || !q.data) {
    return (
      <Page eyebrow="CertaProof" title="Assessment overview">
        <ErrorCard retry={() => q.refetch()} />
      </Page>
    );
  }

  const data: any = q.data;
  const checklistItems = data.checklist ?? [];
  const completedMilestones = checklistItems.filter((i: any) => i.status === "complete").length;
  const totalMilestones = checklistItems.length || 6;
  const milestonePercent = Math.round((completedMilestones / totalMilestones) * 100);
  const isEvidenceReady = data.activeVerified || completedMilestones >= 4;

  return (
    <Page
      eyebrow="CertaProof"
      title="Assessment overview"
      description="Validate findings, preserve evidence, and track verified fixes."
      actions={
        <Link href="/validation" className="btn btn-primary" data-testid="link-continue-validation">
          Continue validation <ArrowRight size={14} aria-hidden="true" />
        </Link>
      }
    >
      {/* Honest Presentation Banner */}
      <div className="notice-banner amber">
        <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
        <div>
          <strong>Controlled Fixture Execution:</strong> {DISCLOSURE_TEXT}
        </div>
      </div>

      {/* 5 Tabular Metrics Row */}
      <div className="metrics">
        <Metric label="Open assessments" value={data.openAssessments} note="active demo" />
        <Metric label="Potential findings" value={data.candidates} note="synthetic records" />
        <Metric label="Confirmed findings" value={data.confirmed} note="fixture evidence" />
        <Metric label="Awaiting re-test" value={data.remediationPending} note="fix applied" />
        <Metric label="Verified fixes" value={data.verified} note="full re-test only" />
      </div>

      {/* Main Grid: 60/40 Split between Active Assessment & Evidence Readiness */}
      <div className="grid-main">
        {/* Active Assessment Card (60%) */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Active assessment</h3>
              <p>Next useful action: {data.nextAction}</p>
            </div>
            <StatusTag value={data.activeVerified ? "verified_fixed" : data.activeRemediationPending ? "ready_for_retest" : data.activeFindingState} />
          </div>

          <div className="card-body">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingBottom: 14, borderBottom: "1px solid var(--border)" }}>
              <div>
                <strong style={{ fontSize: 15 }}>{data.assessment?.name?.replace(/ · SIH\d+/gi, "").replace(/SIH\d+/gi, "").trim()}</strong>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                  Target: <span className="mono">{data.assessment?.target}</span> · Scope: <Tag tone="teal">demo.local</Tag>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
                  {data.completedChecks} / {data.totalChecks}
                </span>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>checks completed</div>
              </div>
            </div>

            {/* 5-Step Proof Pipeline */}
            <ProofStepper data={data} />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Current phase: <strong style={{ color: "var(--text-primary)" }}>{data.currentStep}</strong>
              </div>
              <Link href={data.activeFindingState !== "candidate" ? "/findings/finding-001" : "/validation"} className="btn btn-outline" data-testid="link-view-finding">
                {data.activeFindingState !== "candidate" ? "Inspect finding" : "Open validation"} <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>

        {/* Evidence Readiness Checklist Card (40%) */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Evidence checklist</h3>
              <p>
                {completedMilestones} of {totalMilestones} milestones completed ({milestonePercent}%)
              </p>
            </div>
          </div>

          <div className="card-body" style={{ padding: "10px 18px" }}>
            {checklistItems.map((item: any) => (
              <div className="checklist-item" key={item.key}>
                <div className={cx("checklist-icon", item.status === "complete" && "done")}>
                  {item.status === "complete" ? <Check size={12} /> : "·"}
                </div>
                <div className="checklist-text" style={{ flex: 1 }}>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </div>
                <StatusTag value={item.status} />
              </div>
            ))}
          </div>

          <div style={{ padding: "0 18px 14px" }}>
            {!isEvidenceReady && (
              <div className="notice-banner amber" style={{ margin: "0 0 10px 0", fontSize: 12, padding: "8px 10px" }}>
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                <span>Report generation marked draft pending full proof preservation.</span>
              </div>
            )}
            <Link href="/evidence" className="btn btn-outline" style={{ width: "100%", justifyContent: "space-between" }} data-testid="link-open-evidence">
              <span>View preserved evidence traces</span>
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>

      {/* Lower Section: Seven-Domain Scope & Attributable Activity */}
      <div className="grid-2" style={{ marginTop: 24 }}>
        {/* Attributable Activity */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Attributable activity</h3>
              <p>Every logged action is linked to a clear origin</p>
            </div>
            <Link href="/evidence" className="btn btn-ghost" style={{ padding: "4px 8px", height: 28, fontSize: 12 }}>
              View all
            </Link>
          </div>
          <div className="card-body">
            {data.activity.map((item: any) => (
              <div className="activity-item" key={item.id}>
                <div className="activity-badge" />
                <div className="activity-content">
                  <div className="activity-title">{item.title}</div>
                  <div className="activity-detail">
                    {item.detail} <Tag tone="teal">{item.origin}</Tag>
                  </div>
                </div>
                <div className="activity-meta">{formatDateTime(item.time)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Seven Security Coverage Domains */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Security coverage · 7 domains</h3>
              <p>Coverage is tracked strictly against executed checks</p>
            </div>
            <Link href={`/assessments/${data.assessment?.id}`} className="btn btn-ghost" style={{ padding: "4px 8px", height: 28, fontSize: 12 }}>
              Matrix detail
            </Link>
          </div>
          <div className="card-body" style={{ padding: "8px 18px" }}>
            {data.coverage.map((area: any) => (
              <div
                key={area.area}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{area.area}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                    {area.completedChecks} / {area.plannedChecks} checks executed · {area.evidence} evidence trace(s)
                  </div>
                </div>
                <StatusTag value={area.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Page>
  );
}

// -------------------------------------------------------------
// VIEW 2: Assessments List & Wizard (/assessments)
// -------------------------------------------------------------
function Assessments() {
  const [location, navigate] = useLocation();
  const q = useListAssessments({ query: { queryKey: getListAssessmentsQueryKey() } });
  const create = useCreateAssessment();
  const [wizard, setWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [envFilter, setEnvFilter] = useState("all");

  const [form, setForm] = useState({
    name: "",
    target: "demo.worldmonitor.local",
    environment: "demo",
    authorization: "",
    acknowledged: false,
  });
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (location.includes("?new=1")) {
      setWizard(true);
      setStep(1);
    }
  }, [location]);

  const rawData: any[] = (q.data as any[]) ?? [];

  const filtered = useMemo(() => {
    return rawData.filter((item) => {
      const matchSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.target.toLowerCase().includes(search.toLowerCase()) ||
        item.id.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || item.status === statusFilter;
      const matchEnv = envFilter === "all" || item.environment === envFilter;
      return matchSearch && matchStatus && matchEnv;
    });
  }, [rawData, search, statusFilter, envFilter]);

  const handleNext = () => {
    setFormError("");
    if (step === 1) {
      if (!form.name.trim()) {
        setFormError("Assessment name is required.");
        return;
      }
      if (form.target.toLowerCase().includes("worldmonitor.app")) {
        setFormError("Target prohibited: Testing against production worldmonitor.app is forbidden. Use the isolated synthetic fixture (demo.worldmonitor.local).");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!form.authorization.trim()) {
        setFormError("Authorization reference is required (e.g. ticket number, signed scope agreement).");
        return;
      }
      setStep(3);
    }
  };

  const submit = () => {
    setFormError("");
    if (!form.acknowledged) {
      setFormError("You must acknowledge the authorized scope terms before proceeding.");
      return;
    }
    create.mutate(
      { data: form as any },
      {
        onSuccess: (assessment: any) => {
          queryClient.invalidateQueries({ queryKey: getListAssessmentsQueryKey() });
          setWizard(false);
          navigate(`/assessments/${assessment.id}`);
        },
        onError: (err: any) => {
          setFormError(err?.message ?? "Assessment creation failed.");
        },
      },
    );
  };

  if (wizard) {
    return (
      <Page
        eyebrow="Workspace / assessments / new"
        title="Create an authorized assessment"
        description="Every assessment carries strict boundary conditions, authorized scope, and environment safeguards before a single request is issued."
      >
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div className="card card-pad">
            {/* 3-Step Wizard Navigation */}
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              {[
                { num: 1, label: "1. Boundary & Target" },
                { num: 2, label: "2. Authorization" },
                { num: 3, label: "3. Review & Scope" },
              ].map((s) => (
                <div
                  key={s.num}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "var(--radius-btn)",
                    background: step === s.num ? "var(--primary-light)" : "var(--surface-subtle)",
                    border: step === s.num ? "1px solid var(--primary-border)" : "1px solid var(--border)",
                    color: step === s.num ? "var(--primary)" : "var(--text-secondary)",
                    fontWeight: step === s.num ? 600 : 500,
                    fontSize: 12,
                  }}
                >
                  {s.label}
                </div>
              ))}
            </div>

            {/* Step 1: Boundary & Target */}
            {step === 1 && (
              <div className="form-grid">
                <div className="field-full">
                  <label className="label" htmlFor="assessment-name">
                    Assessment title <span style={{ color: "var(--color-error)" }}>*</span>
                  </label>
                  <input
                    id="assessment-name"
                    className="input"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. World Monitor · Authorization & Access Boundary Review"
                    data-testid="input-assessment-name"
                  />
                </div>

                <div>
                  <label className="label" htmlFor="assessment-target">
                    Permitted target hostname <span style={{ color: "var(--color-error)" }}>*</span>
                  </label>
                  <input
                    id="assessment-target"
                    className="input"
                    value={form.target}
                    onChange={(e) => setForm({ ...form, target: e.target.value })}
                    placeholder="demo.worldmonitor.local"
                    data-testid="input-assessment-target"
                  />
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                    Permitted: <span className="mono">demo.worldmonitor.local</span> or localhost fixture
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor="assessment-environment">
                    Environment tier <span style={{ color: "var(--color-error)" }}>*</span>
                  </label>
                  <select
                    id="assessment-environment"
                    className="select"
                    value={form.environment}
                    onChange={(e) => setForm({ ...form, environment: e.target.value })}
                    data-testid="select-assessment-environment"
                  >
                    <option value="demo">Executed fixture (demo.worldmonitor.local)</option>
                    <option value="local">Local synthetic fixture</option>
                    <option value="authorized">Authorized staging (scope required)</option>
                  </select>
                </div>

                <div className="field-full">
                  <div className="notice-banner amber">
                    <Lock size={15} style={{ flexShrink: 0 }} />
                    <span>
                      <strong>Production guardrail:</strong> Live targets such as <span className="mono">worldmonitor.app</span> are rejected by security policy. Testing is restricted to controlled environments.
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Authorization */}
            {step === 2 && (
              <div>
                <label className="label" htmlFor="authorization-reference">
                  Authorization & Scope Reference <span style={{ color: "var(--color-error)" }}>*</span>
                </label>
                <textarea
                  id="authorization-reference"
                  className="textarea"
                  value={form.authorization}
                  onChange={(e) => setForm({ ...form, authorization: e.target.value })}
                  placeholder="Enter ticket ID, authorized sign-off reference, or synthetic fixture testing grant..."
                  data-testid="textarea-authorization"
                  style={{ minHeight: 120 }}
                />
                <div className="notice-banner teal" style={{ marginTop: 14 }}>
                  <Info size={15} style={{ flexShrink: 0 }} />
                  <span>
                    Valid authorization must identify testing personnel, permitted synthetic identities (Analyst A, Analyst B), and approved endpoints.
                  </span>
                </div>
              </div>
            )}

            {/* Step 3: Review with Edit Links */}
            {step === 3 && (
              <div>
                <div className="card card-pad" style={{ background: "var(--surface-subtle)", marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <strong style={{ fontSize: 15 }}>{form.name || "Untitled assessment"}</strong>
                      <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
                        Target: <span className="mono">{form.target}</span> · Environment: <Tag tone="teal">{form.environment}</Tag>
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 12, padding: "2px 8px", height: 26 }}
                      onClick={() => setStep(1)}
                    >
                      Edit target
                    </button>
                  </div>

                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      <strong>Authorization:</strong> {form.authorization || "No reference supplied"}
                    </div>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 12, padding: "2px 8px", height: 26 }}
                      onClick={() => setStep(2)}
                    >
                      Edit scope
                    </button>
                  </div>
                </div>

                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 13, userSelect: "none" }}>
                  <input
                    type="checkbox"
                    checked={form.acknowledged}
                    onChange={(e) => setForm({ ...form, acknowledged: e.target.checked })}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    I confirm that this assessment adheres to pre-approved scope and will not execute requests against unapproved production services.
                  </span>
                </label>
              </div>
            )}

            {formError && (
              <div className="notice-banner amber" style={{ marginTop: 16 }}>
                <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                <span>{formError}</span>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 22, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <Button testId="button-cancel-assessment" onClick={() => setWizard(false)}>
                Cancel
              </Button>
              <div style={{ display: "flex", gap: 8 }}>
                {step > 1 && (
                  <Button testId="button-previous-step" onClick={() => setStep(step - 1)}>
                    Back
                  </Button>
                )}
                {step < 3 ? (
                  <Button variant="primary" testId="button-next-step" onClick={handleNext}>
                    Continue <ArrowRight size={13} aria-hidden="true" />
                  </Button>
                ) : (
                  <Button variant="primary" testId="button-create-assessment" onClick={submit} disabled={create.isPending}>
                    {create.isPending ? "Creating..." : "Create assessment"} <Check size={13} aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </Page>
    );
  }

  return (
    <Page
      eyebrow="Workspace / assessments"
      title="Assessment register"
      description="Every security assessment retains its target boundary, environment classification, authorization reference, and verification status."
      actions={
        <Button variant="primary" testId="button-open-create-assessment" onClick={() => { setWizard(true); setStep(1); }}>
          <Plus size={14} aria-hidden="true" /> Scoped assessment
        </Button>
      }
    >
      {/* Search and Filters Bar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 240 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 11, color: "var(--text-muted)" }} />
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, target, or ID..."
            data-testid="input-assessments-search"
          />
        </div>
        <select
          className="select"
          style={{ width: "auto", minWidth: 150 }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          data-testid="select-assessments-status"
        >
          <option value="all">All statuses</option>
          <option value="in_progress">In progress</option>
          <option value="validation_required">Validation required</option>
          <option value="awaiting_evidence">Awaiting evidence</option>
          <option value="remediation">Remediation</option>
          <option value="ready_for_retest">Re-test pending</option>
          <option value="verified">Verified</option>
          <option value="complete">Complete</option>
          <option value="planned">Planned</option>
        </select>
        <select
          className="select"
          style={{ width: "auto", minWidth: 150 }}
          value={envFilter}
          onChange={(e) => setEnvFilter(e.target.value)}
          data-testid="select-assessments-env"
        >
          <option value="all">All environments</option>
          <option value="demo">Executed fixture</option>
          <option value="local">Local fixture</option>
          <option value="authorized">Authorized staging</option>
        </select>
      </div>

      {q.isLoading ? (
        <LoadingCard />
      ) : q.isError ? (
        <ErrorCard retry={() => q.refetch()} />
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--text-secondary)" }}>
          <ClipboardCheck size={32} style={{ margin: "0 auto 12px", color: "var(--text-muted)" }} />
          <strong>No matching assessments found</strong>
          <p style={{ fontSize: 13, marginTop: 4 }}>Try clearing search queries or active filters.</p>
          <button
            className="btn btn-outline"
            style={{ marginTop: 14 }}
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
              setEnvFilter("all");
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Assessment title</th>
                <th>Target boundary</th>
                <th>Environment</th>
                <th>Status</th>
                <th>Checks</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} data-testid={`row-assessment-${item.id}`}>
                  <td>
                    <Link href={`/assessments/${item.id}`} style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                      {item.name}
                    </Link>
                    <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      {item.id} · Created {formatDate(item.createdAt)}
                    </div>
                  </td>
                  <td>
                    <span className="mono" style={{ fontSize: 12 }}>{item.target}</span>
                  </td>
                  <td>
                    <Tag tone={item.environment === "demo" ? "teal" : "slate"}>{item.environment}</Tag>
                  </td>
                  <td>
                    <StatusTag value={item.status} />
                  </td>
                  <td>
                    <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
                      {item.completedChecks} / {item.totalChecks}
                    </span>
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <div style={{ display: "inline-flex", gap: 6 }}>
                      <Link href={`/assessments/${item.id}`} className="btn btn-outline" style={{ height: 28, padding: "2px 10px", fontSize: 12 }}>
                        View
                      </Link>
                      <Link href={item.id === "asm-world-monitor" ? "/validation" : "/findings"} className="btn btn-outline" style={{ height: 28, padding: "2px 10px", fontSize: 12 }}>
                        {item.id === "asm-world-monitor" ? "Validate" : "Findings"}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}

// -------------------------------------------------------------
// VIEW 3: Assessment Detail (/assessments/:id)
// -------------------------------------------------------------
function AssessmentDetail() {
  const { id } = useParams<{ id: string }>();
  const q = useGetAssessment(id ?? "", { query: { queryKey: getGetAssessmentQueryKey(id ?? "") } });
  const [expandedArea, setExpandedArea] = useState<string | null>(null);

  if (q.isLoading) return <Page eyebrow="Workspace / assessments" title="Assessment detail"><LoadingCard /></Page>;
  if (q.isError || !q.data) return <Page eyebrow="Workspace / assessments" title="Assessment detail"><ErrorCard retry={() => q.refetch()} /></Page>;

  const a: any = q.data;

  return (
    <Page
      eyebrow="Workspace / assessments"
      title={a.name}
      description={`${a.target} · ${a.environment} tier · ${a.authorization}`}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/assessments" className="btn btn-outline">
            All assessments
          </Link>
          <Link href={a.id === "asm-world-monitor" ? "/validation" : "/findings"} className="btn btn-primary" data-testid="link-run-validation-detail">
            {a.id === "asm-world-monitor" ? "Run validation" : "View findings"} <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      }
    >
      {/* Metadata & Authorization Envelope */}
      <div className="grid-2">
        <div className="card card-pad">
          <div className="eyebrow">Executed Checks</div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 6 }}>
            <span style={{ fontSize: 32, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {a.completedChecks} / {a.totalChecks}
            </span>
            <StatusTag value={a.status} />
          </div>
          <div style={{ height: 6, borderRadius: 4, background: "var(--border)", margin: "12px 0 8px", overflow: "hidden" }}>
            <div style={{ width: `${a.progress}%`, height: "100%", background: "var(--primary)" }} />
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {a.progress}% of planned security checks completed against the isolated fixture.
          </div>
        </div>

        <div className="card card-pad">
          <div className="eyebrow">Authorization Envelope</div>
          <div className="code-block" style={{ marginTop: 8 }}>
            {`ASSESSMENT  ${a.id}\nTARGET      ${a.target}\nTIER        ${a.environment}\nBOUNDARY    Isolated fixture: ${a.target} · Zero production traffic\nSCOPE_AUTH  ${a.authorization}`}
          </div>
        </div>
      </div>

      {/* Coverage Matrix across all 7 areas with Expandable Limitations */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head">
          <div>
            <h3>Security coverage</h3>
            <p>Seven required security domains, with honest test accounting per area</p>
          </div>
          <Tag tone="teal">7 domains</Tag>
        </div>
        <div className="card-body">
          <div className="grid-2">
            {a.coverage.map((area: any) => {
              const isExpanded = expandedArea === area.area;
              return (
                <div className="card card-pad" key={area.area} style={{ background: "var(--surface-subtle)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <strong style={{ fontSize: 14, color: "var(--text-primary)" }}>{area.area}</strong>
                    <StatusTag value={area.status} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>
                    {area.completedChecks} / {area.plannedChecks} checks executed · {area.evidence} evidence trace(s)
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 11, padding: "2px 6px", height: 24, color: "var(--text-muted)" }}
                      onClick={() => setExpandedArea(isExpanded ? null : area.area)}
                    >
                      {isExpanded ? "Hide limitations" : "View scope notes"}
                      <ChevronDown size={12} style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                    </button>
                    {isExpanded && (
                      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 }}>
                        {area.limitations}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Reference Components */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head">
          <div>
            <h3>Architecture & Components</h3>
            <p>{a.id === "asm-world-monitor" ? "Mapped against the World Monitor application reference model" : "Isolated synthetic assessment boundary"}</p>
          </div>
          <Link href="/attack-surface" className="btn btn-ghost" style={{ padding: "4px 8px", height: 28, fontSize: 12 }}>
            Open interactive map <ArrowRight size={13} />
          </Link>
        </div>
        <div className="card-body">
          <div className="grid-3">
            {a.components.map((comp: any) => (
              <div className="card card-pad" key={comp.id} style={{ background: comp.id === "component-service" ? "var(--primary-tint)" : "var(--surface-subtle)" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <Tag tone={comp.id === "component-service" ? "amber" : "slate"}>
                    {comp.id === "component-service" ? "FIXTURE TARGET" : "REFERENCE MODEL"}
                  </Tag>
                </div>
                <h3 style={{ marginTop: 10, fontSize: 15 }}>{comp.name}</h3>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{comp.purpose}</p>
                <div style={{ display: "flex", gap: 4, marginTop: 10, flexWrap: "wrap" }}>
                  {(comp.interfaces ?? []).map((iface: string) => (
                    <Tag key={iface} tone="teal">
                      {iface}
                    </Tag>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Page>
  );
}

// -------------------------------------------------------------
// VIEW 4: Attack Surface (/attack-surface)
// -------------------------------------------------------------
const surfaceNodes = [
  {
    key: "browser",
    title: "Browser Client",
    sub: "Synthetic analyst client",
    tier: "REFERENCE MODEL",
    purpose: "Simulates an analyst interacting with watchlist endpoints via browser session.",
    interfaces: ["REST /api"],
    controls: ["Client-side security controls"],
    checks: ["Identity selection integrity"],
    limitation: "Reference architecture model; not an inspected production browser.",
  },
  {
    key: "edge",
    title: "Edge / API Gateway",
    sub: "Reverse proxy · Policy router",
    tier: "REFERENCE MODEL",
    purpose: "Reference entry point handling boundary routing and authentication token validation.",
    interfaces: ["REST /api", "MCP relay"],
    controls: ["API security", "Secure communication"],
    checks: ["Route boundary inventory"],
    limitation: "Reference model only; live edge network was not probed.",
  },
  {
    key: "service",
    title: "Watchlist Service",
    sub: "Ownership policy · Target",
    tier: "EXECUTED FIXTURE",
    purpose: "Synthetic microservice that enforces authorization before serializing private watchlist objects.",
    interfaces: ["GET /demo-api/watchlists/watchlist-a", "JSON"],
    controls: ["Authorization and access control", "Data privacy"],
    checks: ["Four-case matrix", "BOLA cross-user prevention"],
    limitation: "Isolated local fixture running in-memory deterministic state.",
  },
  {
    key: "cache",
    title: "Cache / Storage Layer",
    sub: "Trusted ownership store",
    tier: "REFERENCE MODEL",
    purpose: "Reference persistent layer storing user identities, watchlist items, and permissions.",
    interfaces: ["Key-value store", "In-memory mock"],
    controls: ["Data protection", "Least privilege storage access"],
    checks: ["Storage tenant segregation"],
    limitation: "Simulated store backing the fixture mock.",
  },
  {
    key: "tauri",
    title: "Tauri Desktop Shell",
    sub: "Desktop application host",
    tier: "REFERENCE MODEL",
    purpose: "World Monitor desktop wrapper packaging the web view inside a native application envelope.",
    interfaces: ["IPC", "Native OS bindings"],
    controls: ["Desktop isolation", "IPC allowlists"],
    checks: ["IPC bridge permissions review"],
    limitation: "Evaluated from application design patterns; desktop executable was not decompiled.",
  },
  {
    key: "sidecar",
    title: "Local Agent / Sidecar",
    sub: "System telemetry aggregator",
    tier: "REFERENCE MODEL",
    purpose: "Background monitoring helper capturing desktop telemetry and proxying alerts.",
    interfaces: ["Loopback socket (127.0.0.1)", "gRPC"],
    controls: ["Loopback bind restriction", "Process privilege separation"],
    checks: ["Sidecar authorization check"],
    limitation: "Architectural component modeled for completeness.",
  },
];

function AttackSurface() {
  const [selectedKey, setSelectedKey] = useState("service");
  const selectedNode = surfaceNodes.find((n) => n.key === selectedKey) ?? surfaceNodes[2];

  return (
    <Page
      eyebrow="Workspace / attack surface"
      title="Attack surface & architecture map"
      description="Interactive architecture canvas showing the World Monitor boundary. Clearly separates the executed fixture from reference components."
      actions={
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Tag tone="teal">1 EXECUTED TARGET</Tag>
          <Tag tone="slate">5 REFERENCE NODES</Tag>
        </div>
      }
    >
      <div className="notice-banner amber">
        <AlertTriangle size={15} style={{ flexShrink: 0 }} />
        <span>
          <strong>Architecture boundary disclosure:</strong> Only the <span className="mono">Watchlist Service</span> is an executed fixture target in this demo. All other nodes reflect the documented reference architecture.
        </span>
      </div>

      {/* Structured Canvas Grid */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div>
            <h3>Component Architecture Topology</h3>
            <p>Select any component to inspect interfaces, boundary controls, and test limitations</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--primary)" }} /> Fixture Target
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginLeft: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#94A3B8" }} /> Reference Model
            </span>
          </div>
        </div>

        <div className="card-body">
          <div className="grid-3" style={{ gap: 16 }}>
            {surfaceNodes.map((node) => {
              const isSelected = node.key === selectedKey;
              const isFixture = node.tier === "EXECUTED FIXTURE";
              return (
                <div
                  key={node.key}
                  onClick={() => setSelectedKey(node.key)}
                  style={{
                    padding: 16,
                    borderRadius: "var(--radius-card)",
                    border: isSelected ? "2px solid var(--primary)" : "1px solid var(--border)",
                    background: isSelected ? "var(--primary-tint)" : isFixture ? "#FAFAFA" : "#FFFFFF",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  data-testid={`node-${node.key}`}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <Tag tone={isFixture ? "amber" : "slate"}>{node.tier}</Tag>
                    {isFixture && <Zap size={14} style={{ color: "var(--color-warning-text)" }} />}
                  </div>
                  <h3 style={{ fontSize: 15, marginTop: 8 }}>{node.title}</h3>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{node.sub}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                    Interfaces: {node.interfaces.join(", ")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected Node Inspector */}
      <div className="card card-pad" style={{ marginTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div className="eyebrow">{selectedNode.tier}</div>
            <h2>{selectedNode.title}</h2>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{selectedNode.sub}</div>
          </div>
          {selectedNode.key === "service" && (
            <Link href="/validation" className="btn btn-primary" data-testid="link-inspect-service-validation">
              Open validation matrix <ArrowRight size={13} />
            </Link>
          )}
        </div>

        <p style={{ fontSize: 14, color: "var(--text-primary)", marginTop: 14, lineHeight: 1.6 }}>
          {selectedNode.purpose}
        </p>

        <div className="grid-3" style={{ marginTop: 16 }}>
          <div>
            <div className="eyebrow">Exposed Interfaces</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
              {selectedNode.interfaces.map((iface) => (
                <span className="mono" key={iface} style={{ fontSize: 12, background: "var(--surface-subtle)", padding: "2px 8px", borderRadius: 4, border: "1px solid var(--border)" }}>
                  {iface}
                </span>
              ))}
            </div>
          </div>

          <div>
            <div className="eyebrow">Relevant Controls</div>
            <div style={{ marginTop: 6 }}>
              {selectedNode.controls.map((ctrl) => (
                <div key={ctrl} style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                  • {ctrl}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="eyebrow">Security Checks</div>
            <div style={{ marginTop: 6 }}>
              {selectedNode.checks.map((chk) => (
                <div key={chk} style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                  • {chk}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <div className="eyebrow">Scope Limitation & Audit Transparency</div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            {selectedNode.limitation}
          </p>
        </div>
      </div>
    </Page>
  );
}

// -------------------------------------------------------------
// VIEW 5: Validation (/validation)
// Full-width 4-case matrix across top; selected-case inspector below with 3 tabs
// -------------------------------------------------------------
function Validation() {
  const casesQuery = useListValidationCases({ query: { queryKey: getListValidationCasesQueryKey() } });
  const run = useRunValidation();
  const cases: any[] = (casesQuery.data as any[]) ?? [];

  const [selected, setSelected] = useState<string>("case-bob-cross-user");
  const [activeTab, setActiveTab] = useState<"request" | "response" | "assertions">("request");
  const [lastRun, setLastRun] = useState<any>(null);
  const [feedback, setFeedback] = useState<{ tone: "teal" | "amber" | "red"; text: string } | null>(null);
  const [matrixBusy, setMatrixBusy] = useState(false);

  useEffect(() => {
    if (cases.length && !cases.some((c) => c.id === selected)) {
      setSelected(cases[0].id);
    }
  }, [cases, selected]);

  const selectedCase = cases.find((c) => c.id === selected) ?? cases[0] ?? {
    id: "case-bob-cross-user",
    policy: "BOLA / Broken Object-Level Authorization",
    identity: "Analyst B (Non-owner)",
    requesterAlias: "bob-analyst",
    owner: "alice-analyst",
    resourceId: "watchlist-a",
    expected: "403 Forbidden · deny access to non-owned watchlist",
  };

  const displayedRun = lastRun ?? selectedCase.latestRun;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListValidationCasesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListEvidenceQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListFindingsQueryKey() });
  };

  const runSingleCase = () => {
    run.mutate(
      { data: { caseId: selectedCase.id } },
      {
        onSuccess: (result: any) => {
          setLastRun(result);
          const passed = result.outcome === "passed";
          setFeedback({
            tone: passed ? "teal" : "amber",
            text: `Executed ${selectedCase.id}: Observed ${result.actualResponse}. Outcome: ${passed ? "Policy passed" : "Policy failed (demonstrated signal)"}`,
          });
          invalidate();
        },
        onError: (err: any) => {
          setFeedback({ tone: "red", text: err?.message ?? "Execution failed." });
        },
      },
    );
  };

  const runFullMatrix = async () => {
    setMatrixBusy(true);
    setFeedback(null);
    try {
      const results: any[] = [];
      for (const item of cases) {
        const res = await apiPost<any>("/validation/run", { caseId: item.id });
        results.push(res);
      }
      invalidate();
      const last = results[results.length - 1];
      setLastRun(last);
      const passedCount = results.filter((r) => r.outcome === "passed").length;
      setFeedback({
        tone: passedCount === results.length ? "teal" : "amber",
        text: `Full 4-case matrix complete. ${passedCount} passed, ${results.length - passedCount} demonstrated access boundary failure.`,
      });
    } catch (err: any) {
      setFeedback({ tone: "red", text: err?.message ?? "Matrix execution failed." });
    } finally {
      setMatrixBusy(false);
    }
  };

  if (casesQuery.isLoading) {
    return <Page eyebrow="Verification / validation" title="Controlled validation workbench"><LoadingCard /></Page>;
  }

  return (
    <Page
      eyebrow="Verification / validation"
      title="Controlled validation workbench"
      description="Run the four-case ownership matrix against the isolated fixture. Verify legitimate owner access while safely demonstrating cross-user object access failures."
      actions={
        <div className="head-actions">
          <Tag tone="amber">
            <LockKeyhole size={12} /> ISOLATED FIXTURE ONLY
          </Tag>
          <Button variant="primary" onClick={runFullMatrix} testId="button-run-full-matrix" disabled={matrixBusy || run.isPending}>
            {matrixBusy ? "Executing matrix..." : "Run full 4-case matrix"} <Zap size={14} />
          </Button>
        </div>
      }
    >
      <div className="notice-banner amber">
        <AlertTriangle size={15} style={{ flexShrink: 0 }} />
        <span>
          <strong>Pre-authorized testing only:</strong> Requests execute strictly against the deterministic fixture (<span className="mono">demo.worldmonitor.local</span>). No production traffic is emitted.
        </span>
      </div>

      {feedback && (
        <div className={`notice-banner ${feedback.tone}`} style={{ marginTop: 16 }} role="status">
          <Info size={14} style={{ flexShrink: 0 }} />
          <span>{feedback.text}</span>
        </div>
      )}

      {/* TOP: Full-width 4-Case Matrix Table */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div>
            <h3>Authorization validation matrix (4 Cases)</h3>
            <p>Select any case to inspect acting identity, expected decision, and execution trace</p>
          </div>
          <Button
            variant="outline"
            onClick={runSingleCase}
            testId="button-run-validation"
            disabled={run.isPending || matrixBusy}
            style={{ height: 32, fontSize: 13 }}
          >
            {run.isPending ? "Executing..." : "Run selected case"} <Zap size={13} />
          </Button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Case / Policy</th>
                <th>Acting identity</th>
                <th>Resource / Owner</th>
                <th>Expected decision</th>
                <th>Observed decision</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const isSelected = selected === c.id;
                const latest = c.latestRun;
                return (
                  <tr
                    key={c.id}
                    onClick={() => {
                      setSelected(c.id);
                      setLastRun(c.latestRun ?? null);
                      setFeedback(null);
                    }}
                    style={{ cursor: "pointer", background: isSelected ? "var(--primary-tint)" : undefined }}
                    data-testid={`row-case-${c.id}`}
                  >
                    <td>
                      <strong style={{ display: "block", color: "var(--text-primary)" }}>{c.policy}</strong>
                      <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {c.id}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{c.identity}</div>
                      <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {c.requesterAlias}
                      </span>
                    </td>
                    <td>
                      <div className="mono" style={{ fontSize: 12 }}>{c.resourceId}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Owner: {c.owner}</div>
                    </td>
                    <td style={{ fontSize: 13 }}>{c.expected}</td>
                    <td style={{ fontSize: 13 }}>
                      {latest?.actualResponse ? (
                        <span className="mono" style={{ fontWeight: 600 }}>{latest.actualResponse}</span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>Not run</span>
                      )}
                    </td>
                    <td>
                      <StatusTag value={latest ? (latest.outcome === "passed" ? "passed" : "policy_failed") : "not_run"} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* BOTTOM: Full-width Selected-Case Inspector with Tabs */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head">
          <div>
            <h3>
              {selectedCase.id}: {selectedCase.policy}
            </h3>
            <p>
              Acting: <strong style={{ color: "var(--text-primary)" }}>{selectedCase.identity}</strong> ({selectedCase.requesterAlias}) · Target: <span className="mono">{selectedCase.resourceId}</span>
            </p>
          </div>
          {displayedRun && (
            <StatusTag value={displayedRun.outcome ?? displayedRun.status} />
          )}
        </div>

        {/* Tab Controls */}
        <div style={{ display: "flex", gap: 8, padding: "0 20px", borderBottom: "1px solid var(--border)" }}>
          <button
            className="btn btn-ghost"
            style={{
              borderRadius: "4px 4px 0 0",
              borderBottom: activeTab === "request" ? "2px solid var(--primary)" : "2px solid transparent",
              color: activeTab === "request" ? "var(--primary)" : "var(--text-secondary)",
              fontWeight: activeTab === "request" ? 600 : 500,
            }}
            onClick={() => setActiveTab("request")}
          >
            Request payload
          </button>
          <button
            className="btn btn-ghost"
            style={{
              borderRadius: "4px 4px 0 0",
              borderBottom: activeTab === "response" ? "2px solid var(--primary)" : "2px solid transparent",
              color: activeTab === "response" ? "var(--primary)" : "var(--text-secondary)",
              fontWeight: activeTab === "response" ? 600 : 500,
            }}
            onClick={() => setActiveTab("response")}
          >
            Response payload
          </button>
          <button
            className="btn btn-ghost"
            style={{
              borderRadius: "4px 4px 0 0",
              borderBottom: activeTab === "assertions" ? "2px solid var(--primary)" : "2px solid transparent",
              color: activeTab === "assertions" ? "var(--primary)" : "var(--text-secondary)",
              fontWeight: activeTab === "assertions" ? 600 : 500,
            }}
            onClick={() => setActiveTab("assertions")}
          >
            Assertions evaluated
          </button>
        </div>

        <div className="card-body">
          {displayedRun ? (
            <div>
              {activeTab === "request" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div className="eyebrow">Captured HTTP Request</div>
                    <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>ID: {displayedRun.id}</span>
                  </div>
                  <div className="code-block">
                    {displayedRun.request}
                  </div>
                </div>
              )}

              {activeTab === "response" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div className="eyebrow">Fixture HTTP Response</div>
                    <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>Origin: {displayedRun.origin}</span>
                  </div>
                  <div className="code-block">
                    {displayedRun.response}
                  </div>
                </div>
              )}

              {activeTab === "assertions" && (
                <div>
                  <div className="eyebrow" style={{ marginBottom: 10 }}>Evaluated Security Assertions</div>
                  {(displayedRun.assertions ?? []).map((assertion: any, idx: number) => (
                    <AssertionRow assertion={assertion} key={`${displayedRun.id}-${idx}`} />
                  ))}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Captured at {formatDateTime(displayedRun.createdAt)}
                </span>
                <Link href="/evidence" className="btn btn-outline" data-testid="link-capture-run">
                  Inspect in Evidence viewer <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ padding: "32px 0", textAlign: "center", color: "var(--text-muted)" }}>
              <Terminal size={28} style={{ margin: "0 auto 8px", color: "var(--text-muted)" }} />
              <div>No execution trace captured for this case yet.</div>
              <p style={{ fontSize: 13, marginTop: 4 }}>Click "Run selected case" or "Run full 4-case matrix" above.</p>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}

// -------------------------------------------------------------
// VIEW 6: Findings Register (/findings)
// -------------------------------------------------------------
function Findings() {
  const q = useListFindings({ query: { queryKey: getListFindingsQueryKey() } });
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");

  const data: any[] = (q.data as any[]) ?? [];

  const filtered = useMemo(() => {
    return data
      .filter((f) => `${f.title} ${f.category} ${f.component} ${f.id}`.toLowerCase().includes(search.toLowerCase()))
      .filter((f) => severityFilter === "all" || f.severity === severityFilter)
      .filter((f) => stateFilter === "all" || f.state === stateFilter);
  }, [data, search, severityFilter, stateFilter]);

  if (q.isLoading) return <Page eyebrow="Verification / findings" title="Findings register"><LoadingCard /></Page>;
  if (q.isError) return <Page eyebrow="Verification / findings" title="Findings register"><ErrorCard retry={() => q.refetch()} /></Page>;

  return (
    <Page
      eyebrow="Verification / findings"
      title="Findings register"
      description="Suspected vulnerabilities remain candidates until controlled validation, preserved evidence traces, and impact rationale confirm them."
      actions={
        <Link href="/validation" className="btn btn-primary" data-testid="link-new-validation">
          Run validation <ArrowRight size={14} />
        </Link>
      }
    >
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 240 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 11, color: "var(--text-muted)" }} />
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, category, component, or ID..."
            data-testid="input-findings-search"
          />
        </div>
        <select
          className="select"
          style={{ width: "auto", minWidth: 140 }}
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          data-testid="select-findings-severity"
        >
          <option value="all">All severities</option>
          <option value="high">High severity</option>
          <option value="medium">Medium severity</option>
          <option value="low">Low severity</option>
        </select>
        <select
          className="select"
          style={{ width: "auto", minWidth: 140 }}
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          data-testid="select-findings-state"
        >
          <option value="all">All states</option>
          <option value="candidate">Candidate</option>
          <option value="under_validation">Under validation</option>
          <option value="confirmed">Confirmed</option>
          <option value="remediation_in_progress">Remediation in progress</option>
          <option value="ready_for_retest">Awaiting re-test</option>
          <option value="verified_fixed">Verified fixed</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--text-secondary)" }}>
          <AlertTriangle size={32} style={{ margin: "0 auto 12px", color: "var(--text-muted)" }} />
          <strong>No findings match your criteria</strong>
          <p style={{ fontSize: 13, marginTop: 4 }}>Try clearing search keywords or active filters.</p>
        </div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Finding title</th>
                <th>Category</th>
                <th>Component</th>
                <th>Severity</th>
                <th>State</th>
                <th>Origin</th>
                <th>Last updated</th>
                <th aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} data-testid={`row-finding-${item.id}`}>
                  <td>
                    <Link href={`/findings/${item.id}`} style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                      {item.title}
                    </Link>
                    <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      {item.id}
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: 13 }}>{item.category}</span>
                  </td>
                  <td>
                    <span className="mono" style={{ fontSize: 12 }}>{item.component}</span>
                  </td>
                  <td>
                    <StatusTag value={item.severity} />
                  </td>
                  <td>
                    <StatusTag value={item.state} />
                  </td>
                  <td>
                    <Tag tone="teal">{item.origin}</Tag>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {formatDate(item.updatedAt)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Link href={`/findings/${item.id}`} className="btn btn-outline" style={{ height: 28, padding: "2px 10px", fontSize: 12 }}>
                      Inspect
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}

// -------------------------------------------------------------
// VIEW 7: Finding Detail (/findings/:id)
// Two-column layout: broad main column + narrow sidebar column
// -------------------------------------------------------------
function FindingDetail() {
  const { id } = useParams<{ id: string }>();
  const q = useGetFinding(id ?? "", { query: { queryKey: getGetFindingQueryKey(id ?? "") } });

  if (q.isLoading) return <Page eyebrow="Verification / findings" title="Finding details"><LoadingCard /></Page>;
  if (q.isError || !q.data) return <Page eyebrow="Verification / findings" title="Finding details"><ErrorCard retry={() => q.refetch()} /></Page>;

  const finding: any = q.data;

  // Determine next action button matching state
  const nextAction =
    finding.id !== "finding-001" ? (
      <Link href={`/assessments/${finding.assessmentId}`} className="btn btn-primary" data-testid="link-next-action">
        View assessment <ArrowRight size={14} />
      </Link>
    ) : finding.state === "confirmed" && finding.remediationState === "proposed" ? (
      <Link href="/remediation" className="btn btn-primary" data-testid="link-next-action">
        Apply remediation <ArrowRight size={14} />
      </Link>
    ) : finding.remediationState === "applied" ? (
      <Link href="/remediation" className="btn btn-primary" data-testid="link-next-action">
        Run verification re-test <ArrowRight size={14} />
      </Link>
    ) : finding.state === "verified_fixed" ? (
      <Link href="/reports" className="btn btn-primary" data-testid="link-next-action">
        Export verified report <FileText size={14} />
      </Link>
    ) : (
      <Link href="/validation" className="btn btn-primary" data-testid="link-next-action">
        Execute validation matrix <Zap size={14} />
      </Link>
    );

  return (
    <Page
      eyebrow="Verification / findings"
      title={finding.title}
      description={`${finding.id} · ${finding.category} · Target: ${finding.component}`}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/findings" className="btn btn-outline">
            All findings
          </Link>
          {nextAction}
        </div>
      }
    >
      <div className="grid-main">
        {/* Main Column (60%): Overview, Proof of Weakness, Trace */}
        <div>
          <div className="card card-pad">
            <div className="eyebrow">Finding Overview & Description</div>
            <p style={{ fontSize: 14, color: "var(--text-primary)", marginTop: 8, lineHeight: 1.6 }}>
              {finding.description}
            </p>

            <div style={{ marginTop: 16 }}>
              <div className="eyebrow">Root Cause Rationale</div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.55 }}>
                {finding.rootCause}
              </p>
            </div>
          </div>

          {/* Validation Runs & Captured Evidence */}
          <div className="card card-pad" style={{ marginTop: 20 }}>
            <div className="card-head" style={{ padding: 0, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
              <div>
                <h3>Validation proof & run traces</h3>
                <p>{(finding.validationRuns ?? []).length} run(s) logged against the isolated fixture</p>
              </div>
              <Tag tone="teal">{finding.origin}</Tag>
            </div>

            <div style={{ marginTop: 14 }}>
              {(finding.validationRuns ?? []).map((run: any) => (
                <div key={run.id} style={{ marginBottom: 16, padding: 14, background: "var(--surface-subtle)", borderRadius: "var(--radius-card)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{run.id}</span>
                    <StatusTag value={run.outcome ?? run.status} />
                  </div>
                  <div className="code-block" style={{ marginTop: 10 }}>
                    {run.request}
                    {"\n\n"}
                    {run.response}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    {(run.assertions ?? []).map((a: any, i: number) => (
                      <AssertionRow assertion={a} key={i} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar Column (40%): Impact, Severity, Remediation summary */}
        <div>
          <div className="card card-pad">
            <div className="eyebrow">State & Lifecycle</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Finding status:</span>
              <StatusTag value={finding.state} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Remediation:</span>
              <StatusTag value={finding.remediationState} />
            </div>

            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
              <div className="eyebrow">Severity & Impact Assessment</div>
              <div style={{ marginTop: 6 }}>
                <StatusTag value={finding.severity} />
              </div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.5 }}>
                {finding.severityAssessment}
              </p>
            </div>
          </div>

          <div className="card card-pad" style={{ marginTop: 20 }}>
            <div className="eyebrow">Recommended Remediation</div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.55 }}>
              {finding.remediation}
            </p>
            <Link href={finding.id === "finding-001" ? "/remediation" : `/assessments/${finding.assessmentId}`} className="btn btn-primary" style={{ width: "100%", marginTop: 16 }} data-testid="link-remediate-finding">
              {finding.id === "finding-001" ? "Open remediation workflow" : "View demo assessment"} <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </div>
    </Page>
  );
}

// -------------------------------------------------------------
// VIEW 8: Technical Evidence Viewer (/evidence)
// Compact trace list (~300px) on left, spacious inspector on right with tabs
// -------------------------------------------------------------
function Evidence() {
  const q = useListEvidence({ query: { queryKey: getListEvidenceQueryKey() } });
  const data: any[] = (q.data as any[]) ?? [];
  const [selected, setSelected] = useState("");
  const [activeTab, setActiveTab] = useState<"request" | "response" | "assertions" | "metadata">("request");
  const [wrapLines, setWrapLines] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [shaHash, setShaHash] = useState<string>("");

  useEffect(() => {
    if (data.length && !data.some((item) => item.id === selected)) {
      setSelected(data[0].id);
    }
  }, [data, selected]);

  const evidence = data.find((item) => item.id === selected) ?? data[0];

  const evidencePayload = useMemo(() => {
    if (!evidence) return "";
    return JSON.stringify(
      {
        id: evidence.id,
        findingId: evidence.findingId,
        testId: evidence.testId,
        runId: evidence.runId,
        identityAlias: evidence.identityAlias,
        resourceId: evidence.resourceId,
        environment: evidence.environment,
        origin: evidence.origin,
        timestamp: evidence.timestamp,
        revision: evidence.revision,
        redaction: evidence.redaction,
        expected: evidence.expected,
        observed: evidence.observed,
        request: evidence.request,
        response: evidence.response,
        assertions: evidence.assertions,
      },
      null,
      2,
    );
  }, [evidence]);

  useEffect(() => {
    if (evidencePayload) {
      computeSha256(evidencePayload).then((hash) => setShaHash(hash));
    } else {
      setShaHash("");
    }
  }, [evidencePayload]);

  const copy = async () => {
    if (!evidencePayload) return;
    await navigator.clipboard?.writeText(evidencePayload);
    setFeedback("Evidence JSON copied to clipboard.");
    setTimeout(() => setFeedback(""), 3000);
  };

  const download = () => {
    if (!evidence || !evidencePayload) return;
    downloadText(`${evidence.id}.json`, evidencePayload, "application/json");
    setFeedback("Evidence trace file downloaded.");
    setTimeout(() => setFeedback(""), 3000);
  };

  if (q.isLoading) return <Page eyebrow="Verification / evidence" title="Technical evidence viewer"><LoadingCard /></Page>;
  if (q.isError) return <Page eyebrow="Verification / evidence" title="Technical evidence viewer"><ErrorCard retry={() => q.refetch()} /></Page>;

  return (
    <Page
      eyebrow="Verification / evidence"
      title="Technical evidence viewer"
      description="Preserved, cryptographic evidence traces for review: raw sanitized request, response, assertions, redaction notice, and origin."
      actions={
        <div className="head-actions">
          <Button variant="outline" testId="button-copy-evidence" onClick={copy} disabled={!evidence}>
            <Copy size={14} /> Copy JSON
          </Button>
          <Button variant="outline" testId="button-download-evidence" onClick={download} disabled={!evidence}>
            <Download size={14} /> Download trace
          </Button>
          <Button variant="outline" testId="button-export-evidence" onClick={() => window.print()} disabled={!evidence}>
            <Printer size={14} /> Print / PDF
          </Button>
        </div>
      }
    >
      {feedback && (
        <div className="notice-banner teal" style={{ marginBottom: 16 }} role="status">
          <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
          <span>{feedback}</span>
        </div>
      )}

      <div className="detail-layout">
        {/* Left Column: Compact Trace List (~300px) */}
        <div className="card" style={{ height: "fit-content" }}>
          <div className="card-head">
            <div>
              <h3>Preserved traces</h3>
              <p>{data.length} trace(s) stored</p>
            </div>
            <Tag tone="teal">AUDIT LOG</Tag>
          </div>

          <div>
            {data.length > 0 ? (
              data.map((item) => {
                const isSelected = selected === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelected(item.id)}
                    className={cx("case-card", isSelected && "selected")}
                    style={{ borderRadius: 0, margin: 0, borderTop: 0, borderLeft: 0, borderRight: 0 }}
                    data-testid={`button-evidence-${item.id}`}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong className="mono" style={{ fontSize: 13 }}>{item.id}</strong>
                      <Tag tone="teal">{item.origin}</Tag>
                    </div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                      Case: {item.testId} · Run: {item.runId}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                      {formatDateTime(item.timestamp)}
                    </div>
                  </button>
                );
              })
            ) : (
              <div style={{ textAlign: "center", padding: "36px 16px", color: "var(--text-muted)" }}>
                <FileCheck2 size={24} style={{ margin: "0 auto 8px", color: "var(--primary)" }} />
                <div>No evidence captured yet.</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  Execute the 4-case matrix in the Validation tab.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Spacious Inspector with Tabs & Wrap-Lines Toggle */}
        {evidence ? (
          <div>
            <div className="card">
              <div className="card-head">
                <div>
                  <div className="eyebrow">Cryptographic Trace Record</div>
                  <h2 className="mono" style={{ fontSize: 18, marginTop: 2 }}>{evidence.id}</h2>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    className="btn btn-outline"
                    style={{ height: 28, fontSize: 11, padding: "2px 8px" }}
                    onClick={() => setWrapLines(!wrapLines)}
                    title={wrapLines ? "Disable line wrapping" : "Enable line wrapping"}
                  >
                    <WrapText size={13} /> {wrapLines ? "Wrap: On" : "Wrap: Off"}
                  </button>
                  <Tag tone="teal">{evidence.origin}</Tag>
                </div>
              </div>

              {/* SHA-256 Fingerprint Badge */}
              <div style={{ padding: "10px 20px", background: "var(--surface-subtle)", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ShieldCheck size={14} style={{ color: "var(--primary)" }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>SHA-256:</span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--primary)", wordBreak: "break-all" }}>
                    {shaHash || "Computing fingerprint..."}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  Immutable hash calculated via Web Crypto API
                </span>
              </div>

              {/* Tab Navigation */}
              <div style={{ display: "flex", gap: 8, padding: "0 20px", borderBottom: "1px solid var(--border)" }}>
                {(["request", "response", "assertions", "metadata"] as const).map((tab) => (
                  <button
                    key={tab}
                    className="btn btn-ghost"
                    style={{
                      borderRadius: "4px 4px 0 0",
                      borderBottom: activeTab === tab ? "2px solid var(--primary)" : "2px solid transparent",
                      color: activeTab === tab ? "var(--primary)" : "var(--text-secondary)",
                      fontWeight: activeTab === tab ? 600 : 500,
                      textTransform: "capitalize",
                    }}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="card-body">
                {activeTab === "request" && (
                  <div>
                    <div className="eyebrow" style={{ marginBottom: 6 }}>Sanitized Request Header & Body</div>
                    <pre
                      className="code-block"
                      style={{ whiteSpace: wrapLines ? "pre-wrap" : "pre" }}
                    >
                      {evidence.request}
                    </pre>
                  </div>
                )}

                {activeTab === "response" && (
                  <div>
                    <div className="eyebrow" style={{ marginBottom: 6 }}>Captured Response Body</div>
                    <pre
                      className="code-block"
                      style={{ whiteSpace: wrapLines ? "pre-wrap" : "pre" }}
                    >
                      {evidence.response}
                    </pre>
                  </div>
                )}

                {activeTab === "assertions" && (
                  <div>
                    <div className="eyebrow" style={{ marginBottom: 8 }}>Evaluated Verification Assertions</div>
                    {(evidence.assertions ?? []).map((assertion: string) => (
                      <AssertionRow assertion={assertion} key={assertion} />
                    ))}
                  </div>
                )}

                {activeTab === "metadata" && (
                  <div>
                    <div className="grid-2" style={{ gap: 16 }}>
                      <div>
                        <div className="eyebrow">Case / Test ID</div>
                        <div className="mono" style={{ fontSize: 13, marginTop: 2 }}>{evidence.testId}</div>
                      </div>
                      <div>
                        <div className="eyebrow">Run ID</div>
                        <div className="mono" style={{ fontSize: 13, marginTop: 2 }}>{evidence.runId}</div>
                      </div>
                      <div>
                        <div className="eyebrow">Acting Identity</div>
                        <div className="mono" style={{ fontSize: 13, marginTop: 2 }}>{evidence.identityAlias}</div>
                      </div>
                      <div>
                        <div className="eyebrow">Target Resource</div>
                        <div className="mono" style={{ fontSize: 13, marginTop: 2 }}>{evidence.resourceId}</div>
                      </div>
                      <div>
                        <div className="eyebrow">Environment Tier</div>
                        <div style={{ fontSize: 13, marginTop: 2 }}>{evidence.environment}</div>
                      </div>
                      <div>
                        <div className="eyebrow">Preservation Timestamp</div>
                        <div style={{ fontSize: 13, marginTop: 2 }}>{formatDateTime(evidence.timestamp)}</div>
                      </div>
                    </div>

                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                      <div className="eyebrow">Redaction Notice</div>
                      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                        {evidence.redaction || "All bearer tokens and synthetic credentials masked prior to disk persistence."}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>
            Select an evidence trace on the left to inspect details.
          </div>
        )}
      </div>
    </Page>
  );
}

// -------------------------------------------------------------
// VIEW 9: Remediation & Re-test (/remediation)
// -------------------------------------------------------------
function Remediation() {
  const q = useGetFinding("finding-001", { query: { queryKey: getGetFindingQueryKey("finding-001") } });
  const apply = useApplyRemediation();
  const retest = useRunRetest();
  const [feedback, setFeedback] = useState<{ tone: "teal" | "amber" | "red"; text: string } | null>(null);

  if (q.isLoading) return <Page eyebrow="Resolution / remediation" title="Remediation & verification"><LoadingCard /></Page>;
  if (q.isError || !q.data) return <Page eyebrow="Resolution / remediation" title="Remediation & verification"><ErrorCard retry={() => q.refetch()} /></Page>;

  const finding: any = q.data;
  const verification = finding.verification?.[0];
  const canApply = finding.state === "confirmed" && finding.remediationState === "proposed";
  const canRetest = finding.remediationState !== "proposed";
  const isVerified = finding.state === "verified_fixed";

  const invalidate = () => queryClient.invalidateQueries();

  const doApply = () => {
    apply.mutate(
      { findingId: "finding-001" },
      {
        onSuccess: (result) => {
          setFeedback({
            tone: "teal",
            text: result.message ?? "Fixture remediation applied. Policy updated to v2. Verification re-test required.",
          });
          invalidate();
        },
        onError: (err: any) =>
          setFeedback({ tone: "amber", text: err?.message ?? "Applying remediation failed." }),
      },
    );
  };

  const doRetest = () => {
    retest.mutate(
      { findingId: "finding-001" },
      {
        onSuccess: (result) => {
          const isFixed = result.status === "verified_fixed";
          setFeedback({
            tone: isFixed ? "teal" : "amber",
            text: isFixed
              ? "Re-test successful! All 4 matrix cases passed: cross-user access denied AND legitimate owners retain access."
              : "Re-test completed, but cross-user access remains reproducible.",
          });
          invalidate();
        },
        onError: (err: any) =>
          setFeedback({ tone: "amber", text: err?.message ?? "Re-test execution failed." }),
      },
    );
  };

  return (
    <Page
      eyebrow="Resolution / remediation"
      title="Remediation & re-test verification"
      description="Applying a fix updates the fixture policy, but does not verify resolution. Verification requires repeating the same 4-case matrix to prove cross-user denial while preserving owner access."
      actions={
        <Tag tone="amber">
          <LockKeyhole size={12} /> FIXTURE REMEDIATION ONLY
        </Tag>
      }
    >
      {/* 4-Step Remediation Workflow Banner */}
      <div className="proof-stepper" style={{ marginBottom: 20 }}>
        {[
          { num: 1, title: "1. Diagnose signal", done: true },
          { num: 2, title: "2. Apply fix", done: finding.remediationState !== "proposed" },
          { num: 3, title: "3. Re-test matrix", done: isVerified },
          { num: 4, title: "4. Verify fix", done: isVerified },
        ].map((s) => (
          <div key={s.num} className={cx("stepper-item", s.done && "passed")}>
            <div className="stepper-circle">{s.done ? <Check size={14} /> : s.num}</div>
            <div className="stepper-label">{s.title}</div>
          </div>
        ))}
      </div>

      {feedback && (
        <div className={`notice-banner ${feedback.tone}`} style={{ marginBottom: 16 }} role="status">
          <Info size={14} style={{ flexShrink: 0 }} />
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="detail-layout">
        {/* Left Column: Finding Summary & Remediation Code */}
        <div>
          <div className="card card-pad">
            <div className="eyebrow">Target Finding</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
              <strong style={{ fontSize: 15 }}>{finding.title}</strong>
              <StatusTag value={finding.state} />
            </div>
            <div className="notice-banner teal" style={{ marginTop: 12 }}>
              <Info size={14} style={{ flexShrink: 0 }} />
              <span>
                <strong>Boundary Rule:</strong> Applying this fix updates the synthetic fixture (<span className="mono">fixture-policy-v2</span>). It cannot alter production systems.
              </span>
            </div>
          </div>

          <div className="card card-pad" style={{ marginTop: 16 }}>
            <div className="eyebrow">Proposed Authorization Fix</div>
            <h2 style={{ fontSize: 18, marginTop: 4 }}>Verify trusted ownership before serialization</h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.55 }}>
              Derive the requesting identity from authenticated context. Retrieve the requested resource from trusted storage and deny with uniform 403 Forbidden before serializing any private watchlist content.
            </p>

            <div className="code-block" style={{ marginTop: 14 }}>
              {`// Remediation: Enforce object-level access control\nconst requester = authenticatedContext.subject;\nconst resource = await trustedStore.watchlists.findById(resourceId);\n\nif (!resource || resource.ownerId !== requester) {\n  // Uniform denial without disclosing item existence\n  return response.status(403).json({ error: "forbidden" });\n}\n\nreturn response.status(200).json(serialize(resource));`}
            </div>

            {/* Context-aware primary action button */}
            <div style={{ marginTop: 16 }}>
              {isVerified ? (
                <Link href="/reports" className="btn btn-primary" data-testid="link-export-report-from-remediation">
                  Export verified audit report <FileText size={14} />
                </Link>
              ) : finding.remediationState === "proposed" ? (
                <Button
                  variant="primary"
                  onClick={doApply}
                  testId="button-apply-remediation"
                  disabled={!canApply || apply.isPending}
                >
                  {apply.isPending ? "Applying fix..." : "Apply isolated fixture fix"}
                  <GitBranch size={14} />
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={doRetest}
                  testId="button-run-retest"
                  disabled={retest.isPending}
                >
                  {retest.isPending ? "Executing full re-test..." : "Run full 4-case re-test"}
                  <CheckCircle2 size={14} />
                </Button>
              )}
            </div>

            {!canApply && finding.state !== "confirmed" && !isVerified && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                Must execute validation and confirm the finding before applying remediation.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Verification & Re-test Status */}
        <div>
          <div className="card card-pad">
            <div className="card-head" style={{ padding: 0, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
              <div>
                <h3>Verification status</h3>
                <p>Applying a fix does not equal verification</p>
              </div>
              <RefreshCw size={15} className="muted" />
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>1. Finding State</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Candidate → Confirmed</div>
                </div>
                <StatusTag value={finding.state} />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>2. Remediation</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Proposed → Applied</div>
                </div>
                <StatusTag value={finding.remediationState} />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>3. Verification</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Controlled 4-case re-test</div>
                </div>
                <StatusTag value={verification?.status ?? (isVerified ? "verified_fixed" : "not_run")} />
              </div>

              <Button
                variant="primary"
                onClick={doRetest}
                testId="button-run-retest-side"
                disabled={!canRetest || retest.isPending}
                style={{ width: "100%", marginTop: 16 }}
              >
                {retest.isPending ? "Executing full re-test..." : "Run full 4-case re-test"} <CheckCircle2 size={14} />
              </Button>

              {!canRetest && (
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6, textAlign: "center" }}>
                  Apply the isolated fixture fix before running verification.
                </div>
              )}
            </div>
          </div>

          {/* Verification Trace Comparison */}
          {verification && (
            <div className="card card-pad" style={{ marginTop: 16 }}>
              <div className="eyebrow">Re-test Proof vs Original Failure</div>
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <span>Original failed run:</span>
                  <span className="mono">{verification.originalRunIds?.join(", ") || "run-bob-cross-user-001"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <span>Re-test runs:</span>
                  <span className="mono">{verification.retestRunIds?.join(", ") || "retest-all-cases"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <span>Verified policy:</span>
                  <span className="mono">{verification.policyVersion}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0" }}>
                  <span>Completed at:</span>
                  <span>{formatDateTime(verification.createdAt)}</span>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="eyebrow">Re-test Assertions</div>
                {(verification.assertions ?? []).map((assertion: any) => (
                  <AssertionRow assertion={assertion} key={assertion.label} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}

// -------------------------------------------------------------
// VIEW 10: Reports (/reports)
// Export format selector beside document-style preview
// -------------------------------------------------------------
function Reports() {
  const generate = useGenerateReport();
  const evidenceQuery = useListEvidence({ query: { queryKey: getListEvidenceQueryKey() } });
  const [format, setFormat] = useState("markdown");
  const [report, setReport] = useState<any>(null);
  const [feedback, setFeedback] = useState("");

  const evidenceList = (evidenceQuery.data as any[]) ?? [];
  const hasEvidence = evidenceList.length > 0;

  // Generate draft or final report payload
  useEffect(() => {
    generate.mutate(
      { data: { format: format as any } },
      {
        onSuccess: (res) => setReport(res),
      },
    );
  }, [format]);

  const handleDownload = () => {
    if (!report) return;
    if (format === "pdf") {
      window.print();
      return;
    }
    const ext = format === "markdown" ? "md" : format === "json" ? "json" : format === "sarif" ? "sarif.json" : "html";
    const mime = format === "json" || format === "sarif" ? "application/json" : "text/plain";
    downloadText(`certaproof-report.${ext}`, report.content ?? JSON.stringify(report, null, 2), mime);
    setFeedback(`Downloaded report in ${format.toUpperCase()} format.`);
    setTimeout(() => setFeedback(""), 3000);
  };

  return (
    <Page
      eyebrow="Resolution / reports"
      title="Security assessment report"
      description="Export audit-ready evidence packages or review the document preview before distribution."
      actions={
        <div className="head-actions">
          <Button variant="outline" testId="button-print-report" onClick={() => window.print()}>
            <Printer size={14} /> Print / Save as PDF
          </Button>
          <Button variant="primary" testId="button-download-report" onClick={handleDownload} disabled={!report}>
            <Download size={14} /> Download {format.toUpperCase()}
          </Button>
        </div>
      }
    >
      {/* Evidence Readiness Gate */}
      {!hasEvidence ? (
        <div className="notice-banner amber">
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span>
            <strong>Report Gate:</strong> No cryptographic evidence traces have been preserved yet. The exported report is marked as a <strong>DRAFT</strong> until the 4-case matrix is executed.
          </span>
        </div>
      ) : report?.status === "draft" ? (
        <div className="notice-banner amber">
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span>
            <strong>Draft Report:</strong> Verification re-test is not yet complete. This document is marked as an interim assessment.
          </span>
        </div>
      ) : (
        <div className="notice-banner teal">
          <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
          <span>
            <strong>Audit-Ready:</strong> All evidence traces preserved and cryptographic signatures verified. Ready for audit export.
          </span>
        </div>
      )}

      {feedback && (
        <div className="notice-banner teal" style={{ marginTop: 12 }} role="status">
          <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
          <span>{feedback}</span>
        </div>
      )}

      <div className="detail-layout" style={{ marginTop: 16 }}>
        {/* Left: Export Selector Card */}
        <div className="card card-pad" style={{ height: "fit-content" }}>
          <div className="eyebrow">Export Configuration</div>
          <div style={{ marginTop: 10 }}>
            <label className="label" htmlFor="select-report-format">Select format</label>
            <select
              id="select-report-format"
              className="select"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              data-testid="select-report-format"
            >
              <option value="markdown">Markdown (.md)</option>
              <option value="json">Structured JSON (.json)</option>
              <option value="sarif">OASIS SARIF 2.1.0 (.sarif)</option>
              <option value="html">Self-contained HTML (.html)</option>
              <option value="pdf">Print / PDF view</option>
            </select>
          </div>

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
            <div className="eyebrow">Inclusions</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>
              <div style={{ marginBottom: 4 }}>• Boundary & Scope statement</div>
              <div style={{ marginBottom: 4 }}>• 7-Domain Security Matrix</div>
              <div style={{ marginBottom: 4 }}>• Confirmed Findings with Traces</div>
              <div style={{ marginBottom: 4 }}>• Cryptographic SHA-256 Signatures</div>
              <div>• Re-test Verification Status</div>
            </div>
          </div>
        </div>

        {/* Right: Document-Style Preview */}
        <div className="card card-pad report-document" style={{ background: "#FFFFFF" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid var(--border)", paddingBottom: 16 }}>
            <div>
              <BrandLockup variant="light" />
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                Evidence-Based Security Assessment Report
              </div>
            </div>
            <Tag tone={report?.status === "ready" ? "teal" : "amber"}>
              {report?.status === "ready" ? "AUDIT READY" : "DRAFT ASSIGNMENT"}
            </Tag>
          </div>

          <div style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 20 }}>Assessment: World Monitor</h2>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              Target: <span className="mono">demo.worldmonitor.local</span> · Tier: Executed fixture
            </div>
          </div>

          <div className="notice-banner amber" style={{ marginTop: 14 }}>
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span>{DISCLOSURE_TEXT}</span>
          </div>

          <div style={{ marginTop: 20 }}>
            <h3 style={{ fontSize: 15, borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>1. Seven-Domain Scope Coverage</h3>
            <table style={{ width: "100%", fontSize: 12, marginTop: 8 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "6px 0" }}>Security Domain</th>
                  <th style={{ textAlign: "left" }}>Status</th>
                  <th style={{ textAlign: "right" }}>Checks Executed</th>
                </tr>
              </thead>
              <tbody>
                {(report?.coverage ?? [
                  { area: "Authorization and access control", status: "demonstrated_fixture", completedChecks: 4, plannedChecks: 4 },
                  { area: "Client-side security controls", status: "not_assessed", completedChecks: 0, plannedChecks: 3 },
                  { area: "API security", status: "not_assessed", completedChecks: 0, plannedChecks: 4 },
                  { area: "Data privacy and leakage", status: "not_assessed", completedChecks: 0, plannedChecks: 3 },
                  { area: "Session management", status: "not_assessed", completedChecks: 0, plannedChecks: 3 },
                  { area: "Secure communication", status: "not_assessed", completedChecks: 0, plannedChecks: 2 },
                  { area: "Third-party integrations", status: "not_assessed", completedChecks: 0, plannedChecks: 2 },
                ]).map((c: any) => (
                  <tr key={c.area} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "6px 0" }}>{c.area}</td>
                    <td><StatusTag value={c.status} /></td>
                    <td style={{ textAlign: "right" }} className="mono">{c.completedChecks} / {c.plannedChecks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 20 }}>
            <h3 style={{ fontSize: 15, borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>2. Findings & Preserved Proof</h3>
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>finding-001: Broken Object-Level Authorization (BOLA) in Watchlist API</strong>
                <StatusTag value="confirmed" />
              </div>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                Cross-user access permitted: Analyst B retrieved watchlist-a owned by Analyst A.
              </p>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <h3 style={{ fontSize: 15, borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>3. Verification Status</h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>
              {report?.status === "ready"
                ? "Full four-case matrix successfully executed following policy remediation. All four cases satisfied policy criteria."
                : "Awaiting final four-case re-test verification."}
            </p>
          </div>
        </div>
      </div>
    </Page>
  );
}

// -------------------------------------------------------------
// VIEW 11: Integrations (/integrations)
// Grouped into Demo adapters, External tools, Unavailable infrastructure
// -------------------------------------------------------------
function Integrations() {
  const q = useGetWorkspace({ query: { queryKey: getGetWorkspaceQueryKey() } });

  if (q.isLoading) return <Page eyebrow="Utilities / integrations" title="Tool integration status"><LoadingCard /></Page>;
  if (q.isError || !q.data) return <Page eyebrow="Utilities / integrations" title="Tool integration status"><ErrorCard retry={() => q.refetch()} /></Page>;

  const demoAdapters = [
    {
      name: "Deterministic Fixture Runner",
      category: "Demo adapter",
      purpose: "Executes synthetic 4-case authorization matrix requests against demo.worldmonitor.local.",
      status: "connected",
      mode: "In-memory isolated test fixture",
    },
  ];

  const externalTools = [
    {
      name: "OWASP ZAP",
      category: "External tool",
      purpose: "Automated dynamic application security scanner for web applications and REST APIs.",
      status: "not_configured",
      mode: "Requires local daemon (http://localhost:8080)",
    },
    {
      name: "Burp Suite Professional",
      category: "External tool",
      purpose: "Interception proxy and manual penetration testing suite for web security assessments.",
      status: "not_configured",
      mode: "Requires Burp REST API extension & license",
    },
    {
      name: "Semgrep SAST",
      category: "External tool",
      purpose: "Static code analysis engine scanning source code repositories for security flaws.",
      status: "not_configured",
      mode: "Requires CLI executable in path",
    },
    {
      name: "SonarQube Quality Gate",
      category: "External tool",
      purpose: "Continuous code quality and security vulnerability dashboard.",
      status: "not_configured",
      mode: "Requires SonarQube server token",
    },
  ];

  const infrastructure = [
    {
      name: "Authorized Staging Connector",
      category: "Staging infrastructure",
      purpose: "Secure mutual-TLS tunnel to an authorized non-production staging deployment.",
      status: "unavailable",
      mode: "Requires bilateral scope agreement & signed connector grant",
    },
    {
      name: "Cloud SIEM Audit Relay",
      category: "Audit infrastructure",
      purpose: "Cryptographic forwarding of assessment trace events to cloud log collectors.",
      status: "unavailable",
      mode: "Requires enterprise compliance connector",
    },
  ];

  return (
    <Page
      eyebrow="Utilities / integrations"
      title="Security tool integrations"
      description="Clear, honest connection status. Working demo adapters are clearly separated from external tools that require local configuration."
      actions={<Tag tone="teal">AUDIT DISCLOSURE</Tag>}
    >
      {/* Group 1: Working Demo Adapters */}
      <div>
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>Working Demo Adapters (Connected)</h3>
        <div className="grid-2">
          {demoAdapters.map((item) => (
            <div className="card card-pad" key={item.name}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "var(--radius-btn)",
                      background: "var(--primary-tint)",
                      display: "grid",
                      placeItems: "center",
                      color: "var(--primary)",
                    }}
                  >
                    <Database size={16} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 14 }}>{item.name}</h3>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{item.purpose}</div>
                  </div>
                </div>
                <Tag tone="teal">Connected</Tag>
              </div>

              <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--text-secondary)" }}>Operational mode:</span>
                <strong>{item.mode}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Group 2: External Tools (Not Configured) */}
      <div style={{ marginTop: 28 }}>
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>External Security Tools (Not Configured)</h3>
        <div className="grid-2">
          {externalTools.map((item) => (
            <div className="card card-pad" key={item.name}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "var(--radius-btn)",
                      background: "var(--surface-subtle)",
                      display: "grid",
                      placeItems: "center",
                      color: "var(--text-muted)",
                    }}
                  >
                    <Code size={16} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 14 }}>{item.name}</h3>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{item.purpose}</div>
                  </div>
                </div>
                <Tag tone="slate">Not configured</Tag>
              </div>

              <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--text-secondary)" }}>Requirement:</span>
                <span style={{ color: "var(--text-muted)" }}>{item.mode}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Group 3: Unavailable Infrastructure */}
      <div style={{ marginTop: 28 }}>
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>Staging Infrastructure (Unavailable in Demo)</h3>
        <div className="grid-2">
          {infrastructure.map((item) => (
            <div className="card card-pad" key={item.name}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "var(--radius-btn)",
                      background: "var(--surface-subtle)",
                      display: "grid",
                      placeItems: "center",
                      color: "var(--text-muted)",
                    }}
                  >
                    <Lock size={16} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 14 }}>{item.name}</h3>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{item.purpose}</div>
                  </div>
                </div>
                <Tag tone="slate">Unavailable</Tag>
              </div>

              <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--text-secondary)" }}>Prerequisite:</span>
                <span style={{ color: "var(--text-muted)" }}>{item.mode}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Page>
  );
}

// -------------------------------------------------------------
// VIEW 12: Settings (/settings)
// Accessible React Modal Dialog replaces window.confirm()
// -------------------------------------------------------------
function Settings() {
  const workspace = useGetWorkspace({ query: { queryKey: getGetWorkspaceQueryKey() } });
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });
  const [demoMode, setDemoMode] = useState(true);
  const [redactData, setRedactData] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Focus trap / escape key for modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showResetModal) {
        setShowResetModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showResetModal]);

  const confirmReset = async () => {
    setIsResetting(true);
    try {
      await apiPost("/demo/reset");
      await queryClient.invalidateQueries();
      setShowResetModal(false);
      setFeedback("Demo reset successful. The workspace is back to a clean candidate state.");
      setTimeout(() => setFeedback(""), 4000);
    } catch (err: any) {
      setFeedback(err?.message ?? "Reset failed.");
    } finally {
      setIsResetting(false);
    }
  };

  if (workspace.isLoading) return <Page eyebrow="Utilities / settings" title="Workspace controls"><LoadingCard /></Page>;
  if (workspace.isError || !workspace.data) return <Page eyebrow="Utilities / settings" title="Workspace controls"><ErrorCard retry={() => workspace.refetch()} /></Page>;

  return (
    <Page
      eyebrow="Utilities / settings"
      title="Workspace controls & safeguards"
      description="Manage execution safeguards, evidence redaction policies, and synthetic state resets."
    >
      {feedback && (
        <div className="notice-banner teal" style={{ marginBottom: 16 }} role="status">
          <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
          <span>{feedback}</span>
        </div>
      )}

      {/* Accessible Reset Modal Dialog */}
      {showResetModal && (
        <div className="modal-backdrop" onClick={() => setShowResetModal(false)} role="presentation">
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-modal-title"
            aria-describedby="reset-modal-description"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <AlertTriangle size={20} style={{ color: "var(--color-error)" }} />
                <h3 id="reset-modal-title">Reset demonstration state?</h3>
              </div>
              <button
                className="btn btn-ghost"
                onClick={() => setShowResetModal(false)}
                aria-label="Close dialog"
                style={{ padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" id="reset-modal-description">
              <p style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.6 }}>
                This action will reset the synthetic assessment to its clean candidate state:
              </p>
              <ul style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, paddingLeft: 20 }}>
                <li>All captured execution runs and traces will be cleared</li>
                <li>The fixture authorization policy will revert to v1 (vulnerable)</li>
                <li>Finding state will revert from Verified Fixed to Candidate</li>
                <li>Preserved evidence traces will be purged</li>
              </ul>
              <div className="notice-banner amber" style={{ marginTop: 14, fontSize: 12 }}>
                <Info size={14} style={{ flexShrink: 0 }} />
                <span>This only affects local demo memory. No external systems are modified.</span>
              </div>
            </div>

            <div className="modal-foot">
              <Button
                variant="outline"
                testId="button-cancel-reset"
                onClick={() => setShowResetModal(false)}
                disabled={isResetting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                testId="button-confirm-reset"
                onClick={confirmReset}
                disabled={isResetting}
              >
                {isResetting ? "Resetting state..." : "Confirm & reset demo"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid-2">
        {/* Workspace Health & Isolation Perimeter */}
        <div className="card card-pad">
          <div className="eyebrow">Perimeter Safeguards</div>
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <div>
                <strong>Local API Health</strong>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Endpoint connectivity check</div>
              </div>
              <StatusTag value={health.data?.status === "ok" ? "complete" : "inconclusive"} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <div>
                <strong>Execution Perimeter</strong>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Strict isolation policy</div>
              </div>
              <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
                SYNTHETIC FIXTURE
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0" }}>
              <div>
                <strong>Production Traffic Guard</strong>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>worldmonitor.app rejection</div>
              </div>
              <Tag tone="teal">ACTIVE ENFORCED</Tag>
            </div>
          </div>
        </div>

        {/* Data Hygiene & Danger Zone */}
        <div className="card card-pad">
          <div className="eyebrow">Data Hygiene & Resets</div>
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <div>
                <strong>Enforce simulation perimeter</strong>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Block any egress beyond fixture</div>
              </div>
              <input type="checkbox" checked={demoMode} onChange={(e) => setDemoMode(e.target.checked)} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <div>
                <strong>Redact sensitive tokens in evidence</strong>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Mask headers and item values</div>
              </div>
              <input type="checkbox" checked={redactData} onChange={(e) => setRedactData(e.target.checked)} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0" }}>
              <div>
                <strong>Reset demonstration state</strong>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Clear all runs and re-test evidence</div>
              </div>
              <Button variant="danger" testId="button-reset-demo" onClick={() => setShowResetModal(true)}>
                <RefreshCw size={13} /> Reset state
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}

// -------------------------------------------------------------
// VIEW 13: Demo Guide (/guide)
// 3-Phase Journey with dynamic "Continue walkthrough" button
// -------------------------------------------------------------
function Guide() {
  const dashQuery = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });
  const data: any = dashQuery.data;

  // Determine current incomplete phase
  let currentPhase = 1;
  let nextHref = "/assessments/asm-world-monitor";
  let actionLabel = "Phase 1: Establish scope";

  if (data) {
    if (data.activeVerified) {
      currentPhase = 4;
      nextHref = "/reports";
      actionLabel = "View audit report";
    } else if (data.activeRemediationPending) {
      currentPhase = 3;
      nextHref = "/remediation";
      actionLabel = "Phase 3: Run re-test";
    } else if (data.activeFindingState === "confirmed") {
      currentPhase = 2;
      nextHref = "/remediation";
      actionLabel = "Phase 2: Apply fix";
    } else if (data.completedChecks > 0) {
      currentPhase = 2;
      nextHref = "/validation";
      actionLabel = "Continue validation";
    } else {
      currentPhase = 1;
      nextHref = "/validation";
      actionLabel = "Phase 1: Run matrix";
    }
  }

  const steps = [
    {
      n: "01",
      title: "Establish boundary & prove",
      copy: "Open the active assessment on demo.worldmonitor.local. Execute the four-case matrix to safely prove BOLA cross-user access failure on Analyst B.",
      href: "/validation",
      done: (data?.completedChecks ?? 0) >= 4,
    },
    {
      n: "02",
      title: "Apply isolated fix",
      copy: "Apply the trusted ownership check in the remediation workbench to update fixture policy to v2. Verify that this only affects the demo fixture.",
      href: "/remediation",
      done: data?.remediationPending > 0 || data?.verified > 0,
    },
    {
      n: "03",
      title: "Verify fix & export report",
      copy: "Execute the controlled 4-case re-test: verify cross-user denial while ensuring owners retain access. Export the audit-ready evidence package.",
      href: "/reports",
      done: (data?.verified ?? 0) > 0,
    },
  ];

  return (
    <Page
      eyebrow="Utilities / guided demo"
      title="The three-minute evaluation journey"
      description="A structured, reproducible walkthrough demonstrating how CertaProof turns a suspected vulnerability into defensible evidence, remediation, and verified re-test."
      actions={
        <Link href={nextHref} className="btn btn-primary" data-testid="button-continue-walkthrough">
          {actionLabel} <ArrowRight size={14} />
        </Link>
      }
    >
      <div className="grid-3">
        {steps.map((step, idx) => (
          <div className="card card-pad" key={step.n}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="mono" style={{ fontSize: 24, fontWeight: 700, color: step.done ? "var(--primary)" : "var(--text-muted)" }}>
                {step.n}
              </span>
              <Tag tone={step.done ? "teal" : "slate"}>
                {step.done ? "COMPLETED" : `PHASE ${idx + 1}`}
              </Tag>
            </div>
            <h2 style={{ marginTop: 12, fontSize: 16 }}>{step.title}</h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.55 }}>
              {step.copy}
            </p>
            <Link href={step.href} className="btn btn-outline" style={{ marginTop: 16, width: "100%" }} data-testid={`link-guide-step-${idx + 1}`}>
              Open phase {idx + 1} <ArrowRight size={13} />
            </Link>
          </div>
        ))}
      </div>

      <div className="card card-pad" style={{ marginTop: 24 }}>
        <div className="eyebrow">Demo Guardrails & Transparency</div>
        <div className="grid-3" style={{ marginTop: 10 }}>
          <div className="assertion">
            <ShieldCheck size={15} style={{ color: "var(--primary)" }} />
            <span>Synthetic fixture identities only (Analyst A / B)</span>
          </div>
          <div className="assertion">
            <LockKeyhole size={15} style={{ color: "var(--primary)" }} />
            <span>Zero live traffic to worldmonitor.app</span>
          </div>
          <div className="assertion">
            <CheckCircle2 size={15} style={{ color: "var(--primary)" }} />
            <span>Attributable origin labels on all evidence</span>
          </div>
        </div>
      </div>
    </Page>
  );
}

// -------------------------------------------------------------
// Router & App
// -------------------------------------------------------------
function Router() {
  return (
    <ErrorBoundary resetKey={window.location.pathname}>
      <Shell>
        <Switch>
          <Route path="/" component={Overview} />
          <Route path="/assessments" component={Assessments} />
          <Route path="/assessments/:id" component={AssessmentDetail} />
          <Route path="/attack-surface" component={AttackSurface} />
          <Route path="/validation" component={Validation} />
          <Route path="/findings" component={Findings} />
          <Route path="/findings/:id" component={FindingDetail} />
          <Route path="/evidence" component={Evidence} />
          <Route path="/remediation" component={Remediation} />
          <Route path="/reports" component={Reports} />
          <Route path="/integrations" component={Integrations} />
          <Route path="/settings" component={Settings} />
          <Route path="/guide" component={Guide} />
          <Route component={NotFound} />
        </Switch>
      </Shell>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
