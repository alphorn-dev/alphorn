import { describe, it, expect } from "vitest";
import { extractAuto } from "@/lib/webhook-extract/auto";

const repo = { repository: { full_name: "acme/shop", name: "shop" }, sender: { login: "alice" } };
const run = (event: string, body: Record<string, unknown>) =>
  extractAuto({ ...repo, ...body }, { "x-github-event": event })!;

describe("GitHub security and deployment events", () => {
  it("secret scanning: priority 5 when found or leaked, never the secret value", () => {
    const alert = { number: 7, secret_type_display_name: "AWS Access Key", html_url: "https://github.com/acme/shop/security/secret-scanning/7", secret: "AKIAEXAMPLESECRET" };
    const created = run("secret_scanning_alert", { action: "created", alert });
    expect(created.title).toBe("[acme/shop] Secret detected: AWS Access Key");
    expect(created.priority).toBe(5);
    expect(created.message).not.toContain("AKIAEXAMPLESECRET");
    expect(run("secret_scanning_alert", { action: "publicly_leaked", alert }).priority).toBe(5);
    expect(run("secret_scanning_alert", { action: "resolved", alert }).priority).toBeNull();
  });

  it("dependabot: priority from advisory severity, none once fixed", () => {
    const alert = (severity: string) => ({
      html_url: "https://github.com/acme/shop/security/dependabot/3",
      dependency: { package: { name: "lodash", ecosystem: "npm" }, manifest_path: "package.json" },
      security_advisory: { ghsa_id: "GHSA-xxxx", summary: "Prototype pollution", severity },
      security_vulnerability: { severity, first_patched_version: { identifier: "4.17.21" } },
    });
    const r = run("dependabot_alert", { action: "created", alert: alert("critical") });
    expect(r.title).toBe("[acme/shop] Dependabot: critical lodash created");
    expect(r.priority).toBe(5);
    expect(r.message).toContain("Fixed in 4.17.21");
    expect(run("dependabot_alert", { action: "created", alert: alert("medium") }).priority).toBe(3);
    expect(run("dependabot_alert", { action: "fixed", alert: alert("critical") }).priority).toBeNull();
  });

  it("code scanning: security severity first, rule severity as fallback", () => {
    const alert = (rule: Record<string, string>) => ({
      html_url: "https://github.com/acme/shop/security/code-scanning/1",
      rule: { description: "SQL injection", ...rule },
      tool: { name: "CodeQL" },
      most_recent_instance: { location: { path: "src/db.ts", start_line: 42 } },
    });
    const r = run("code_scanning_alert", { action: "created", alert: alert({ security_severity_level: "high", severity: "error" }) });
    expect(r.priority).toBe(4);
    expect(r.message).toContain("src/db.ts:42");
    expect(run("code_scanning_alert", { action: "created", alert: alert({ severity: "warning" }) }).priority).toBe(3);
    expect(run("code_scanning_alert", { action: "fixed", alert: alert({ security_severity_level: "critical" }) }).priority).toBeNull();
  });

  it("repository advisories, deployments and approvals", () => {
    const advisory = { summary: "RCE in parser", ghsa_id: "GHSA-yyyy", severity: "high", html_url: "https://x" };
    expect(run("repository_advisory", { action: "reported", repository_advisory: advisory }).priority).toBe(4);
    expect(run("repository_advisory", { action: "published", repository_advisory: advisory }).priority).toBe(3);

    const failed = run("deployment_status", {
      action: "created",
      deployment_status: { state: "failure", environment: "production", log_url: "https://logs" },
      deployment: { ref: "main" },
    });
    expect(failed).toMatchObject({ title: "[acme/shop] Deployment to production failure", priority: 4 });

    const approval = run("deployment_review", {
      action: "requested",
      workflow_job_runs: [{ environment: "production" }],
      workflow_run: { display_title: "Release v2", html_url: "https://run" },
    });
    expect(approval).toMatchObject({ title: "[acme/shop] Deployment approval requested for production", priority: 3 });
  });

  it("discussions", () => {
    const r = run("discussion", {
      action: "created",
      discussion: { number: 5, title: "Roadmap", body: "Ideas?", html_url: "https://d" },
    });
    expect(r.title).toBe("[acme/shop] Discussion #5 created: Roadmap");
    expect(r.tags).toEqual(["github", "discussion", "shop"]);
  });
});
