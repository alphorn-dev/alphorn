export function generateOrgSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${base || "project"}-${suffix}`;
}
