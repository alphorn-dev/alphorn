import type { ChannelHandler } from "./types";

const handlers = new Map<string, ChannelHandler>();

export function registerChannel(handler: ChannelHandler) {
  handlers.set(handler.type, handler);
}

export function getChannel(type: string): ChannelHandler | undefined {
  return handlers.get(type);
}

export function getAllChannels(): ChannelHandler[] {
  return Array.from(handlers.values());
}

export function getChannelTypes(): string[] {
  return Array.from(handlers.keys());
}
