import type { ResolvedStream, StreamCandidate, Variant } from "../types.js";
export function languageScore(c: StreamCandidate, variant: Variant) {
  if (!c.verified) return 0;
  const langs = variant === "pt" ? ["pt-BR", "pt-PT", "pt"] : ["en"];
  let score = 0;
  langs.forEach((lang, i) => {
    if (c.audio.includes(lang)) score = Math.max(score, 100 - i * 10);
    if (c.subtitles.includes(lang)) score = Math.max(score, 60 - i * 10);
  });
  return score;
}
export function rank(streams: ResolvedStream[], variant: Variant) {
  return [...streams].sort(
    (a, b) =>
      Number(b.cached) - Number(a.cached) ||
      languageScore(b.candidate, variant) -
        languageScore(a.candidate, variant) ||
      (b.candidate.resolution ?? 0) - (a.candidate.resolution ?? 0) ||
      a.candidate.id.localeCompare(b.candidate.id),
  );
}
export function label(s: ResolvedStream, variant: Variant) {
  const c = s.candidate;
  const preferred = variant === "pt" ? ["pt-BR", "pt-PT", "pt"] : ["en"];
  const audio = c.verified
    ? (preferred.find((l) => c.audio.includes(l)) ?? c.audio[0])
    : undefined;
  const sub = c.verified
    ? (preferred.find((l) => c.subtitles.includes(l)) ?? c.subtitles[0])
    : undefined;
  const preferredSub =
    sub && preferred.includes(sub) && (!audio || !preferred.includes(audio));
  const language = preferredSub
    ? `${sub.toUpperCase()} ${variant === "pt" ? "Legenda" : "Subtitles"}`
    : audio
      ? `${audio.toUpperCase()} ${variant === "pt" ? "Áudio" : "Audio"}`
      : sub
        ? `${sub.toUpperCase()} ${variant === "pt" ? "Legenda" : "Subtitles"}`
        : variant === "pt"
          ? "Idioma não confirmado"
          : "Language unconfirmed";
  return [
    `[${language}]`,
    c.resolution ? `${c.resolution}p` : undefined,
    c.quality,
    c.codec,
    s.cached ? "TorBox Cache" : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}
