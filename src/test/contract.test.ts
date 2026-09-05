import { it, expect, afterEach, vi } from "vitest";
import { createRequire } from "node:module";
import { buildApp } from "../addon/app.js";
import { readConfig } from "../config/index.js";
import { catalogs } from "../addon/manifest.js";
import { TorBoxResolver } from "../torbox/resolver.js";
import { JsonHttpClient } from "../torbox/http.js";
const require = createRequire(import.meta.url);
const client = require("stremio-addon-client");
const apps: ReturnType<typeof buildApp>[] = [];
const app = () => {
  const a = buildApp(
    readConfig({ DATABASE_URL: "file::memory:", LOG_LEVEL: "silent" }),
  );
  apps.push(a);
  return a;
};
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

it("retorna a fonte do IMDb recebido de outro catálogo, sem exigir metadados locais", async () => {
  const sources = [
    { id: "film", videoId: "tt1234567", authorization: "Arquivo de teste próprio", url: "https://media.example.org/film.mp4" },
    { id: "episode", videoId: "tt7654321:0:1", authorization: "Arquivo de teste próprio", url: "https://media.example.org/special.mp4" },
    { id: "next-episode", videoId: "tt7654321:1:2", authorization: "Arquivo de teste próprio", url: "https://media.example.org/episode2.mp4" },
  ];
  const a = buildApp(readConfig({ DATABASE_URL: "file::memory:", LOG_LEVEL: "silent", SOURCES_JSON: JSON.stringify(sources) }));
  apps.push(a);
  expect((await a.inject("/pt/meta/movie/tt1234567.json")).json()).toEqual({ meta: null });
  for (const variant of ["pt", "en"]) {
    const streams = (await a.inject(`/${variant}/stream/movie/tt1234567.json`)).json().streams;
    expect(streams).toHaveLength(1);
    expect(streams[0].url).toBe(sources[0]!.url);
    const episodes = (await a.inject(`/${variant}/stream/series/tt7654321:0:1.json`)).json().streams;
    expect(episodes).toHaveLength(1);
    expect(episodes[0].url).toBe(sources[1]!.url);
  }
  for (const route of ["movie/tt04", "movie/tt7654321:0:1", "series/tt1234567"]) {
    expect((await a.inject(`/pt/stream/${route}.json`)).json()).toEqual({ streams: [] });
  }
  const missing = (await a.inject("/pt/stream/movie/tt9999999.json")).json().streams;
  expect(missing.every((stream: { url?: string }) => !stream.url)).toBe(true);
});

it("resolve fonte TorBox de IMDb externo com a API simulada, sem criar downloads", async () => {
  const hash = "a".repeat(40);
  const json = (data: unknown) => new Response(JSON.stringify({ success: true, data }));
  const fetcher = vi.fn()
    .mockResolvedValueOnce(json({ [hash]: { hash } }))
    .mockResolvedValueOnce(json({ id: 7, hash, download_finished: true, download_present: true, files: [{ id: 2 }] }))
    .mockResolvedValueOnce(json("https://cdn.example.org/film.mp4"));
  const a = buildApp(readConfig({
    DATABASE_URL: "file::memory:", LOG_LEVEL: "silent", TORBOX_ENABLED: "true", TORBOX_API_KEY: "test-private-key",
    SOURCES_JSON: JSON.stringify([{ id: "own", videoId: "tt1234567", authorization: "Arquivo próprio", torbox: { hash, torrentId: 7, fileId: 2 } }]),
  }), { resolver: new TorBoxResolver("test-private-key", new JsonHttpClient(fetcher)) });
  apps.push(a);
  const response = await a.inject("/pt/stream/movie/tt1234567.json");
  expect(response.statusCode).toBe(200);
  expect(response.json().streams[0].url).toBe("https://cdn.example.org/film.mp4");
  expect(response.body).not.toContain("test-private-key");
  expect(fetcher.mock.calls.map((call) => (call[0] as URL).pathname.split("/").at(-1)))
    .toEqual(["checkcached", "mylist", "requestdl"]);
});

