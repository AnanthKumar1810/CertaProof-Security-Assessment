async function testWorkflow() {
  const base = "http://localhost:5000";

  // 1. Health check
  const health = await fetch(base + "/api/healthz").then(r => r.json());
  console.log("1. Health check:", health.status === "ok" ? "PASS" : "FAIL");

  // 2. Target guard: reject worldmonitor.app
  const targetTest = await fetch(base + "/api/assessments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Illegal Prod Test", target: "https://worldmonitor.app", environment: "demo" })
  });
  console.log("2. Target guard (block worldmonitor.app):", targetTest.status === 400 ? "PASS (400 rejected)" : "FAIL " + targetTest.status);

  // 3. Reset to fresh demo
  await fetch(base + "/api/demo/reset", { method: "POST" });
  let dash = await fetch(base + "/api/dashboard").then(r => r.json());
  console.log("3. Fresh state: candidates=" + dash.candidates + ", confirmed=" + dash.confirmed + ", verified=" + dash.verified);
  console.log("   Checklist count (must be 6):", dash.checklist.length === 6 ? "PASS (6 items)" : "FAIL " + dash.checklist.length);
  console.log("   Coverage 7 areas all not_assessed:", dash.coverage.every(c => c.status === "not_assessed") ? "PASS" : "FAIL");

  // 4. Report status before evidence: must NOT be ready
  const preReport = await fetch(base + "/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ format: "json" })
  }).then(r => r.json());
  console.log("4. Pre-evidence report status (must NOT be ready):", preReport.status === "pending_evidence" ? "PASS (pending_evidence)" : "FAIL " + preReport.status);

  // 5. Execute 4-case matrix
  const matrix = await fetch(base + "/api/validation/matrix", { method: "POST" }).then(r => r.json());
  console.log("5. Executed matrix cases:", matrix.runs.length === 4 ? "PASS (4 runs)" : "FAIL");

  // 6. State after matrix: finding should be confirmed
  dash = await fetch(base + "/api/dashboard").then(r => r.json());
  console.log("6. Post-matrix state: candidates=" + dash.candidates + ", confirmed=" + dash.confirmed + ", verified=" + dash.verified);
  console.log("   Finding confirmed:", dash.confirmed === 1 ? "PASS" : "FAIL");

  // 7. Preserved evidence trace & SHA-256
  const evidence = await fetch(base + "/api/evidence").then(r => r.json());
  console.log("7. Preserved evidence traces:", evidence.length > 0 ? "PASS (" + evidence.length + " traces)" : "FAIL");
  const firstEv = evidence[0];
  console.log("   Has genuine SHA-256:", Boolean(firstEv?.sha256 && firstEv.sha256.length === 64) ? "PASS (" + firstEv.sha256.substring(0, 16) + "...)" : "FAIL");

  // 8. Applying fix alone: must NOT verify
  await fetch(base + "/api/remediation/finding-001", { method: "POST" }).then(r => r.json());
  dash = await fetch(base + "/api/dashboard").then(r => r.json());
  console.log("8. Post-fix state: candidates=" + dash.candidates + ", confirmed=" + dash.confirmed + ", awaiting_retest=" + dash.remediationPending + ", verified=" + dash.verified);
  console.log("   Fix alone does NOT increase verified:", (dash.verified === 0 && dash.remediationPending === 1) ? "PASS" : "FAIL");

  // 9. Run re-test
  const retestRes = await fetch(base + "/api/verification/finding-001", { method: "POST" }).then(r => r.json());
  dash = await fetch(base + "/api/dashboard").then(r => r.json());
  console.log("9. Post-retest state: verified=" + dash.verified + ", status=" + retestRes.status);
  console.log("   Verified fixed after retest:", (dash.verified === 1 && retestRes.status === "verified_fixed") ? "PASS" : "FAIL");

  // 10. Report status after evidence: should now be ready
  const postReport = await fetch(base + "/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ format: "json" })
  }).then(r => r.json());
  console.log("10. Post-retest report status (must be ready):", postReport.status === "ready" ? "PASS (ready)" : "FAIL " + postReport.status);

  // 11. HTML report export check
  const htmlReport = await fetch(base + "/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ format: "html" })
  }).then(r => r.json());
  console.log("11. Report format handler:", Boolean(htmlReport.id) ? "PASS (" + htmlReport.id + ")" : "FAIL");

  // 12. Static frontend serving check
  const indexHtml = await fetch(base + "/").then(r => r.text());
  console.log("12. Static frontend index.html served:", indexHtml.includes("<!DOCTYPE html>") ? "PASS" : "FAIL");
  const faviconSvg = await fetch(base + "/favicon.svg").then(r => r.text());
  console.log("    Favicon SVG served:", faviconSvg.includes("<svg") ? "PASS" : "FAIL");

  // 13. Reset verification
  await fetch(base + "/api/demo/reset", { method: "POST" });
  dash = await fetch(base + "/api/dashboard").then(r => r.json());
  console.log("13. Reset works: verified=" + dash.verified + ", confirmed=" + dash.confirmed + ", candidates=" + dash.candidates);
  console.log("    Reset verified:", (dash.verified === 0 && dash.candidates === 1) ? "PASS" : "FAIL");
}

testWorkflow().catch(e => console.error("Error:", e));
