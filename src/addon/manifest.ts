import type { Variant } from "../types.js";
export const catalogs = [
  ["movies", "movie", "Filmes", "Movies"],
  ["series", "series", "Séries", "Series"],
  ["dramas", "series", "Doramas", "Dramas"],
  ["anime", "series", "Animes", "Anime"],
  ["documentaries", "movie", "Documentários", "Documentaries"],
  ["kids", "series", "Infantil", "Kids"],
] as const;
export function manifest(variant: Variant) {
  return {
    id: `org.nuvio.lusofonia.${variant}`,
    version: "0.1.1",
    name: `Nuvio Lusofonia — ${variant === "pt" ? "Português" : "English"}`,
    description:
      variant === "pt"
        ? "Catálogo privado e fontes autorizadas. Sem fontes configuradas, exibe demonstrações."
        : "Private catalog and authorized sources. Shows demos when no sources are configured.",
    resources: ["catalog", "meta", "stream", "subtitles"],
    types: ["movie", "series"],
    catalogs: catalogs.map(([id, type, pt, en]) => ({
      id,
      type,
      name: variant === "pt" ? pt : en,
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false },
      ],
    })),
    behaviorHints: { configurable: true, configurationRequired: false },
  };
}
