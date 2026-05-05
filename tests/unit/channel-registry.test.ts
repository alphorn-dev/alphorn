import { describe, it, expect } from "vitest";
import {
  registerChannel,
  getChannel,
  getAllChannels,
  getChannelTypes,
} from "@/channels/registry";
import { z } from "zod";
import type { ChannelHandler } from "@/channels/types";

function fakeHandler(type: string): ChannelHandler {
  return {
    type,
    displayName: type.toUpperCase(),
    description: `${type} channel`,
    icon: "Bell",
    configSchema: z.object({ url: z.string() }),
    configFields: [{ key: "url", label: "URL", type: "text" as const }],
    async send() {},
  };
}

describe("channel registry", () => {
  it("registerChannel + getChannel round-trip", () => {
    const handler = fakeHandler("test-ch-1");
    registerChannel(handler);
    expect(getChannel("test-ch-1")).toBe(handler);
  });

  it("getChannel returns undefined for unknown type", () => {
    expect(getChannel("nonexistent-channel-xyz")).toBeUndefined();
  });

  it("getAllChannels includes registered handler", () => {
    const handler = fakeHandler("test-ch-2");
    registerChannel(handler);
    const all = getAllChannels();
    expect(all).toContain(handler);
  });

  it("getChannelTypes includes registered type", () => {
    registerChannel(fakeHandler("test-ch-3"));
    expect(getChannelTypes()).toContain("test-ch-3");
  });

  it("registering same type overwrites previous", () => {
    const h1 = fakeHandler("test-ch-overwrite");
    const h2 = fakeHandler("test-ch-overwrite");
    registerChannel(h1);
    registerChannel(h2);
    expect(getChannel("test-ch-overwrite")).toBe(h2);
  });
});
