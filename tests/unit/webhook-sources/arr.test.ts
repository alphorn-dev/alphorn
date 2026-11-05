import { describe, it, expect } from "vitest";
import { arrSource } from "@/lib/webhook-extract/sources/arr";

const SONARR_UA = { "user-agent": "Sonarr/4.0.9.2244 (debian 12)" };

const sonarrGrab = {
  eventType: "Grab",
  instanceName: "Sonarr",
  applicationUrl: "https://sonarr.example.com/",
  series: { id: 1, title: "Example Show", year: 2020, tvdbId: 123 },
  episodes: [{ id: 10, seasonNumber: 1, episodeNumber: 2, title: "Pilot" }],
  release: {
    quality: "WEBDL-1080p",
    qualityVersion: 1,
    releaseGroup: "GRP",
    releaseTitle: "Example.Show.S01E02.1080p.WEB-DL",
    indexer: "ExampleIndexer",
    size: 123,
  },
  downloadClient: "qBittorrent",
  downloadClientType: "QBittorrent",
  downloadId: "abc123",
};

describe("arrSource: Sonarr", () => {
  it("detects a Sonarr grab by eventType and instanceName", () => {
    expect(arrSource.detect(sonarrGrab, {})).toBe(true);
  });

  it("formats a grab with the episode code and release lines", () => {
    expect(arrSource.extract(sonarrGrab, {})).toEqual({
      title: "[Example Show] Grabbed: S01E02 Pilot",
      message:
        "Example.Show.S01E02.1080p.WEB-DL\nQuality: WEBDL-1080p\nIndexer: ExampleIndexer\nClient: qBittorrent",
      priority: null,
      tags: ["sonarr", "grab"],
    });
  });

  it("formats an upgrade download with multiple episodes", () => {
    const result = arrSource.extract(
      {
        eventType: "Download",
        instanceName: "Sonarr",
        series: { id: 1, title: "Example Show" },
        episodes: [
          { seasonNumber: 1, episodeNumber: 2, title: "Pilot" },
          { seasonNumber: 1, episodeNumber: 3, title: "Second" },
        ],
        isUpgrade: true,
        release: { releaseTitle: "Example.Show.S01E02-E03" },
      },
      {}
    );
    expect(result).toMatchObject({
      title: "[Example Show] Upgraded: S01E02 Pilot +1",
      priority: null,
      tags: ["sonarr", "download"],
    });
  });

  it("maps a warning health check to priority 3 and tags the level", () => {
    const result = arrSource.extract(
      {
        eventType: "Health",
        instanceName: "Sonarr",
        level: "warning",
        message: "Indexers are unavailable due to failures",
        type: "IndexerStatusCheck",
        wikiUrl: "https://wiki.servarr.com/sonarr/system#indexers-are-unavailable",
      },
      SONARR_UA
    );
    expect(result).toEqual({
      title: "[Sonarr] Health warning: IndexerStatusCheck",
      message:
        "Indexers are unavailable due to failures\nhttps://wiki.servarr.com/sonarr/system#indexers-are-unavailable",
      priority: 3,
      tags: ["sonarr", "health", "warning"],
    });
  });

  it("maps a numeric error level (HealthCheckResult 3) to priority 4", () => {
    const result = arrSource.extract(
      { eventType: "Health", instanceName: "Sonarr", level: 3, message: "Disk full", type: "DiskSpace" },
      {}
    );
    expect(result).toMatchObject({ title: "[Sonarr] Health error: DiskSpace", priority: 4 });
  });

  it("marks a restored health check as priority 2", () => {
    const result = arrSource.extract(
      {
        eventType: "HealthRestored",
        instanceName: "Sonarr",
        level: "error",
        message: "Download client unavailable",
        type: "DownloadClientCheck",
      },
      {}
    );
    expect(result).toMatchObject({
      title: "[Sonarr] Health restored: DownloadClientCheck",
      priority: 2,
      tags: ["sonarr", "healthrestored", "error"],
    });
  });

  it("formats the test event without the fake series title", () => {
    const result = arrSource.extract(
      { eventType: "Test", instanceName: "Sonarr", series: { id: 1, title: "Test Title" } },
      {}
    );
    expect(result).toEqual({
      title: "Sonarr test notification",
      message: "",
      priority: null,
      tags: ["sonarr", "test"],
    });
  });

  it("falls back to a readable title for unmapped event types", () => {
    const result = arrSource.extract(
      { eventType: "SeriesAdd", instanceName: "Sonarr", series: { title: "Example Show" } },
      {}
    );
    expect(result).toMatchObject({ title: "[Example Show] Series Add", priority: null, tags: ["sonarr", "seriesadd"] });
  });
});

