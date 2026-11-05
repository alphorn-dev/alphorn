// Lemon Squeezy webhooks. Docs: https://docs.lemonsqueezy.com/help/webhooks
// Event name lives in meta.event_name; amounts are pre-formatted in total_formatted.
// Customer name and email are deliberately not rendered (PII).

import {
  resolvePath,
  str,
  num,
  lines,
  tags,
  type AutoSource,
  type Body,
  type AutoResult,
} from "./util";

// Map, not a plain object: event names come from an untrusted payload.
const LABELS = new Map([
  ["order_created", "New order"],
  ["order_refunded", "Order refunded"],
  ["subscription_created", "New subscription"],
  ["subscription_updated", "Subscription updated"],
  ["subscription_cancelled", "Subscription cancelled"],
  ["subscription_expired", "Subscription expired"],
  ["subscription_payment_success", "Subscription payment received"],
  ["subscription_payment_failed", "Subscription payment failed"],
  ["license_key_created", "New license key"],
]);

function labeled(label: string, value: string): string {
  return value ? `${label}: ${value}` : "";
}

function lemonsqueezy(body: Body): AutoResult {
  const event = str(body, "meta.event_name");
  const attrs = resolvePath(body, "data.attributes");
  const status = str(attrs, "status").toLowerCase();
  const amount = str(attrs, "total_formatted");
  const product = str(attrs, "product_name") || str(attrs, "first_order_item.product_name");
  const variant = str(attrs, "variant_name") || str(attrs, "first_order_item.variant_name");
  const orderNumber = num(attrs, "order_number");
  const storeId = num(attrs, "store_id");
  const store = str(attrs, "store_name") || (storeId === null ? "" : `store ${storeId}`);

  const label = LABELS.get(event) ?? `Lemon Squeezy ${event.replace(/_/g, " ") || "event"}`;
  const subject = [amount, product && `(${product})`].filter(Boolean).join(" ");
  const headline = [label, subject].filter(Boolean).join(": ");

  return {
    title: [store && `[${store}]`, headline].filter(Boolean).join(" "),
    message: lines(
      labeled("Variant", variant),
      orderNumber === null ? "" : `Order #${orderNumber}`,
      labeled("Status", status)
    ),
    priority: event === "order_refunded" || event === "subscription_payment_failed" ? 4 : null,
    tags: tags("lemonsqueezy", event.toLowerCase(), status),
  };
}

export const lemonsqueezySource: AutoSource = {
  id: "lemonsqueezy",
  detect: (body, headers) => {
    const attributes = resolvePath(body, "data.attributes");
    return (
      Boolean(headers["x-event-name"] && headers["x-signature"]) ||
      Boolean(
        str(body, "meta.event_name") &&
          str(body, "data.type") &&
          attributes &&
          typeof attributes === "object"
      )
    );
  },
  extract: (body) => lemonsqueezy(body),
};
