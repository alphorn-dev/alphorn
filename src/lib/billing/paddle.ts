import { Paddle, Environment } from "@paddle/paddle-node-sdk";
import { paddleEnv } from "./env";

let paddleClient: Paddle | null = null;

/**
 * Returns the Paddle client, or null if billing is not configured.
 * Self-hosted instances without PADDLE_API_KEY skip all billing.
 */
export function getPaddle(): Paddle | null {
  const env = paddleEnv();
  if (!env.PADDLE_API_KEY) return null;

  if (!paddleClient) {
    paddleClient = new Paddle(env.PADDLE_API_KEY, {
      environment:
        env.NEXT_PUBLIC_PADDLE_ENVIRONMENT === "sandbox"
          ? Environment.sandbox
          : Environment.production,
    });
  }

  return paddleClient;
}

export function isBillingEnabled(): boolean {
  return !!paddleEnv().PADDLE_API_KEY;
}
