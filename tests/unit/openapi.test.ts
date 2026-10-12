import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

// public/openapi.json is hand-written. This test catches drift between it and
// the route handlers: every status a route can return must be documented, and
// the spec must not document statuses the route no longer returns.
const root = path.resolve(__dirname, "../..");
const spec = JSON.parse(readFileSync(path.join(root, "public/openapi.json"), "utf8"));

function routeStatuses(file: string): string[] {
  const source = readFileSync(path.join(root, file), "utf8");
  return [...source.matchAll(/status:\s*(\d{3})/g)].map((m) => m[1]);
}

const routes = [
  // [spec path, method, route file, implicit success status without an explicit `status:`]
  ["/n/{publicId}", "post", "src/app/n/[publicId]/route.ts", null],
  ["/api/stream/{publicId}", "get", "src/app/api/stream/[publicId]/route.ts", "200"],
] as const;

describe("public/openapi.json", () => {
  it.each(routes)("documents exactly the statuses %s returns", (specPath, method, file, implicit) => {
    const documented = Object.keys(spec.paths[specPath][method].responses).sort();
    const returned = [...new Set([...routeStatuses(file), ...(implicit ? [implicit] : [])])].sort();
    expect(documented).toEqual(returned);
  });

  it("documents only the routes listed above", () => {
    expect(Object.keys(spec.paths).sort()).toEqual(routes.map(([p]) => p).sort());
  });
});
