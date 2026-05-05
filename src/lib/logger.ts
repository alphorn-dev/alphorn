import pino from "pino";
import * as Sentry from "@sentry/nextjs";

const pinoLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(process.env.NODE_ENV !== "production" && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        singleLine: true,
      },
    },
  }),
});

const LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
type Level = (typeof LEVELS)[number];

type Bindings = Record<string, unknown>;
type LogFn = {
  (obj: Bindings, msg: string): void;
  (msg: string): void;
};

interface Logger {
  child(bindings: Bindings): Logger;
  trace: LogFn;
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  fatal: LogFn;
}

function toSentry(level: Level, mergedAttrs: Bindings, msg: string) {
  try {
    const fn = Sentry.logger[level];
    if (fn) {
      const attrs = Object.fromEntries(
        Object.entries(mergedAttrs).map(([k, v]) => [k, String(v)])
      );
      fn(msg, attrs);
    }

    // GlitchTip / classic Sentry only show issues from capture* APIs.
    // Promote warn/error/fatal to events so they show up there too.
    if (level === "error" || level === "fatal") {
      const err = [mergedAttrs.err, mergedAttrs.error].find(
        (v): v is Error => v instanceof Error,
      );
      if (err) {
        Sentry.captureException(err, { level, extra: mergedAttrs });
      } else {
        Sentry.captureMessage(msg, { level, extra: mergedAttrs });
      }
    } else if (level === "warn") {
      Sentry.captureMessage(msg, { level: "warning", extra: mergedAttrs });
    }
  } catch {
    // Never let Sentry forwarding break logging
  }
}

function wrapLogger(pino: pino.Logger, parentBindings: Bindings = {}): Logger {
  const wrapped = {} as Logger;

  wrapped.child = (bindings: Bindings) =>
    wrapLogger(pino.child(bindings), { ...parentBindings, ...bindings });

  for (const level of LEVELS) {
    wrapped[level] = ((objOrMsg: Bindings | string, maybeMsg?: string) => {
      if (typeof objOrMsg === "string") {
        pino[level](objOrMsg);
        toSentry(level, parentBindings, objOrMsg);
      } else {
        pino[level](objOrMsg, maybeMsg!);
        toSentry(level, { ...parentBindings, ...objOrMsg }, maybeMsg ?? "");
      }
    }) as LogFn;
  }

  return wrapped;
}

export const logger = wrapLogger(pinoLogger);
