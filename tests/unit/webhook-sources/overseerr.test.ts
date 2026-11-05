import { describe, it, expect } from "vitest";
import { overseerrSource } from "@/lib/webhook-extract/sources/overseerr";

// Shapes follow the default JSON template (keys after placeholder expansion).
const requester = {
  request_id: "abc123",
  requestedBy_email: "alice@example.com",
  requestedBy_username: "alice",
  requestedBy_avatar: "",
  requestedBy_settings_discordId: "",
  requestedBy_settings_telegramChatId: "",
};

const movieMedia = {
  media_type: "movie",
  tmdbId: "1111",
  tvdbId: "",
  status: "PENDING",
  status4k: "UNKNOWN",
};

const requestApproved = {
  notification_type: "MEDIA_APPROVED",
  event: "Request Approved",
  subject: "Example Movie (2025)",
  message: "Your request has been approved.",
  image: "https://image.example.com/poster.jpg",
  media: movieMedia,
  request: requester,
  issue: null,
  comment: null,
  extra: [],
};

const mediaFailed = {
  notification_type: "MEDIA_FAILED",
  event: "Media Failed",
  subject: "Example Show",
  message: "The request could not be processed.",
  image: "",
  media: { ...movieMedia, media_type: "tv" },
  request: requester,
  issue: null,
  comment: null,
  extra: [],
};

const issueCreated = {
  notification_type: "ISSUE_CREATED",
  event: "New Audio Issue Reported",
  subject: "Example Movie (2025)",
  message: "Audio is out of sync after 10 minutes.",
  image: "",
  media: movieMedia,
  request: null,
  issue: {
    issue_id: "42",
    issue_type: "AUDIO",
    issue_status: "OPEN",
    reportedBy_username: "bob",
    reportedBy_email: "bob@example.com",
  },
  comment: null,
  extra: [],
};

const issueResolved = {
  ...issueCreated,
  notification_type: "ISSUE_RESOLVED",
  event: "Issue Resolved",
  message: "",
  issue: { ...issueCreated.issue, issue_status: "RESOLVED" },
};

const issueComment = {
  ...issueCreated,
  notification_type: "ISSUE_COMMENT",
  event: "New Comment on Audio Issue",
  message: "",
  comment: {
    comment_message: "Looking into it.",
    commentedBy_username: "alice",
    commentedBy_email: "alice@example.com",
  },
};

describe("overseerrSource", () => {
  it("detects the default template by shape", () => {
    expect(overseerrSource.detect(requestApproved, {})).toBe(true);
    expect(overseerrSource.detect(issueCreated, {})).toBe(true);
    expect(overseerrSource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
    expect(overseerrSource.detect({ action: "opened", repository: { full_name: "a/b" } }, {})).toBe(false);
    // notification_type alone is not enough without subject and media/request.
    expect(overseerrSource.detect({ notification_type: "MEDIA_FAILED", subject: "x" }, {})).toBe(false);
  });

  it("formats an approved request with the requester", () => {
    expect(overseerrSource.extract(requestApproved, {})).toEqual({
      title: "Request Approved: Example Movie (2025)",
      message: "Your request has been approved.\nby alice",
      priority: null,
      tags: ["overseerr", "media_approved", "movie"],
    });
  });

  it("raises priority for failed media", () => {
    expect(overseerrSource.extract(mediaFailed, {})).toMatchObject({
      title: "Media Failed: Example Show",
      priority: 4,
      tags: ["overseerr", "media_failed", "tv"],
    });
  });

  it("raises priority for a newly created issue", () => {
    expect(overseerrSource.extract(issueCreated, {})).toEqual({
      title: "New Audio Issue Reported: Example Movie (2025)",
      message: "Audio is out of sync after 10 minutes.\nby bob",
      priority: 4,
      tags: ["overseerr", "issue_created", "movie"],
    });
  });

  it("marks a resolved issue as recovered", () => {
    expect(overseerrSource.extract(issueResolved, {})).toMatchObject({
      title: "Issue Resolved: Example Movie (2025)",
      message: "by bob",
      priority: 2,
    });
  });

  it("includes the comment text for issue comments", () => {
    expect(overseerrSource.extract(issueComment, {})).toEqual({
      title: "New Comment on Audio Issue: Example Movie (2025)",
      message: "Looking into it.\nby alice",
      priority: null,
      tags: ["overseerr", "issue_comment", "movie"],
    });
  });

  it("falls back to a generic title for unknown types and missing fields", () => {
    const result = overseerrSource.extract(
      { notification_type: "SOMETHING_NEW", subject: "Example", media: null },
      {}
    );
    expect(result).toEqual({
      title: "Overseerr something new: Example",
      message: "",
      priority: null,
      tags: ["overseerr", "something_new"],
    });
  });

  it("does not treat prototype keys as priorities", () => {
    const result = overseerrSource.extract(
      { notification_type: "constructor", subject: "Example", media: null },
      {}
    );
    expect(result.priority).toBeNull();
  });

  it("does not throw on malformed payloads", () => {
    const malformed = [
      { notification_type: 42, subject: ["x"], media: "oops", request: 7 },
      { notification_type: "MEDIA_FAILED", subject: "Example", media: null, message: { nested: true } },
      { notification_type: "ISSUE_CREATED", subject: "Example", issue: "not-an-object" },
      {},
    ];
    for (const body of malformed) {
      expect(() => overseerrSource.extract(body, {})).not.toThrow();
    }
    expect(overseerrSource.extract(malformed[1], {})).toMatchObject({
      title: "Overseerr media failed: Example",
      message: "",
      priority: 4,
    });
  });
});
