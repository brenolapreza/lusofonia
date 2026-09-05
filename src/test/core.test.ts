import { describe, it, expect, vi } from "vitest";
import { readConfig } from "../config/index.js";
import { deduplicate, uniqueVideos } from "../identity/index.js";
import { LocalMetadataProvider } from "../metadata/local.js";
import { fixtures } from "../metadata/fixtures.js";
import { SqliteRepository } from "../storage/repository.js";
import { candidateSchema } from "../types.js";
import { rank, label } from "../language/ranking.js";
import { AddonService } from "../catalog/service.js";
import { LocalSourceProvider } from "../sources/local.js";
const candidate = (
  id: string,
  audio: string[] = [],
  subtitles: string[] = [],
) =>
  candidateSchema.parse({
    id,
    videoId: fixtures[0]!.id,
    authorization: "Fixture de teste própria",
    url: `https://example.org/${id}.mp4`,
    audio,
    subtitles,
    verified: true,
  });
describe("configuração e catálogo", () => {
  it("inicia sem chave e rejeita TorBox inseguro", () => {
    expect(readConfig({}).TORBOX_ENABLED).toBe(false);
    expect(() => readConfig({ TORBOX_ENABLED: "true" })).toThrow();
    expect(() => readConfig({ TORBOX_ONLY_CACHED: "false" })).toThrow();
    expect(() => readConfig({ TORBOX_ENABLED: "yes" })).toThrow();
  });
  it("busca acentos, hífens e romanização; pagina sem perder categorias", async () => {
    const repo = new SqliteRepository(":memory:");
    const provider = new LocalMetadataProvider(fixtures, repo);
    expect((await provider.search("viagem-das-mares"))[0]?.name).toBe(
      "A Viagem das Marés",
    );
    expect((await provider.search("seoul ui bom"))[0]?.categories).toContain(
      "dramas",
    );
    expect((await provider.search("ashita"))[0]?.categories).toContain("anime");
    expect(await provider.search("", { skip: 50 })).toEqual([]);
    repo.close();
  });
  it("deduplica por ID, preserva homônimos e especiais", () => {
    const t = fixtures[3]!;
    const result = deduplicate([
      t,
      { ...t, aliases: ["Outro nome"] },
      { ...t, id: "nuvio:demo:other" },
    ]);
    expect(result).toHaveLength(2);
    expect(result.find((x) => x.id === t.id)?.aliases).toContain("Outro nome");
    expect(uniqueVideos([...t.videos, ...t.videos])).toHaveLength(2);
  });
  it("mapeia IDs cruzados confiáveis", async () => {
    const repo = new SqliteRepository(":memory:");
    const p = new LocalMetadataProvider(
      [{ ...fixtures[0]!, externalIds: ["tt1234567"] }],
      repo,
    );
    expect((await p.getTitle("tt1234567"))?.id).toBe(fixtures[0]!.id);
    repo.close();
  });
  it("expira cache SQLite", () => {
    let now = 0;
    const repo = new SqliteRepository(":memory:", () => now);
    repo.set("a", { test: true }, 20);
    expect(repo.get("a")).toEqual({ test: true });
    now = 20;
    expect(repo.get("a")).toBeUndefined();
    repo.close();
  });
});
describe("idiomas e fontes", () => {
  it("prioriza cache e depois PT-BR, PT-PT, legenda e English", () => {
    const streams = [
      candidate("br", ["pt-BR"]),
      candidate("pt", ["pt-PT"]),
      candidate("sub", [], ["pt-BR"]),
      candidate("en", ["en"]),
    ].map((c) => ({ candidate: c, url: c.url!, cached: false }));
    expect(rank(streams, "pt").map((s) => s.candidate.id)).toEqual([
      "br",
      "pt",
      "sub",
      "en",
    ]);
    expect(rank(streams, "en")[0]?.candidate.id).toBe("en");
    streams[3]!.cached = true;
    expect(rank(streams, "pt")[0]?.candidate.id).toBe("en");
  });
  it("não confunde legenda e áudio nem infere idioma do nome", () => {
    const c = candidate("DUBLADO-PTBR", [], ["pt-BR"]);
    expect(label({ candidate: c, url: c.url!, cached: false }, "pt")).toContain(
      "Legenda",
    );
    c.verified = false;
    expect(label({ candidate: c, url: c.url!, cached: false }, "pt")).toContain(
      "não confirmado",
    );
    expect(
      label({ candidate: c, url: c.url!, cached: false }, "pt"),
    ).not.toContain("Cache");
  });
  it("preserva fallback se resolver falhar e deduplica URLs", async () => {
    const repo = new SqliteRepository(":memory:");
    const c = candidate("source");
    const service = new AddonService(
      new LocalMetadataProvider(fixtures, repo),
      new LocalSourceProvider([c, { ...c, id: "duplicate" }]),
      { resolve: vi.fn().mockRejectedValue(new Error("segredo")) },
    );
    expect(await service.streams(c.videoId, "pt")).toHaveLength(1);
    repo.close();
  });
});

it("redige chaves, URLs e erros nos logs estruturados", async () => {
  const { makeLogger } = await import("../observability/logger.js");
  let output = "";
  const logger = makeLogger("info", {
    write(chunk: string) {
      output += chunk;
    },
  });
  logger.info(
    {
      TORBOX_API_KEY: "torbox-secret",
      METADATA_API_KEY: "metadata-secret",
      token: "token-secret",
      url: "https://example.org/?key=url-secret",
      req: {
        url: "/?token=request-secret",
        headers: { authorization: "Bearer auth-secret" },
      },
      err: new Error("error-secret"),
    },
    "Evento seguro",
  );
  for (const secret of [
    "torbox-secret",
    "metadata-secret",
    "token-secret",
    "url-secret",
    "request-secret",
    "auth-secret",
    "error-secret",
  ])
    expect(output).not.toContain(secret);
  expect(output).toContain("[REDACTED]");
});

it("cache de fontes expira sem persistir URLs em disco", async () => {
  const { CachedSourceProvider } = await import("../sources/cached.js");
  let now = 0;
  const provider = {
    findStreams: vi.fn().mockResolvedValue([candidate("one")]),
  };
  const cached = new CachedSourceProvider(provider, () => now);
  const video = { id: "nuvio:demo:film", title: "Demo" };
  const context = { userId: "private" as const, variant: "pt" as const };
  await cached.findStreams(video, context);
  await cached.findStreams(video, context);
  expect(provider.findStreams).toHaveBeenCalledTimes(1);
  now = 30_000;
  await cached.findStreams(video, context);
  expect(provider.findStreams).toHaveBeenCalledTimes(2);
});
