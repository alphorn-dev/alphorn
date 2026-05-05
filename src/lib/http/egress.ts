import { ProxyAgent, setGlobalDispatcher } from "undici";
import { logger } from "@/lib/logger";

let configured = false;

export function configureEgressProxy() {
  if (configured) return;
  const url = process.env.EGRESS_PROXY_URL;
  if (!url) return;

  setGlobalDispatcher(new ProxyAgent(url));
  configured = true;
  logger.info({ component: "egress" }, "Egress proxy configured");
}
