import type { Track } from "./spotifyClient.js";

const LEADING_THE = /^the\s+/i;

export function sortKey(name: string): string {
  return name.replace(LEADING_THE, "").trim();
}

export function sortTracksAlphabetically(tracks: Track[]): Track[] {
  return [...tracks].sort((a, b) =>
    sortKey(a.name).localeCompare(sortKey(b.name), undefined, { sensitivity: "base", numeric: true }),
  );
}
