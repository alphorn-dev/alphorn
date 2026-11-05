// Shopify webhooks. Docs: https://shopify.dev/docs/api/webhooks
// The body is the resource itself (order, refund, ...). Customer contact data
// (email, phone, addresses) is deliberately not forwarded.

import {
  str,
  num,
  list,
  lines,
  tags,
  excerpt,
  MAX_LIST_ITEMS,
  type AutoSource,
  type Body,
  type AutoResult,
  lookup,
} from "./util";

const ORDER_LABELS: Record<string, string> = {
  create: "New order",
  paid: "Order paid",
  cancelled: "Order cancelled",
  fulfilled: "Order fulfilled",
  updated: "Order updated",
};

function order(body: Body, action: string, shop: string, topic: string): AutoResult {
  const ref = str(body, "name");
  const amount = [str(body, "total_price"), str(body, "currency")].filter(Boolean).join(" ");
  const cancelled = action === "cancelled";
  const items = list(body, "line_items");
  const itemLines = items.slice(0, MAX_LIST_ITEMS).map((item) => {
    const qty = num(item, "quantity");
    return `- ${qty !== null ? `${qty} x ` : ""}${str(item, "title")}`;
  });
  if (items.length > MAX_LIST_ITEMS) {
    itemLines.push(`… and ${items.length - MAX_LIST_ITEMS} more`);
  }
  const customer = str(body, "customer.first_name");
  return {
    title: `${lookup(ORDER_LABELS, action) ?? `Order ${action}`}${ref ? ` ${ref}` : ""}${amount ? `: ${amount}` : ""}`,
    message: lines(
      customer ? `Customer: ${customer}` : "",
      cancelled ? `Reason: ${str(body, "cancel_reason")}` : "",
      ...itemLines
    ),
    priority: cancelled ? 4 : null,
    tags: tags("shopify", topic, shop, str(body, "financial_status")),
  };
}

function refund(body: Body, shop: string, topic: string): AutoResult {
  const [transaction] = list(body, "transactions");
  const orderId = num(body, "order_id");
  const amount = [str(transaction, "amount"), str(transaction, "currency")].filter(Boolean).join(" ");
  const itemCount = list(body, "refund_line_items").length;
  return {
    title: `Refund on order ${orderId ?? "?"}${amount ? `: ${amount}` : ""}`,
    message: lines(
      excerpt(str(body, "note")),
      itemCount > 0 ? `${itemCount} item(s) refunded` : ""
    ),
    priority: 4,
    tags: tags("shopify", topic, shop),
  };
}

function shopify(body: Body, headers: Record<string, string>): AutoResult {
  const topic = (headers["x-shopify-topic"] ?? "").toLowerCase();
  const shop = headers["x-shopify-shop-domain"] ?? "";
  const [resource, action = ""] = topic.split("/");

  if (resource === "orders") return order(body, action, shop, topic);
  if (resource === "refunds") return refund(body, shop, topic);

  return {
    title: `Shopify: ${topic.replace("/", " ")}`,
    message: lines(str(body, "title") || str(body, "name")),
    priority: null,
    tags: tags("shopify", topic, shop),
  };
}

export const shopifySource: AutoSource = {
  id: "shopify",
  detect: (_body, headers) => Boolean(headers["x-shopify-topic"]),
  extract: (body, headers) => shopify(body, headers),
};
