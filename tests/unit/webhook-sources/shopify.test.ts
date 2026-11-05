import { describe, it, expect } from "vitest";
import { shopifySource } from "@/lib/webhook-extract/sources/shopify";

const headers = (topic: string) => ({
  "x-shopify-topic": topic,
  "x-shopify-shop-domain": "example.myshopify.com",
});

const order = {
  id: 450789469,
  name: "#1001",
  total_price: "49.90",
  currency: "EUR",
  financial_status: "paid",
  email: "alice@example.com",
  phone: "+15555550100",
  customer: { id: 207119551, first_name: "Alice", last_name: "Example", email: "alice@example.com" },
  billing_address: { address1: "1 Example Street", city: "Springfield" },
  line_items: [
    { title: "Coffee beans", quantity: 2, name: "Coffee beans - 500g" },
    { title: "Filter", quantity: 1, name: "Filter" },
  ],
};

describe("shopifySource", () => {
  it("formats orders/create without contact details", () => {
    const result = shopifySource.extract(order, headers("orders/create"));
    expect(result).toEqual({
      title: "New order #1001: 49.90 EUR",
      message: "Customer: Alice\n- 2 x Coffee beans\n- 1 x Filter",
      priority: null,
      tags: ["shopify", "orders/create", "example.myshopify.com", "paid"],
    });
    expect(JSON.stringify(result)).not.toContain("alice@example.com");
    expect(JSON.stringify(result)).not.toContain("Springfield");
  });

  it("formats orders/paid without a priority", () => {
    const result = shopifySource.extract(order, headers("orders/paid"));
    expect(result.title).toBe("Order paid #1001: 49.90 EUR");
    expect(result.priority).toBeNull();
  });

  it("flags orders/cancelled with the cancel reason", () => {
    const result = shopifySource.extract(
      { ...order, cancelled_at: "2026-01-02T10:00:00Z", cancel_reason: "customer" },
      headers("orders/cancelled")
    );
    expect(result.title).toBe("Order cancelled #1001: 49.90 EUR");
    expect(result.message).toBe("Customer: Alice\nReason: customer\n- 2 x Coffee beans\n- 1 x Filter");
    expect(result.priority).toBe(4);
  });

  it("formats refunds/create with the refunded amount and note", () => {
    const result = shopifySource.extract(
      {
        id: 820982911946154500,
        order_id: 450789469,
        note: "Damaged in transit",
        refund_line_items: [{ quantity: 1, line_item_id: 1 }],
        transactions: [{ amount: "20.00", currency: "EUR", kind: "refund", status: "success" }],
      },
      headers("refunds/create")
    );
    expect(result).toEqual({
      title: "Refund on order 450789469: 20.00 EUR",
      message: "Damaged in transit\n1 item(s) refunded",
      priority: 4,
      tags: ["shopify", "refunds/create", "example.myshopify.com"],
    });
  });

  it("falls back to a generic title for other topics", () => {
    const result = shopifySource.extract({ id: 1, title: "Classic Tee" }, headers("products/update"));
    expect(result).toEqual({
      title: "Shopify: products update",
      message: "Classic Tee",
      priority: null,
      tags: ["shopify", "products/update", "example.myshopify.com"],
    });
  });

  it("detects by the x-shopify-topic header only", () => {
    expect(shopifySource.detect(order, headers("orders/create"))).toBe(true);
    expect(shopifySource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
    expect(
      shopifySource.detect({ action: "opened", repository: { full_name: "a/b" } }, {})
    ).toBe(false);
  });

  it("does not throw on malformed payloads", () => {
    expect(() =>
      shopifySource.extract(
        { name: 5, line_items: "oops", total_price: 49.9, customer: null, transactions: 3 },
        headers("orders/create")
      )
    ).not.toThrow();
    expect(
      shopifySource.extract({ name: 5, line_items: "oops", total_price: 49.9, customer: null }, headers("orders/create"))
        .title
    ).toBe("New order");
    expect(shopifySource.extract({}, headers("refunds/create")).title).toBe("Refund on order ?");
  });
});
