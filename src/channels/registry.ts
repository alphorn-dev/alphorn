import type { ChannelHandler } from "./types";
import { TEST_NOTIFICATION, TEST_CONTEXT } from "./test-notification";

const handlers = new Map<string, ChannelHandler<unknown>>();

/**
 * Channels that omit `test` get a default: send() with a canned test
 * notification. A channel that wants no test button at all (e.g. sse) must
 * explicitly set `test: undefined` — that's how it's distinguished from
 * "just didn't override it".
 */
export function registerChannel<TConfig>(handler: ChannelHandler<TConfig>) {
  const test =
    "test" in handler
      ? handler.test
      : (config: TConfig) => handler.send(config, TEST_NOTIFICATION, TEST_CONTEXT);
  handlers.set(handler.type, { ...handler, test } as unknown as ChannelHandler<unknown>);
}

export function getChannel(type: string): ChannelHandler<unknown> | undefined {
  return handlers.get(type);
}

export function getAllChannels(): ChannelHandler<unknown>[] {
  return Array.from(handlers.values());
}

export function getChannelTypes(): string[] {
  return Array.from(handlers.keys());
}
