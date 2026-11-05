import { describe, it, expect } from "vitest";
import { lemonsqueezySource } from "@/lib/webhook-extract/sources/lemonsqueezy";

const HEADERS = { "x-event-name": "order_created", "x-signature": "abc123" };

const orderAttributes = {
  store_id: 1,
  customer_id: 1,
  identifier: "89b36d62-0000-4000-8000-000000000001",
  order_number: 1001,
  user_name: "alice",
  user_email: "alice@example.com",
  currency: "USD",
  total: 1900,
  total_formatted: "$19.00",
  status: "paid",
  first_order_item: {
    product_id: 1,
    variant_id: 1,
    product_name: "Product One",
    variant_name: "Default",
  },
};

const order = (event: string, status = "paid") => ({
  meta: { event_name: event, custom_data: { user_id: "abc123" } },
  data: {
    type: "orders",
    id: "1",
    attributes: { ...orderAttributes, status },
  },
});

const subscription = (event: string, attributes: Record<string, unknown>) => ({
  meta: { event_name: event },
  data: { type: "subscriptions", id: "2", attributes },
});

const subscriptionAttributes = {
  store_id: 2,
  customer_id: 2,
  product_name: "Subscription One",
  variant_name: "Monthly",
  user_name: "bob",
  user_email: "bob@example.com",
  status: "active",
};

describe("lemonsqueezySource", () => {
  describe("detect", () => {
    it("matches by x-event-name together with x-signature", () => {
      expect(lemonsqueezySource.detect({}, HEADERS)).toBe(true);
    });

    it("does not match x-event-name without x-signature", () => {
      expect(lemonsqueezySource.detect({}, { "x-event-name": "order_created" })).toBe(false);
    });

    it("matches by meta.event_name + data.type + data.attributes shape", () => {
      expect(lemonsqueezySource.detect(order("order_created"), {})).toBe(true);
      expect(lemonsqueezySource.detect(subscription("subscription_created", {}), {})).toBe(true);
    });

    it("does not match a generic title/message payload", () => {
      expect(lemonsqueezySource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
    });

    it("does not match a GitHub-like payload", () => {
      expect(
        lemonsqueezySource.detect({ action: "opened", repository: { full_name: "a/b" } }, {})
      ).toBe(false);
    });
  });

  describe("extract", () => {
    it("formats order_created with the formatted total and product", () => {
      expect(lemonsqueezySource.extract(order("order_created"), HEADERS)).toEqual({
        title: "[store 1] New order: $19.00 (Product One)",
        message: "Variant: Default\nOrder #1001\nStatus: paid",
        priority: null,
        tags: ["lemonsqueezy", "order_created", "paid"],
      });
    });

    it("never renders customer name or email", () => {
      const result = lemonsqueezySource.extract(order("order_created"), HEADERS);
      expect(JSON.stringify(result)).not.toContain("alice");
      expect(JSON.stringify(result)).not.toContain("example.com");
    });

    it("flags order_refunded as priority 4", () => {
      const result = lemonsqueezySource.extract(order("order_refunded", "refunded"), {
        "x-event-name": "order_refunded",
        "x-signature": "abc123",
      });
      expect(result).toEqual({
        title: "[store 1] Order refunded: $19.00 (Product One)",
        message: "Variant: Default\nOrder #1001\nStatus: refunded",
        priority: 4,
        tags: ["lemonsqueezy", "order_refunded", "refunded"],
      });
    });

    it("formats subscription_created with product and variant, no amount", () => {
      expect(
        lemonsqueezySource.extract(
          subscription("subscription_created", { ...subscriptionAttributes, status: "on_trial" }),
          {}
        )
      ).toEqual({
        title: "[store 2] New subscription: (Subscription One)",
        message: "Variant: Monthly\nStatus: on_trial",
        priority: null,
        tags: ["lemonsqueezy", "subscription_created", "on_trial"],
      });
    });

    it("formats subscription_cancelled without priority", () => {
      const result = lemonsqueezySource.extract(
        subscription("subscription_cancelled", { ...subscriptionAttributes, status: "cancelled" }),
        {}
      );
      expect(result.title).toBe("[store 2] Subscription cancelled: (Subscription One)");
      expect(result.priority).toBeNull();
    });

    it("formats subscription_payment_success as received, priority null", () => {
      const result = lemonsqueezySource.extract(
        subscription("subscription_payment_success", {
          ...subscriptionAttributes,
          total_formatted: "$9.00",
          status: "paid",
        }),
        {}
      );
      expect(result).toEqual({
        title: "[store 2] Subscription payment received: $9.00 (Subscription One)",
        message: "Variant: Monthly\nStatus: paid",
        priority: null,
        tags: ["lemonsqueezy", "subscription_payment_success", "paid"],
      });
    });

    it("flags subscription_payment_failed as priority 4", () => {
      const result = lemonsqueezySource.extract(
        subscription("subscription_payment_failed", {
          ...subscriptionAttributes,
          total_formatted: "$9.00",
          status: "failed",
        }),
        {}
      );
      expect(result.title).toBe("[store 2] Subscription payment failed: $9.00 (Subscription One)");
      expect(result.priority).toBe(4);
    });

    it("formats license_key_created without leaking the key", () => {
      const result = lemonsqueezySource.extract(
        {
          meta: { event_name: "license_key_created" },
          data: {
            type: "license-keys",
            id: "3",
            attributes: {
              store_id: 1,
              product_name: "Product One",
              key: "AAAA-BBBB-CCCC-DDDD",
            },
          },
        },
        {}
      );
      expect(result.title).toBe("[store 1] New license key: (Product One)");
      expect(result.priority).toBeNull();
      expect(JSON.stringify(result)).not.toContain("AAAA-BBBB");
    });

    it("falls back to a generic title for unknown event types", () => {
      const result = lemonsqueezySource.extract(
        subscription("store_updated", { store_id: 1 }),
        {}
      );
      expect(result).toEqual({
        title: "[store 1] Lemon Squeezy store updated",
        message: "",
        priority: null,
        tags: ["lemonsqueezy", "store_updated"],
      });
    });

    it("does not throw on malformed payloads", () => {
      expect(() =>
        lemonsqueezySource.extract(
          { meta: { event_name: 42 }, data: { type: null, attributes: "nope" } },
          {}
        )
      ).not.toThrow();

      const result = lemonsqueezySource.extract(
        {
          meta: { event_name: "order_created" },
          data: {
            attributes: {
              total_formatted: 5,
              order_number: "1001",
              store_id: null,
              first_order_item: null,
            },
          },
        },
        {}
      );
      expect(result.title).toBe("New order");
      expect(result.message).toBe("");
      expect(result.tags).toEqual(["lemonsqueezy", "order_created"]);
    });

    it("does not treat prototype keys as event labels", () => {
      const result = lemonsqueezySource.extract(subscription("constructor", {}), {});
      expect(result.title).toBe("Lemon Squeezy constructor");
      expect(result.priority).toBeNull();
    });
  });
});
