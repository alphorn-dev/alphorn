import { headers } from "next/headers";

export async function isHostedAlphorn(): Promise<boolean> {
  const host = (await headers()).get("host") ?? "";
  return host === "app.alphorn.dev";
}
