import { titleSchema } from "../types.js";
const rows = [
  [
    "film",
    "movie",
    "A Viagem das Marés",
    ["Tide Journey", "A Viagem das Mares"],
    ["movies"],
  ],
  ["series", "series", "Histórias da Vila", ["Village Stories"], ["series"]],
  [
    "drama",
    "series",
    "Primavera em Seul",
    ["Seoul Spring", "Seoul-ui Bom", "서울의 봄"],
    ["dramas"],
  ],
  [
    "anime",
    "series",
    "Estrelas do Amanhã",
    ["Ashita no Hoshi", "Tomorrow Stars"],
    ["anime"],
  ],
  [
    "documentary",
    "movie",
    "Oceanos: Vida Azul",
    ["Blue Life"],
    ["documentaries"],
  ],
  ["kids", "series", "Clube das Nuvens", ["Cloud Club"], ["kids"]],
] as const;
export const fixtures = [
  ...rows.map(([id, type, name, aliases, categories]) =>
    titleSchema.parse({
    id: `nuvio:demo:${id}`,
    type,
    name,
    aliases,
    year: 2026,
    country: id === "drama" ? "KR" : "",
    categories,
    description:
      "Título fictício de demonstração. Nenhum vídeo acompanha este catálogo.",
    videos:
      type === "series"
        ? [
            {
              id: `nuvio:demo:${id}:1:1`,
              title: "Primeiro episódio",
              season: 1,
              episode: 1,
              released: "2026-01-01T00:00:00.000Z",
            },
            ...(id === "anime"
              ? [
                  {
                    id: `nuvio:demo:${id}:0:1`,
                    title: "Especial / OVA",
                    season: 0,
                    episode: 1,
                    released: "2026-01-02T00:00:00.000Z",
                  },
                ]
              : []),
          ]
        : [],
    }),
  ),
  titleSchema.parse({
    id: "tt1254207",
    type: "movie",
    name: "Big Buck Bunny",
    aliases: ["O Coelho Grandão"],
    year: 2008,
    country: "NL",
    categories: ["movies", "kids"],
    description:
      "Curta aberto produzido pela Blender Foundation. Licença CC BY 3.0; os créditos estão incluídos no filme. Vídeo disponibilizado pelo W3C para demonstração de HTML5 video.",
    poster: "https://media.w3.org/2010/05/bunny/poster.png",
  }),
];
