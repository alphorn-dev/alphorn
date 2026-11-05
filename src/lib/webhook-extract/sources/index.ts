import type { AutoSource } from "./util";
import { alchemySource } from "./alchemy";
import { alertmanagerSource, grafanaSource } from "./alertmanager";
import { arrSource } from "./arr";
import { awsSnsSource } from "./aws-sns";
import { azureMonitorSource } from "./azure-monitor";
import { betterStackSource } from "./better-stack";
import { bitbucketSource } from "./bitbucket";
import { circleciSource } from "./circleci";
import { dockerHubSource } from "./docker-hub";
import { gcpMonitoringSource } from "./gcp-monitoring";
import { giteaSource } from "./gitea";
import { githubSource } from "./github";
import { gitlabSource } from "./gitlab";
import { graylogSource } from "./graylog";
import { jenkinsSource } from "./jenkins";
import { jiraSource } from "./jira";
import { lemonsqueezySource } from "./lemonsqueezy";
import { linearSource } from "./linear";
import { netlifySource } from "./netlify";
import { opsgenieSource } from "./opsgenie";
import { overseerrSource } from "./overseerr";
import { paddleSource } from "./paddle";
import { pagerdutySource } from "./pagerduty";
import { sentrySource } from "./sentry";
import { shopifySource } from "./shopify";
import { statuspageSource } from "./statuspage";
import { stripeSource } from "./stripe";
import { supabaseSource } from "./supabase";
import { uptimeKumaSource } from "./uptime-kuma";
import { vercelSource } from "./vercel";

// Tried in order, first match wins. Header-based detection first, payload-shape
// detection after; a more specific source must come before the one it overlaps
// with (Gitea also sends X-GitHub-Event, Grafana is an Alertmanager superset).
export const SOURCES: AutoSource[] = [
  // Vendor header (some also fall back to a payload shape).
  giteaSource,
  githubSource,
  gitlabSource,
  bitbucketSource,
  sentrySource,
  linearSource,
  vercelSource,
  circleciSource,
  shopifySource,
  pagerdutySource,
  awsSnsSource,
  paddleSource,
  lemonsqueezySource,
  netlifySource,
  jiraSource,
  alchemySource,
  stripeSource,
  // Payload shape only.
  azureMonitorSource,
  gcpMonitoringSource,
  statuspageSource,
  opsgenieSource,
  uptimeKumaSource,
  dockerHubSource,
  arrSource,
  overseerrSource,
  supabaseSource,
  betterStackSource,
  graylogSource,
  jenkinsSource,
  grafanaSource,
  alertmanagerSource,
];
