import { describe, it, expect } from "vitest";
import { extractHeuristic } from "@/lib/webhook-extract/heuristic";

describe("extractHeuristic", () => {
  it("extracts title and message from native-ish fields", () => {
    const result = extractHeuristic({ title: "Hi", message: "Hello there" });
    expect(result.title).toBe("Hi");
    expect(result.message).toBe("Hello there");
  });

  it("extracts GitHub issue shape", () => {
    const result = extractHeuristic({
      action: "opened",
      issue: { title: "Login broken", body: "Steps to reproduce..." },
      repository: { name: "alphorn" },
    });
    expect(result.title).toBe("opened: Login broken");
    expect(result.message).toBe("Steps to reproduce...");
  });

  it("extracts GitHub issue shape without action", () => {
    const result = extractHeuristic({
      issue: { title: "Login broken", body: "Steps to reproduce..." },
    });
    expect(result.title).toBe("Login broken");
    expect(result.message).toBe("Steps to reproduce...");
  });

  it("falls back through message key synonyms", () => {
    const result = extractHeuristic({ subject: "Alert", description: "Disk full" });
    expect(result.title).toBe("Alert");
    expect(result.message).toBe("Disk full");
  });

  it("uses 'content' as message fallback", () => {
    const result = extractHeuristic({ name: "Hook", content: "payload body" });
    expect(result.message).toBe("payload body");
  });

  it("returns null title when nothing matches", () => {
    const result = extractHeuristic({ unrelated: 1 });
    expect(result.title).toBeNull();
  });

  it("returns empty message when no plausible field exists", () => {
    const result = extractHeuristic({ unrelated: 1 });
    expect(result.message).toBe("");
  });

  it("ignores non-string candidates", () => {
    const result = extractHeuristic({ title: 42, message: { nested: true } });
    expect(result.title).toBeNull();
    expect(result.message).toBe("");
  });

  it("extracts priority when numeric", () => {
    const result = extractHeuristic({ message: "hi", priority: 7.4 });
    expect(result.priority).toBe(7);
  });

  it("returns null priority when absent", () => {
    const result = extractHeuristic({ message: "hi" });
    expect(result.priority).toBeNull();
  });

  it("extracts tags from string array", () => {
    const result = extractHeuristic({ message: "hi", tags: ["a", "b", 3] });
    expect(result.tags).toEqual(["a", "b"]);
  });

  it("extracts tags from comma string", () => {
    const result = extractHeuristic({ message: "hi", tags: "a,b" });
    expect(result.tags).toEqual(["a", "b"]);
  });

  it("returns empty tags when absent", () => {
    const result = extractHeuristic({ message: "hi" });
    expect(result.tags).toEqual([]);
  });

  it("does not pick the same field for title and message", () => {
    const result = extractHeuristic({ title: "Only this" });
    expect(result.title).toBe("Only this");
    expect(result.message).toBe("");
  });

  it("looks one level deep into wrapper objects", () => {
    const result = extractHeuristic({
      data: { title: "Wrapped", description: "inside" },
    });
    expect(result.title).toBe("Wrapped");
    expect(result.message).toBe("inside");
  });

  it("prefers top-level string over nested when both exist", () => {
    const result = extractHeuristic({
      title: "Top",
      data: { title: "Nested" },
    });
    expect(result.title).toBe("Top");
  });
});