describe("arrSource: Radarr, Lidarr, Readarr, Prowlarr", () => {
  it("formats a Radarr grab with the movie year and release title", () => {
    const result = arrSource.extract(
      {
        eventType: "Grab",
        instanceName: "Radarr",
        movie: { id: 1, title: "Example Movie", year: 2021, tmdbId: 1 },
        release: { quality: "Bluray-1080p", releaseTitle: "Example.Movie.2021.1080p.BluRay", indexer: "Idx" },
        downloadClient: "SABnzbd",
      },
      {}
    );
    expect(result).toEqual({
      title: "[Example Movie (2021)] Grabbed: Example.Movie.2021.1080p.BluRay",
      message: "Example.Movie.2021.1080p.BluRay\nQuality: Bluray-1080p\nIndexer: Idx\nClient: SABnzbd",
      priority: null,
      tags: ["radarr", "grab"],
    });
  });

  it("formats a Lidarr download with the album title", () => {
    const result = arrSource.extract(
      {
        eventType: "Download",
        instanceName: "Lidarr",
        artist: { id: 1, name: "Example Artist" },
        albums: [{ id: 2, title: "Example Album" }],
      },
      {}
    );
    expect(result).toMatchObject({
      title: "[Example Artist] Downloaded: Example Album",
      tags: ["lidarr", "download"],
    });
  });

  it("formats a Readarr grab with the book title", () => {
    const result = arrSource.extract(
      {
        eventType: "Grab",
        instanceName: "Readarr",
        author: { id: 1, name: "Example Author" },
        books: [
          { id: 3, title: "Example Book" },
          { id: 4, title: "Second" },
        ],
      },
      {}
    );
    expect(result).toMatchObject({
      title: "[Example Author] Grabbed: Example Book +1",
      tags: ["readarr", "grab"],
    });
  });

  it("detects Prowlarr by User-Agent and formats an application update", () => {
    const body = {
      eventType: "ApplicationUpdate",
      instanceName: "Prowlarr",
      message: "Prowlarr has been updated to version 1.2.0",
      previousVersion: "1.1.0",
      newVersion: "1.2.0",
    };
    const headers = { "user-agent": "Prowlarr/1.1.0.0 (debian 12)" };
    expect(arrSource.detect(body, headers)).toBe(true);
    expect(arrSource.extract(body, headers)).toEqual({
      title: "[Prowlarr] Updated to 1.2.0",
      message: "Prowlarr has been updated to version 1.2.0\nPrevious version: 1.1.0",
      priority: null,
      tags: ["prowlarr", "applicationupdate"],
    });
  });
});

describe("arrSource: detect", () => {
  it("does not match generic payloads", () => {
    expect(arrSource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
  });

  it("does not match a GitHub-like payload", () => {
    expect(arrSource.detect({ action: "opened", repository: { full_name: "a/b" } }, {})).toBe(false);
  });

  it("requires a known eventType", () => {
    expect(arrSource.detect({ eventType: "Grab" }, {})).toBe(false);
    expect(arrSource.detect({ eventType: "Deploy", instanceName: "Sonarr" }, {})).toBe(false);
  });

  it("accepts a known eventType with a Servarr User-Agent and no instanceName", () => {
    expect(arrSource.detect({ eventType: "Grab", series: { title: "Example Show" } }, SONARR_UA)).toBe(true);
  });
});

describe("arrSource: malformed payloads", () => {
  it("does not throw on wrong types and missing fields", () => {
    const result = arrSource.extract(
      {
        eventType: "Grab",
        instanceName: "Sonarr",
        series: 5,
        episodes: [null, 3, { seasonNumber: "x" }],
        release: "bad",
      },
      {}
    );
    expect(result.title).toBe("[Sonarr] Grabbed: S00E00 +2");
    expect(result.message).toBe("");
  });

  it("does not produce undefined or prototype text for unknown eventType values", () => {
    const result = arrSource.extract({ eventType: "constructor", instanceName: "Sonarr" }, {});
    expect(result.title).not.toContain("undefined");
    expect(result.title).not.toContain("function");
  });
});
