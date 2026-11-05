// Sonarr, Radarr, Lidarr, Readarr, Prowlarr and Whisparr "Webhook" connection.
// Docs: https://wiki.servarr.com/sonarr/settings#connections
// Payloads: https://github.com/Sonarr/Sonarr/tree/develop/src/NzbDrone.Core/Notifications/Webhook
// The apps always send eventType + instanceName. The User-Agent ("Sonarr/4.0.x (...)")
// is a second signal, but users can override headers, so the payload is the main check.

import {
  resolvePath,
  str,
  num,
  list,
  lines,
  tags,
  type AutoSource,
  type Body,
  type AutoResult,
} from "./util";

const APP_NAMES = ["Sonarr", "Radarr", "Lidarr", "Readarr", "Prowlarr", "Whisparr"];
const UA_PATTERN = new RegExp(`^(${APP_NAMES.join("|")})/`);
const APP_BY_OBJECT: Record<string, string> = { series: "Sonarr", movie: "Radarr", artist: "Lidarr", author: "Readarr" };
const EVENT_TYPES = new Set([
  "Test", "Grab", "Download", "Rename", "Retag", "Health", "HealthRestored", "ApplicationUpdate",
  "ManualInteractionRequired", "SeriesAdd", "SeriesDelete", "EpisodeFileDelete",
  "MovieAdded", "MovieDelete", "MovieFileDelete",
]);
const RELEASE_EVENTS = new Set(["Grab", "Download", "ManualInteractionRequired"]);
const VERBS = new Map([
  ["Grab", "Grabbed"],
  ["Download", "Downloaded"],
  ["Rename", "Renamed"],
  ["ManualInteractionRequired", "Manual import needed"],
]);
// HealthCheckResult: serialized as a name or, if the serializer ever uses numbers, as 0-3.
const LEVELS = ["ok", "notice", "warning", "error"];
const HEALTH_PRIORITY = new Map([
  ["error", 4],
  ["warning", 3],
]);

// Health and update payloads have no app object, so fall back to instanceName,
// but only when it is a known app name (users can rename instances to anything).
function appName(body: Body, headers: Record<string, string>): string {
  const ua = UA_PATTERN.exec(headers["user-agent"] ?? "")?.[1];
  const byObject = Object.keys(APP_BY_OBJECT).find((key) => typeof body[key] === "object");
  const instance = APP_NAMES.find((name) => name.toLowerCase() === str(body, "instanceName").toLowerCase());
  return ua ?? (byObject ? APP_BY_OBJECT[byObject] : instance ?? "");
}

function subject(body: Body): string {
  const movie = str(body, "movie.title");
  if (movie) {
    const year = num(body, "movie.year");
    return year ? `${movie} (${year})` : movie;
  }
  return str(body, "series.title") || str(body, "artist.name") || str(body, "author.name");
}

const more = (text: string, count: number) => (count > 1 ? `${text} +${count - 1}` : text);
const pad = (n: number | null) => String(n ?? 0).padStart(2, "0");

// "S01E02 Pilot", "Album Title", "Book Title", or "" (movies, health, updates).
function detail(body: Body): string {
  const episodes = list(body, "episodes");
  if (episodes.length > 0) {
    const first = episodes[0];
    const code = `S${pad(num(first, "seasonNumber"))}E${pad(num(first, "episodeNumber"))}`;
    const title = str(first, "title");
    return more(title ? `${code} ${title}` : code, episodes.length);
  }
  const items = [...list(body, "albums"), ...list(body, "books")];
  const title = str(items[0], "title") || str(body, "book.title");
  return title ? more(title, items.length) : "";
}

function releaseLines(body: Body): string {
  const quality = str(body, "release.quality");
  const indexer = str(body, "release.indexer");
  const client = str(body, "downloadClient");
  return lines(
    str(body, "release.releaseTitle"),
    quality ? `Quality: ${quality}` : "",
    indexer ? `Indexer: ${indexer}` : "",
    client ? `Client: ${client}` : ""
  );
}

function healthLevel(body: Body): string {
  const value = resolvePath(body, "level");
  const level = typeof value === "number" ? LEVELS[value] : str(body, "level").toLowerCase();
  return LEVELS.includes(level) ? level : "";
}

function servarr(body: Body, headers: Record<string, string>): AutoResult {
  const type = str(body, "eventType");
  const app = appName(body, headers);
  const appPrefix = app ? `[${app}] ` : "";
  const appTag = app.toLowerCase() || "servarr";
  const event = type.toLowerCase();

  if (type === "Test") {
    return { title: `${app || "Servarr"} test notification`, message: "", priority: null, tags: tags(appTag, event) };
  }

  if (type === "Health" || type === "HealthRestored") {
    const restored = type === "HealthRestored";
    const level = healthLevel(body);
    const state = restored ? "restored" : level;
    const check = str(body, "type");
    return {
      title: `${appPrefix}Health${state ? ` ${state}` : ""}${check ? `: ${check}` : ""}`,
      message: lines(str(body, "message"), str(body, "wikiUrl")),
      priority: restored ? 2 : (HEALTH_PRIORITY.get(level) ?? null),
      tags: tags(appTag, event, level),
    };
  }

  if (type === "ApplicationUpdate") {
    const to = str(body, "newVersion");
    const from = str(body, "previousVersion");
    return {
      title: `${appPrefix}Updated${to ? ` to ${to}` : ""}`,
      message: lines(str(body, "message"), from ? `Previous version: ${from}` : ""),
      priority: null,
      tags: tags(appTag, event),
    };
  }

  const isUpgrade = resolvePath(body, "isUpgrade") === true;
  const verb = type === "Download" && isUpgrade ? "Upgraded" : (VERBS.get(type) ?? (type.replace(/([a-z])([A-Z])/g, "$1 $2") || "Event"));
  const name = subject(body);
  const what = detail(body) || str(body, "release.releaseTitle");
  const head = name ? `[${name}] ` : appPrefix;
  return {
    title: `${head}${verb}${what ? `: ${what}` : ""}`,
    message: RELEASE_EVENTS.has(type) ? releaseLines(body) : "",
    priority: null,
    tags: tags(appTag, event),
  };
}

export const arrSource: AutoSource = {
  id: "arr",
  detect: (body, headers) =>
    EVENT_TYPES.has(str(body, "eventType")) &&
    (Boolean(str(body, "instanceName")) || UA_PATTERN.test(headers["user-agent"] ?? "")),
  extract: (body, headers) => servarr(body, headers),
};
