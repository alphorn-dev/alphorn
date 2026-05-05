import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import pino from "pino";
import { prisma } from "../lib/db";
import {
  addConnection,
  removeConnection,
  publish,
} from "../lib/sse/connection-registry";
import { formatSseComment, formatSseEvent } from "../lib/sse/format";
import type { Notification } from "../channels/types";
import type { SseConfig } from "../lib/sse/format";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(process.env.NODE_ENV !== "production" && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, singleLine: true },
    },
  }),
});

const PORT = parseInt(process.env.SSE_PORT || "4000", 10);
const INTERNAL_SECRET = process.env.SSE_INTERNAL_SECRET;
const KEEPALIVE_INTERVAL_MS = 30_000;
const MAX_BODY_BYTES = 1024 * 1024; // 1MB

if (!INTERNAL_SECRET) {
  logger.fatal("SSE_INTERNAL_SECRET is required in standalone mode");
  process.exit(1);
}

function verifyAuth(authHeader: string | undefined): boolean {
  const expected = Buffer.from(`Bearer ${INTERNAL_SECRET}`);
  const actual = Buffer.from(authHeader || "");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);

  // GET /stream/[publicId] — SSE stream for clients
  const streamMatch = url.pathname.match(/^\/stream\/([^/]+)$/);
  if (streamMatch && req.method === "GET") {
    const publicId = streamMatch[1];

    const channel = await prisma.channel.findUnique({
      where: { publicId },
    });

    if (!channel || channel.type !== "sse" || !channel.enabled) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const sseWriter = {
      write(chunk: string) {
        res.write(chunk);
      },
      close() {
        res.end();
      },
    };

    const forwarded = req.headers["x-forwarded-for"];
    const forwardedFirst = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded?.split(",")[0]?.trim();
    const realIp = req.headers["x-real-ip"];
    const realIpFirst = Array.isArray(realIp) ? realIp[0] : realIp;
    const ip =
      forwardedFirst ||
      realIpFirst ||
      req.socket.remoteAddress ||
      "unknown";

    const result = addConnection(channel.id, sseWriter, ip);
    if (!result.ok) {
      res.writeHead(429);
      res.end("Too many connections");
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    logger.info({ channelId: channel.id, publicId }, "SSE client connected");
    sseWriter.write(formatSseComment("connected"));

    const keepalive = setInterval(() => {
      try {
        sseWriter.write(formatSseComment("keepalive"));
      } catch {
        clearInterval(keepalive);
        removeConnection(channel.id, sseWriter);
        sseWriter.close();
      }
    }, KEEPALIVE_INTERVAL_MS);

    req.on("close", () => {
      clearInterval(keepalive);
      removeConnection(channel.id, sseWriter);
      logger.info({ channelId: channel.id, publicId }, "SSE client disconnected");
    });

    return;
  }

  // POST /publish/[channelId] — internal endpoint from Alphorn
  const publishMatch = url.pathname.match(/^\/publish\/([^/]+)$/);
  if (publishMatch && req.method === "POST") {
    if (!verifyAuth(req.headers.authorization)) {
      res.writeHead(401);
      res.end("Unauthorized");
      return;
    }

    const channelId = publishMatch[1];
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        res.writeHead(413);
        res.end("Payload too large");
        return;
      }
    }

    let payload: { notification: Notification; config: SseConfig };
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400);
      res.end("Invalid JSON");
      return;
    }

    const event = formatSseEvent(payload.notification, payload.config);
    const sent = publish(channelId, event);
    logger.info({ channelId, clientsSent: sent }, "SSE event published");

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ sent }));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  logger.info({ port: PORT }, "SSE standalone server started");
});
