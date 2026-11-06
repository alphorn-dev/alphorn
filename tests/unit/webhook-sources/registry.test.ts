import { describe, it, expect } from "vitest";
import { SOURCES } from "@/lib/webhook-extract/sources";
import { extractAuto } from "@/lib/webhook-extract/auto";

type Case = [id: string, body: Record<string, unknown>, headers?: Record<string, string>];

// One minimal payload per source. Each must be claimed by its own source and
// not by an earlier one in SOURCES (ordering conflicts surface here).
const CASES: Case[] = [
  ["gitea", { action: "opened", repository: { full_name: "a/b" } }, { "x-gitea-event": "issues", "x-github-event": "issues" }],
  ["github", { action: "opened", repository: { full_name: "a/b" } }, { "x-github-event": "issues" }],
  ["gitlab", { object_kind: "push" }, { "x-gitlab-event": "Push Hook" }],
  ["bitbucket", {}, { "x-event-key": "repo:push", "x-hook-uuid": "abc123" }],
  ["sentry", { action: "created", data: { issue: { title: "E", level: "error" } } }, { "sentry-hook-resource": "issue" }],
  ["linear", { action: "create", type: "Issue", data: {} }, { "linear-event": "Issue" }],
  ["vercel", { type: "deployment.error", payload: {} }, { "x-vercel-signature": "abc" }],
  ["circleci", { type: "workflow-completed" }, { "circleci-event-type": "workflow-completed" }],
  ["shopify", { name: "#1001" }, { "x-shopify-topic": "orders/create" }],
  ["pagerduty", { event: { event_type: "incident.triggered", resource_type: "incident", data: {} } }],
  ["aws-sns", { Type: "Notification", TopicArn: "arn:aws:sns:eu-west-1:1:alerts", MessageId: "abc123", Message: "hi" }],
  ["paddle", { event_id: "evt_1", event_type: "transaction.completed", notification_id: "ntf_1", data: {} }],
  ["lemonsqueezy", { meta: { event_name: "order_created" }, data: { type: "orders", attributes: {} } }],
  ["netlify", { site_id: "abc123", deploy_ssl_url: "https://example.com", state: "ready", name: "site" }],
  ["jira", { webhookEvent: "jira:issue_created", issue: { key: "PROJ-1", fields: { summary: "S" } } }],
  ["alchemy", { webhookId: "wh_test", type: "ADDRESS_ACTIVITY", event: { network: "ETH_MAINNET", activity: [] } }],
  ["stripe", { object: "event", type: "charge.succeeded", data: { object: {} } }],
  ["railway", { type: "Deployment.failed", resource: { project: { id: "p1", name: "shop" } }, severity: "WARNING" }],
  ["azure-monitor", { schemaId: "azureMonitorCommonAlertSchema", data: { essentials: { alertRule: "cpu" } } }],
  ["gcp-monitoring", { version: "1.2", incident: { incident_id: "abc123", policy_name: "cpu", state: "open" } }],
  ["statuspage", { meta: { unsubscribe: "https://example.com/u" }, page: { id: "abc123" }, incident: { name: "Outage", status: "investigating" } }],
  ["opsgenie", { action: "Create", alert: { alertId: "abc123", message: "Down" }, integrationName: "Webhook" }],
  ["uptime-kuma", { heartbeat: { status: 0 }, monitor: { name: "api" }, msg: "down" }],
  ["docker-hub", { push_data: { tag: "latest" }, repository: { repo_name: "alice/api", repo_url: "https://hub.docker.com/r/alice/api" } }],
  ["arr", { eventType: "Grab", instanceName: "Sonarr", series: { title: "Show" } }],
  ["overseerr", { notification_type: "MEDIA_APPROVED", subject: "Movie", media: {} }],
  ["supabase", { type: "INSERT", table: "orders", schema: "public", record: { id: 1 }, old_record: null }],
  ["better-stack", { data: { type: "incident", attributes: { name: "api", cause: "Timeout", started_at: "2026-01-01T00:00:00Z" } } }],
  ["graylog", { event_definition_id: "abc123", event_definition_title: "Errors", event: { message: "x", priority: 3 } }],
  ["jenkins", { name: "build", build: { number: 7, phase: "COMPLETED", status: "FAILURE" } }],
  ["grafana", { orgId: 1, status: "firing", groupKey: "k", alerts: [] }],
  ["alertmanager", { status: "firing", groupKey: "k", alerts: [] }],
];

describe("source registry", () => {
  it("covers every registered source", () => {
    expect(new Set(CASES.map(([id]) => id))).toEqual(new Set(SOURCES.map((s) => s.id)));
  });

  it.each(CASES)("routes %s payloads to the right source", (id, body, headers = {}) => {
    expect(SOURCES.find((s) => s.detect(body, headers))?.id).toBe(id);
  });

  it.each(CASES)("%s produces clean output", (_id, body, headers = {}) => {
    const result = extractAuto(body, headers);
    expect(result?.title).toBeTruthy();
    expect(`${result?.title} ${result?.message} ${result?.tags.join(",")}`).not.toMatch(
      /undefined|null|\[object Object\]|NaN/
    );
    expect(result?.priority === null || Number.isInteger(result?.priority)).toBe(true);
  });

  it("leaves generic payloads to the heuristic", () => {
    expect(extractAuto({ title: "Hi", message: "Yo" }, {})).toBeNull();
    expect(extractAuto({ text: "hello", priority: 3 }, {})).toBeNull();
  });

  it("ignores prototype keys in lookups", () => {
    const result = extractAuto(
      { action: "created", data: { issue: { title: "E", level: "constructor" } } },
      { "sentry-hook-resource": "issue" }
    );
    expect(result?.priority).toBeNull();
  });
});
