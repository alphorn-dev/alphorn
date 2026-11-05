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

function formatAmount(amount: number, currency: string): string {
  try {
    const formatter = new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency.toUpperCase(),
    });
    // Stripe amounts are in the currency's minor unit (cents, or whole yen).
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(amount / 10 ** digits);
  } catch {
    // Unknown ISO code from an untrusted payload.
    return `${amount} ${currency}`;
  }
}

function stripe(body: Body): AutoResult {
  const type = str(body, "type");
  const obj = resolvePath(body, "data.object");
  const amount = num(obj, "amount") ?? num(obj, "amount_due") ?? num(obj, "amount_total");
  const currency = str(obj, "currency");
  const failed = /failed|dispute|past_due/.test(type);
  return {
    title: `Stripe: ${type.replace(/[._]/g, " ")}`,
    message: lines(
      amount !== null && currency ? formatAmount(amount, currency) : "",
      str(obj, "description"),
      str(obj, "id")
    ),
    priority: failed ? 4 : null,
    tags: tags("stripe", type.split(".")[0]),
  };
}

export const stripeSource: AutoSource = {
  id: "stripe",
  detect: (body, headers) =>
    Boolean(headers["stripe-signature"]) || (body.object === "event" && str(body, "type") !== ""),
  extract: (body) => stripe(body),
};
