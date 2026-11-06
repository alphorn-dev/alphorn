import { describe, it, expect } from "vitest";
import { railwaySource } from "@/lib/webhook-extract/sources/railway";

// Shape from https://docs.railway.com/observability/webhooks
const event = (type: string, extra: Record<string, unknown> = {}) => ({
  type,
  details: {
    id: "8107edff-4b8e-44fc-b43a-04566e847a2a",
    source: "GitHub",
    status: "SUCCESS",
    branch: "main",
    commitHash: "a1b2c3d4e5f6",
    commitAuthor: "alice",
    commitMessage: "fix: handle empty cart\n\nlonger body",
  },
  resource: {
    workspace: { id: "ws_1", name: "Acme" },
    project: { id: "prj_1", name: "shop" },
    environment: { id: "env_1", name: "production", isEphemeral: false },
    service: { id: "svc_1", name: "api" },
    deployment: { id: "dep_1" },
  },
  severity: "WARNING",
  timestamp: "2025-11-21T23:48:42.311Z",
  ...extra,
});

describe("railwaySource", () => {
  it("detects Railway's envelope and nothing else", () => {
    expect(railwaySource.detect(event("Deployment.failed"), {})).toBe(true);
    expect(railwaySource.detect({ type: "Deployment.failed" }, {})).toBe(false);
    expect(railwaySource.detect({ type: "INSERT", table: "orders", record: {} }, {})).toBe(false);
    expect(railwaySource.detect({ type: "deployment.error", payload: {} }, {})).toBe(false);
    expect(railwaySource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
  });

  it("formats a failed deployment with commit details, link and priority 4", () => {
    const r = railwaySource.extract(event("Deployment.failed"), {});
    expect(r.title).toBe("shop/api deployment failed (production)");
    expect(r.message).toBe(
      [
        "Branch: main",
        "Commit: fix: handle empty cart (a1b2c3d)",
        "Author: alice",
        "https://railway.com/project/prj_1/service/svc_1?environmentId=env_1",
      ].join("\n"),
    );
    expect(r.priority).toBe(4);
    expect(r.tags).toEqual(["railway", "deployment.failed", "shop", "api", "production", "main"]);
  });

  it("flags crashes and keeps successful deployments unflagged", () => {
    expect(railwaySource.extract(event("Deployment.crashed"), {})).toMatchObject({
      title: "shop/api deployment crashed (production)",
      priority: 4,
    });
    expect(railwaySource.extract(event("Deployment.success", { severity: "INFO" }), {})).toMatchObject({
      title: "shop/api deployment succeeded (production)",
      priority: null,
    });
  });

  it("gives alerts a readable title and Railway's severity as priority", () => {
    const r = railwaySource.extract(
      event("VolumeAlert.triggered", { details: {}, severity: "CRITICAL" }),
      {},
    );
    expect(r.title).toBe("shop/api: volume alert triggered (production)");
    expect(r.priority).toBe(5);
    expect(r.message).toContain("https://railway.com/project/prj_1");
  });
});
