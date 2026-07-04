import type { Notification, DeliveryContext } from "./types";

/** Canned notification used by the default test() a channel gets when it doesn't define its own. */
export const TEST_NOTIFICATION: Notification = {
  title: "Alphorn Test",
  message:
    "This is a test message from Alphorn. If you see this, your notification channel is configured correctly.",
};

export const TEST_CONTEXT: DeliveryContext = {
  channelId: "test",
  deliveryId: "test",
};
