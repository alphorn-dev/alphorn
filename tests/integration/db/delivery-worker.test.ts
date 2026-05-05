import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { handleDelivery } from "@/worker/deliver";
import { createDeliveryFixture } from "../helpers/factories";
import {
  setTestChannelBehavior,
  testChannelCalls,
} from "../helpers/test-channel";

const MAX_RETRIES = 5;

async function getDelivery(id: string) {
  const row = await prisma.delivery.findUniqueOrThrow({ where: { id } });
  return row;
}

describe("handleDelivery — worker integration", () => {
  it("marks the delivery DELIVERED on channel success and records one send call", async () => {
    const { deliveryId } = await createDeliveryFixture();

    await handleDelivery({ deliveryId });

    const row = await getDelivery(deliveryId);
    expect(row.status).toBe("DELIVERED");
    expect(row.attempts).toBe(1);
    expect(row.deliveredAt).toBeInstanceOf(Date);
    expect(row.lastError).toBeNull();

    const calls = testChannelCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.notification.message).toBe("World");
    expect(calls[0]!.context.deliveryId).toBe(deliveryId);
  });

  it("records FAILED and re-throws on a transient error when attempts remain", async () => {
    const { deliveryId } = await createDeliveryFixture();
    setTestChannelBehavior({ kind: "transient", message: "gateway 502" });

    await expect(handleDelivery({ deliveryId })).rejects.toThrow("gateway 502");

    const row = await getDelivery(deliveryId);
    expect(row.status).toBe("FAILED");
    expect(row.attempts).toBe(1);
    expect(row.lastError).toBe("gateway 502");
    expect(row.deliveredAt).toBeNull();
  });

  it("stops re-throwing once attempts reach MAX_RETRIES", async () => {
    const { deliveryId } = await createDeliveryFixture();
    await prisma.delivery.update({
      where: { id: deliveryId },
      data: { attempts: MAX_RETRIES - 1 },
    });
    setTestChannelBehavior({ kind: "transient", message: "still flaky" });

    // The Nth attempt increments to MAX_RETRIES and must NOT re-throw
    // (pg-boss would otherwise keep retrying past the terminal state).
    await expect(handleDelivery({ deliveryId })).resolves.toBeUndefined();

    const row = await getDelivery(deliveryId);
    expect(row.status).toBe("FAILED");
    expect(row.attempts).toBe(MAX_RETRIES);
    expect(row.lastError).toBe("still flaky");
  });

  it("treats PermanentChannelError as terminal on the first attempt", async () => {
    const { deliveryId } = await createDeliveryFixture();
    setTestChannelBehavior({
      kind: "permanent",
      message: "invalid webhook URL",
    });

    await expect(handleDelivery({ deliveryId })).resolves.toBeUndefined();

    const row = await getDelivery(deliveryId);
    expect(row.status).toBe("FAILED");
    expect(row.attempts).toBe(1);
    expect(row.lastError).toBe("invalid webhook URL");
  });

  it("fails without throwing when the channel type is unknown", async () => {
    const { deliveryId } = await createDeliveryFixture({
      channelType: "not-a-real-channel-type",
    });

    await expect(handleDelivery({ deliveryId })).resolves.toBeUndefined();

    const row = await getDelivery(deliveryId);
    expect(row.status).toBe("FAILED");
    expect(row.lastError).toContain("Unknown channel type");
    // attempt counter still bumps so we can see how many times pg-boss picked it up
    expect(row.attempts).toBe(1);
    expect(testChannelCalls()).toHaveLength(0);
  });

  it("throws when the deliveryId does not exist", async () => {
    await expect(
      handleDelivery({ deliveryId: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toThrow(/not found/);
  });

  it("propagates the trace context argument into the channel call", async () => {
    const { deliveryId } = await createDeliveryFixture();
    const trace = ["upstream_public_id"];

    await handleDelivery({ deliveryId, trace });

    const [call] = testChannelCalls();
    expect(call!.context.trace).toEqual(trace);
  });
});
