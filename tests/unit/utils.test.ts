import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges class names and removes falsy values", () => {
    expect(cn("px-2", false && "hidden", "py-1")).toBe("px-2 py-1");
  });

  it("resolves conflicting Tailwind classes in favor of the later one", () => {
    expect(cn("px-2 text-sm", "px-4")).toBe("text-sm px-4");
  });
});
