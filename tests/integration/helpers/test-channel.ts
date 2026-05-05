import { z } from "zod";
import { registerChannel } from "@/channels/registry";
import { PermanentChannelError } from "@/channels/errors";
import type {
  ChannelHandler,
  DeliveryContext,
  Notification,
} from "@/channels/types";

export const TEST_CHANNEL_TYPE = "integration-test-channel";

type Behavior =
  | { kind: "success" }
  | { kind: "transient"; message: string }
  | { kind: "permanent"; message: string };

interface Call {
  config: unknown;
  notification: Notification;
  context: DeliveryContext;
}

let behavior: Behavior = { kind: "success" };
const calls: Call[] = [];

export function setTestChannelBehavior(next: Behavior): void {
  behavior = next;
}

export function resetTestChannel(): void {
  behavior = { kind: "success" };
  calls.length = 0;
}

export function testChannelCalls(): ReadonlyArray<Call> {
  return calls;
}

const handler: ChannelHandler = {
  type: TEST_CHANNEL_TYPE,
  displayName: "Integration Test Channel",
  description: "Test-only channel used by the integration suite",
  icon: "flask",
  configSchema: z.object({ label: z.string().optional() }),
  configFields: [],
  async send(config, notification, context) {
    calls.push({ config, notification, context });
    switch (behavior.kind) {
      case "success":
        return;
      case "transient":
        throw new Error(behavior.message);
      case "permanent":
        throw new PermanentChannelError(behavior.message);
    }
  },
};

registerChannel(handler);
