// Paddle Billing (v2) webhooks. Docs: https://developer.paddle.com/webhooks/overview
// Detected by the Paddle-Signature header or by the event envelope shape.

import {
  resolvePath,
  str,
  lines,
  list,
  tags,
  MAX_LIST_ITEMS,
  type AutoSource,
  type Body,
  type AutoResult,
} from "./util";

// Paddle amounts are strings in the currency's minor unit (cents, or whole yen).
function formatAmount(minor: string, currency: string): string {
  const amount = Number(minor);
  try {
    const formatter = new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency.toUpperCase(),
    });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(amount / 10 ** digits);
  } catch {
    // Unknown ISO code from an untrusted payload.
    return `${minor} ${currency}`;
  }
}

function paddle(body: Body): AutoResult {
  const eventType = str(body, "event_type");
  const data = resolvePath(body, "data");
  const label = eventType.replace(/[._]/g, " ") || "event";

  const total = str(data, "details.totals.total");
  const currency = str(data, "currency_code") || str(data, "details.totals.currency_code");
  const amount = /^-?\d+$/.test(total) && currency ? formatAmount(total, currency) : "";

  const items = list(data, "items")
    .slice(0, MAX_LIST_ITEMS)
    .map((item) => str(item, "price.name"))
    .filter(Boolean);
  const failure = list(data, "payments")
    .map((p) => str(p, "error_code"))
    .find(Boolean);

  const failed = /payment_failed|past_due|canceled/.test(eventType);
  return {
    title: `Paddle: ${label}${amount ? ` ${amount}` : ""}`,
    message: lines(
      items.length > 0 ? `Items: ${items.join(", ")}` : "",
      failure ? `Error: ${failure}` : "",
      str(data, "customer_id") ? `Customer: ${str(data, "customer_id")}` : "",
      str(data, "id") ? `ID: ${str(data, "id")}` : ""
    ),
    priority: failed ? 4 : null,
    tags: tags("paddle", eventType, str(data, "status").toLowerCase()),
  };
}

export const paddleSource: AutoSource = {
  id: "paddle",
  detect: (body, headers) =>
    Boolean(headers["paddle-signature"]) ||
    (str(body, "event_id") !== "" &&
      str(body, "event_type") !== "" &&
      str(body, "notification_id") !== ""),
  extract: (body) => paddle(body),
};
