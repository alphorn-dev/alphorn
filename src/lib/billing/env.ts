import { z } from "zod";

const schema = z
  .object({
    PADDLE_API_KEY: z.string().min(1).optional(),
    PADDLE_WEBHOOK_SECRET: z.string().min(1).optional(),
    PADDLE_PRICE_ID_PRO: z.string().startsWith("pri_").optional(),
    PADDLE_PRICE_ID_BUSINESS: z.string().startsWith("pri_").optional(),
    PADDLE_PRICE_ID_MESSAGE_PACK: z.string().startsWith("pri_").optional(),
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: z.string().min(1).optional(),
    NEXT_PUBLIC_PADDLE_ENVIRONMENT: z
      .enum(["sandbox", "production"])
      .default("production"),
  })
  .superRefine((env, ctx) => {
    if (!env.PADDLE_API_KEY) return; // billing disabled — nothing else required
    const required = [
      "PADDLE_WEBHOOK_SECRET",
      "PADDLE_PRICE_ID_PRO",
      "PADDLE_PRICE_ID_BUSINESS",
      "PADDLE_PRICE_ID_MESSAGE_PACK",
      "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN",
    ] as const;
    for (const key of required) {
      if (!env[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required when PADDLE_API_KEY is set`,
        });
      }
    }
  });

let cached: z.infer<typeof schema> | null = null;

export function paddleEnv() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid Paddle environment: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  cached = parsed.data;
  return cached;
}
