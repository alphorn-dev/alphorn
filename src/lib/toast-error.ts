import { toast } from "sonner";
import { ZodError } from "zod";

const MAX_LEN = 200;

export function showError(err: unknown, fallback: string): void {
  const message = extractMessage(err, fallback);
  toast.error(message);
}

function extractMessage(err: unknown, fallback: string): string {
  if (typeof err === "string") {
    return isUserFriendly(err) ? err : fallback;
  }

  if (err instanceof ZodError && err.issues.length > 0) {
    const issue = err.issues[0];
    const path = issue.path
      .filter((p): p is string => typeof p === "string")
      .join(".");
    const msg = path ? `${path}: ${issue.message}` : issue.message;
    return isUserFriendly(msg) ? msg : fallback;
  }

  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message: unknown }).message;
    if (typeof msg === "string" && isUserFriendly(msg)) {
      return msg;
    }
  }

  return fallback;
}

function isUserFriendly(msg: string): boolean {
  if (!msg.trim()) return false;
  if (msg.length > MAX_LEN) return false;
  if (/An unexpected response was received from the server/i.test(msg)) return false;
  if (/Invalid `prisma\./.test(msg)) return false;
  if (/PrismaClient/.test(msg)) return false;
  if (/\n\s*at\s/.test(msg)) return false;
  if (/^\s*[[{]/.test(msg)) return false;
  return true;
}
