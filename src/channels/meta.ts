import type { ChannelMeta } from "./meta-types";
import { meta as telegram } from "./telegram.meta";
import { meta as discord } from "./discord.meta";
import { meta as webhook } from "./webhook.meta";
import { meta as smtp } from "./smtp.meta";
import { meta as slack } from "./slack.meta";
import { meta as teams } from "./teams.meta";
import { meta as googleChat } from "./google-chat.meta";
import { meta as matrix } from "./matrix.meta";
import { meta as mattermost } from "./mattermost.meta";
import { meta as ntfy } from "./ntfy.meta";
import { meta as pushover } from "./pushover.meta";
import { meta as gotify } from "./gotify.meta";
import { meta as twilioSms } from "./twilio-sms.meta";
import { meta as sse } from "./sse.meta";
import { meta as rocketchat } from "./rocketchat.meta";
import { meta as zulip } from "./zulip.meta";
import { meta as pagerduty } from "./pagerduty.meta";
import { meta as opsgenie } from "./opsgenie.meta";
import { meta as sendgrid } from "./sendgrid.meta";
import { meta as mailgun } from "./mailgun.meta";
import { meta as vonageSms } from "./vonage-sms.meta";

export type { ChannelMeta };

/**
 * Client-safe channel metadata. No Node.js dependencies — used by UI
 * components to render channel lists and config forms. Each channel's
 * metadata lives once, in its `<type>.meta.ts` file, and is imported by
 * both this barrel and that channel's own handler (`<type>.ts`), so there
 * is a single source of truth instead of two independently hand-maintained
 * copies.
 */
const channelMeta: ChannelMeta[] = [
  telegram,
  discord,
  webhook,
  smtp,
  slack,
  teams,
  googleChat,
  matrix,
  mattermost,
  ntfy,
  pushover,
  gotify,
  twilioSms,
  sse,
  rocketchat,
  zulip,
  pagerduty,
  opsgenie,
  sendgrid,
  mailgun,
  vonageSms,
];

export function getAllChannelMeta(): ChannelMeta[] {
  return channelMeta;
}

export function getChannelMeta(type: string): ChannelMeta | undefined {
  return channelMeta.find((m) => m.type === type);
}
