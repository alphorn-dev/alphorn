import { describe, it, expect } from "vitest";
import { isSlackPayload, normalizeSlackPayload } from "@/lib/slack-compat";

describe("isSlackPayload", () => {
  it("returns true for payload with text only", () => {
    expect(isSlackPayload({ text: "hello" })).toBe(true);
  });

  it("returns true for payload with blocks", () => {
    expect(isSlackPayload({ blocks: [] })).toBe(true);
  });

  it("returns true for payload with attachments", () => {
    expect(isSlackPayload({ attachments: [] })).toBe(true);
  });

  it("returns false when native field 'message' is present", () => {
    expect(isSlackPayload({ text: "hello", message: "world" })).toBe(false);
  });

  it("returns false when native field 'body' is present", () => {
    expect(isSlackPayload({ text: "hello", body: "world" })).toBe(false);
  });

  it("returns false when native field 'msg' is present", () => {
    expect(isSlackPayload({ text: "hello", msg: "world" })).toBe(false);
  });

  it("returns false when no slack fields present", () => {
    expect(isSlackPayload({ title: "test" })).toBe(false);
  });
});

describe("normalizeSlackPayload", () => {
  it("extracts message from text field", () => {
    const result = normalizeSlackPayload({ text: "Hello world" });
    expect(result.message).toBe("Hello world");
    expect(result.title).toBeNull();
  });

  it("extracts message from section blocks when no text", () => {
    const result = normalizeSlackPayload({
      blocks: [
        { type: "section", text: { text: "Line 1" } },
        { type: "section", text: { text: "Line 2" } },
      ],
    });
    expect(result.message).toBe("Line 1\nLine 2");
  });

  it("ignores non-section blocks", () => {
    const result = normalizeSlackPayload({
      blocks: [
        { type: "divider" },
        { type: "section", text: { text: "Content" } },
      ],
    });
    expect(result.message).toBe("Content");
  });

  it("extracts message from attachment fallback", () => {
    const result = normalizeSlackPayload({
      attachments: [{ fallback: "Fallback text" }],
    });
    expect(result.message).toBe("Fallback text");
  });

  it("extracts message from attachment text", () => {
    const result = normalizeSlackPayload({
      attachments: [{ text: "Attachment body" }],
    });
    expect(result.message).toBe("Attachment body");
  });

  it("extracts message from attachment pretext when fallback and text are absent", () => {
    const result = normalizeSlackPayload({
      attachments: [{ pretext: "Attachment pretext" }],
    });
    expect(result.message).toBe("Attachment pretext");
  });

  it("extracts title from attachment title", () => {
    const result = normalizeSlackPayload({
      text: "msg",
      attachments: [{ title: "Alert Title" }],
    });
    expect(result.title).toBe("Alert Title");
    expect(result.message).toBe("msg");
  });

  it("prefers text over blocks and attachments", () => {
    const result = normalizeSlackPayload({
      text: "Primary",
      blocks: [{ type: "section", text: { text: "Block" } }],
      attachments: [{ text: "Attachment" }],
    });
    expect(result.message).toBe("Primary");
  });

  it("returns empty message when nothing extractable", () => {
    const result = normalizeSlackPayload({});
    expect(result.message).toBe("");
    expect(result.title).toBeNull();
  });

  it("returns empty message when attachments exist but contain no usable text", () => {
    const result = normalizeSlackPayload({
      attachments: [{ fallback: "", text: "", pretext: "" }],
    });
    expect(result.message).toBe("");
    expect(result.title).toBeNull();
  });
});
