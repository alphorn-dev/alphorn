import { describe, it, expect } from "vitest";
import { paddleSource } from "@/lib/webhook-extract/sources/paddle";

const envelope = (eventType: string, data: Record<string, unknown>) => ({
  event_id: "evt_abc123",
  event_type: eventType,
  occurred_at: "2026-01-01T10:00:00.000000Z",
  notification_id: "ntf_abc123",
  data,
});

const transactionData = {
  id: "txn_abc123",
  status: "completed",
  customer_id: "ctm_abc123",
  currency_code: "USD",
  details: { totals: { total: "65215", currency_code: "USD" } },
  items: [
    { price: { id: "pri_1", name: "Monthly (per seat)" }, quantity: 10 },
    { price: { id: "pri_2", name: "One-time addon" }, quantity: 1 },
  ],
};

describe("paddleSource", () => {
  it("detects Paddle by the Paddle-Signature header or the envelope shape", () => {
    expect(paddleSource.detect({}, { "paddle-signature": "ts=1;h1=abc" })).toBe(true);
    expect(paddleSource.detect(envelope("transaction.completed", {}), {})).toBe(true);
    expect(paddleSource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
    expect(paddleSource.detect({ action: "opened", repository: { full_name: "a/b" } }, {})).toBe(false);
  });

  it("formats a completed transaction with amount and items", () => {
    expect(paddleSource.extract(envelope("transaction.completed", transactionData), {})).toEqual({
      title: "Paddle: transaction completed $652.15",
      message:
        "Items: Monthly (per seat), One-time addon\nCustomer: ctm_abc123\nID: txn_abc123",
      priority: null,
      tags: ["paddle", "transaction.completed", "completed"],
    });
  });

  it("formats a failed payment as priority 4 with the error code", () => {
    const result = paddleSource.extract(
      envelope("transaction.payment_failed", {
        ...transactionData,
        status: "ready",
        payments: [{ status: "error", error_code: "declined" }],
      }),
      {}
    );
    expect(result).toEqual({
      title: "Paddle: transaction payment failed $652.15",
      message:
        "Items: Monthly (per seat), One-time addon\nError: declined\nCustomer: ctm_abc123\nID: txn_abc123",
      priority: 4,
      tags: ["paddle", "transaction.payment_failed", "ready"],
    });
  });

  it("formats a canceled subscription without amount", () => {
    const result = paddleSource.extract(
      envelope("subscription.canceled", {
        id: "sub_abc123",
        status: "canceled",
        customer_id: "ctm_abc123",
        canceled_at: "2026-01-01T10:00:00.000Z",
        items: [{ price: { name: "Pro" }, quantity: 1 }],
      }),
      {}
    );
    expect(result).toEqual({
      title: "Paddle: subscription canceled",
      message: "Items: Pro\nCustomer: ctm_abc123\nID: sub_abc123",
      priority: 4,
      tags: ["paddle", "subscription.canceled", "canceled"],
    });
  });

  it("marks past_due subscriptions as priority 4", () => {
    expect(paddleSource.extract(envelope("subscription.past_due", { id: "sub_abc123" }), {}).priority).toBe(4);
  });

  it("uses a generic title for unknown event types", () => {
    const result = paddleSource.extract(envelope("customer.created", { id: "ctm_abc123" }), {});
    expect(result.title).toBe("Paddle: customer created");
    expect(result.priority).toBeNull();
  });

  it("does not throw on malformed payloads", () => {
    expect(() => paddleSource.extract({ event_type: 42, data: "oops" }, {})).not.toThrow();
    expect(paddleSource.extract({ event_type: 42, data: "oops" }, {})).toEqual({
      title: "Paddle: event",
      message: "",
      priority: null,
      tags: ["paddle"],
    });
    expect(
      paddleSource.extract(
        envelope("transaction.completed", {
          details: { totals: { total: 65215 } },
          currency_code: "NOTACURRENCY",
          items: "nope",
          payments: [null, 7],
        }),
        {}
      ).title
    ).toBe("Paddle: transaction completed");
  });
});
