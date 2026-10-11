import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  addConnection,
  removeConnection,
} from "@/lib/sse/connection-registry";
import { formatSseComment } from "@/lib/sse/format";

export const dynamic = "force-dynamic";

const KEEPALIVE_INTERVAL_MS = 30_000;

function resolveClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  // In standalone mode the dedicated SSE server owns live connections; this
  // Next route is never where events are published to. Fail loudly so a
  // misconfigured load balancer surfaces immediately instead of handing the
  // client a stream that silently receives nothing.
  if (process.env.SSE_MODE === "standalone") {
    return new Response(
      "SSE runs in standalone mode; route /api/stream/* to the SSE server",
      { status: 503 },
    );
  }

  const { publicId } = await params;

  const channel = await prisma.channel.findUnique({
    where: { publicId },
  });

  if (!channel || channel.type !== "sse" || !channel.enabled) {
    return new Response("Not found", { status: 404 });
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Idempotent: runs on abort, on a failed write, or both. Only ever called
  // asynchronously or after `keepalive` below is assigned.
  const cleanup = () => {
    clearInterval(keepalive);
    removeConnection(channel.id, sseWriter);
    sseWriter.close();
  };

  // writer.write/close return promises that REJECT (not throw) once the
  // client is gone. Unhandled, those rejections crash the process; handled,
  // they are our only signal to evict a connection that vanished without an
  // abort event (killed socket, LB timeout).
  const sseWriter = {
    write(chunk: string) {
      writer.write(encoder.encode(chunk)).catch(cleanup);
    },
    close() {
      writer.close().catch(() => {
        // Already closed
      });
    },
  };

  const ip = resolveClientIp(req);
  const result = addConnection(channel.id, sseWriter, ip);
  if (!result.ok) {
    sseWriter.close();
    return new Response("Too many connections", { status: 429 });
  }

  sseWriter.write(formatSseComment("connected"));

  const keepalive = setInterval(() => {
    sseWriter.write(formatSseComment("keepalive"));
  }, KEEPALIVE_INTERVAL_MS);

  // A client that disconnected while we awaited the DB never fires "abort".
  if (req.signal.aborted) cleanup();
  else req.signal.addEventListener("abort", cleanup, { once: true });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
