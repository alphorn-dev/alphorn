import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { APP_VERSION } from "@/lib/version";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", version: APP_VERSION });
  } catch {
    return NextResponse.json({ status: "error", message: "database unreachable", version: APP_VERSION }, { status: 503 });
  }
}
