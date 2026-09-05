import type { CanonicalTitle, Video } from "../types.js";
export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export function uniqueVideos(videos: Video[]): Video[] {
  const seen = new Set<string>();
  return videos.filter((v) => {
    const key =
      v.season !== undefined && v.episode !== undefined
        ? `${v.season}:${v.episode}`
        : v.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function deduplicate(titles: CanonicalTitle[]): CanonicalTitle[] {
  const result: CanonicalTitle[] = [];
  for (const title of titles) {
    const ids = [title.id, ...title.externalIds];
    const existing = result.find(
      (t) =>
        t.type === title.type &&
        (t.id === title.id ||
          (t.year === title.year &&
            t.country === title.country &&
            [t.id, ...t.externalIds].some((id) => ids.includes(id)))),
    );
    if (existing) {
      existing.aliases = [
        ...new Set([...existing.aliases, ...title.aliases, title.name]),
      ];
      existing.externalIds = [...new Set([...existing.externalIds, ...ids])];
      existing.categories = [
        ...new Set([...existing.categories, ...title.categories]),
      ];
      existing.videos = uniqueVideos([...existing.videos, ...title.videos]);
    } else result.push({ ...title, videos: uniqueVideos(title.videos) });
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}