it("rejeita fontes JSON inválidas e configuração ambígua sem expor valores", () => {
  expect(() => readConfig({ SOURCES_FILE: "file.json", SOURCES_JSON: "[]" })).toThrow(/SOURCES_JSON/);
  for (const value of ["private-json-secret", '[{"url":"private-json-secret"}]']) {
    try {
      buildApp(readConfig({ DATABASE_URL: "file::memory:", LOG_LEVEL: "silent", SOURCES_JSON: value }));
      expect.fail("A configuração inválida deveria falhar");
    } catch (error) {
      expect((error as Error).message).toContain("SOURCES_JSON");
      expect((error as Error).message).not.toContain("private-json-secret");
    }
  }
});
it("valida ambos os manifestos e todos os catálogos", async () => {
  const a = app();
  const ids = [];
  for (const variant of ["pt", "en"]) {
    const response = await a.inject(`/${variant}/manifest.json`);
    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    ids.push(response.json().id);
    for (const [id, type] of catalogs) {
      const r = await a.inject(`/${variant}/catalog/${type}/${id}.json`);
      expect(r.statusCode).toBe(200);
      expect(r.json().metas.length).toBeGreaterThan(0);
      expect(new Set(r.json().metas.map((m: any) => m.id)).size).toBe(
        r.json().metas.length,
      );
    }
  }
  expect(new Set(ids).size).toBe(2);
});
it("contratos de busca, meta, episódios, streams e subtitles", async () => {
  const a = app();
  expect(
    (
      await a.inject(
        "/pt/catalog/movie/movies/search=viagem%20das%20mares.json",
      )
    ).json().metas,
  ).toHaveLength(1);
  expect(
    (await a.inject("/pt/catalog/movie/movies/skip=50.json")).json().metas,
  ).toEqual([]);
  const meta = (await a.inject("/pt/meta/series/nuvio:demo:anime.json")).json()
    .meta;
  expect(meta.videos).toHaveLength(2);
  expect(meta.videos.some((v: any) => v.season === 0)).toBe(true);
  expect(
    (await a.inject("/pt/stream/series/nuvio:demo:anime:0:1.json")).json()
      .streams[0].externalUrl,
  ).toContain("/pt/configure");
  expect(
    (await a.inject("/pt/subtitles/series/nuvio:demo:anime:0:1.json")).json(),
  ).toEqual({ subtitles: [] });
  expect(
    (await a.inject("/pt/meta/movie/nuvio:demo:anime.json")).json(),
  ).toEqual({ meta: null });
  expect(
    (await a.inject("/pt/stream/movie/nuvio:demo:anime:0:1.json")).json(),
  ).toEqual({ streams: [] });
  expect((await a.inject("/healthz")).json()).toEqual({ status: "ok" });
});

it("oferece por padrão um filme aberto com duas fontes HTTPS reproduzíveis", async () => {
  const a = app();
  const catalog = (await a.inject("/pt/catalog/movie/movies.json")).json().metas;
  expect(catalog.some((meta: { id: string }) => meta.id === "tt1254207")).toBe(true);
  const response = await a.inject("/pt/stream/movie/tt1254207.json");
  expect(response.statusCode).toBe(200);
  const streams = response.json().streams;
  expect(streams).toHaveLength(2);
  expect(streams.every((stream: { url?: string }) => stream.url?.startsWith("https://media.w3.org/"))).toBe(true);
});
it("instala manifestos e consulta fixtures com o cliente Stremio real", async () => {
  const a = app();
  const base = await a.listen({ host: "127.0.0.1", port: 0 });
  for (const variant of ["pt", "en"]) {
    const { addon } = await client.detectFromURL(
      `${base}/${variant}/manifest.json`,
    );
    const response = await addon.get("catalog", "movie", "movies");
    expect(response.metas[0].id).toBe("nuvio:demo:film");
    const meta = await addon.get("meta", "series", "nuvio:demo:anime");
    expect(meta.meta.videos).toHaveLength(2);
  }
});
it("não expõe segredos em resposta, erro, healthcheck ou configuração", async () => {
  const a = buildApp(
    readConfig({
      DATABASE_URL: "file::memory:",
      LOG_LEVEL: "silent",
      TORBOX_API_KEY: "private-secret",
      METADATA_API_KEY: "metadata-secret",
    }),
    {
      sources: {
        findStreams: vi.fn().mockRejectedValue(new Error("private-secret")),
      },
    },
  );
  apps.push(a);
  for (const path of [
    "/healthz",
    "/pt/manifest.json",
    "/pt/configure",
    "/pt/stream/movie/nuvio:demo:film.json",
    "/bad",
  ]) {
    const r = await a.inject(path);
    expect(r.body).not.toContain("private-secret");
    expect(r.body).not.toContain("metadata-secret");
  }
  expect(
    (await a.inject({ method: "OPTIONS", url: "/pt/manifest.json" }))
      .statusCode,
  ).toBe(204);
});

it("bloqueia uma chave que apareça em dados de uma fonte configurada", async () => {
  const a = buildApp(
    readConfig({
      DATABASE_URL: "file::memory:",
      LOG_LEVEL: "silent",
      TORBOX_API_KEY: "private-secret",
    }),
    {
      sources: {
        findStreams: async () => [
          {
            id: "own",
            videoId: "nuvio:demo:film",
            authorization: "Própria",
            audio: [],
            subtitles: [],
            verified: false,
            url: "https://example.org/private-secret.mp4",
          },
        ],
      },
    },
  );
  apps.push(a);
  const response = await a.inject("/pt/stream/movie/nuvio:demo:film.json");
  expect(response.statusCode).toBe(500);
  expect(response.body).not.toContain("private-secret");
});
