function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function canonicalPort(u: URL): string {
  if (u.port) return u.port;
  if (u.protocol === "https:") return "443";
  if (u.protocol === "http:") return "80";
  return "";
}

export function compareHosts(a: string, b: string): boolean {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return false;
  return (
    pa.hostname.toLowerCase() === pb.hostname.toLowerCase() &&
    canonicalPort(pa) === canonicalPort(pb)
  );
}
