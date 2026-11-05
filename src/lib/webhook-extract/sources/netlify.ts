// Netlify deploy notifications (outgoing webhook). The body is the deploy object.
// Docs: https://docs.netlify.com/site-deploys/deploy-notifications/
// The docs only document the X-Webhook-Signature header (a JWS with iss "netlify"),
// and no example payload, so payload fields are read defensively.

import {
  str,
  lines,
  tags,
  excerpt,
  type AutoSource,
  type Body,
  type AutoResult,
  lookup,
} from "./util";

// Decodes the JWS claims (no verification) and returns the issuer, or "".
function jwsIssuer(token: string): string {
  const claims = token.split(".")[1];
  if (!claims) return "";
  try {
    const parsed: unknown = JSON.parse(Buffer.from(claims, "base64url").toString("utf8"));
    return typeof parsed === "object" && parsed !== null && "iss" in parsed && typeof parsed.iss === "string"
      ? parsed.iss
      : "";
  } catch {
    return "";
  }
}

const STATE_LABEL: Record<string, string> = {
  ready: "succeeded",
  error: "failed",
  building: "building",
};

function netlify(body: Body): AutoResult {
  const state = str(body, "state");
  const name = str(body, "name") || "Netlify";
  const context = str(body, "context");
  const label = lookup(STATE_LABEL, state) ?? (state || "updated");
  const subject = str(body, "title");

  return {
    title: `[${name}] deploy ${label}${subject ? `: ${subject}` : ""}`,
    message: lines(
      str(body, "branch") ? `branch ${str(body, "branch")}${context ? ` (${context})` : ""}` : "",
      excerpt(str(body, "error_message")),
      str(body, "deploy_ssl_url") || str(body, "admin_url")
    ),
    priority: state === "error" ? 4 : null,
    tags: tags("netlify", state.toLowerCase(), context.toLowerCase(), name.toLowerCase()),
  };
}

export const netlifySource: AutoSource = {
  id: "netlify",
  detect: (body, headers) =>
    jwsIssuer(headers["x-webhook-signature"] ?? "") === "netlify" ||
    (str(body, "site_id") !== "" && str(body, "deploy_ssl_url") !== "" && str(body, "state") !== ""),
  extract: (body) => netlify(body),
};
