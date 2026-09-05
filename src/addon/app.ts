import Fastify, { LogController } from "fastify";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { z } from "zod";
import { type Config } from "../config/index.js";
import {
  titleSchema,
  candidateSchema,
  type MetadataProvider,
  type AuthorizedSourceProvider,
  type CacheResolver,
  type Variant,
} from "../types.js";
import { SqliteRepository } from "../storage/repository.js";
import { LocalMetadataProvider } from "../metadata/local.js";
import { fixtures } from "../metadata/fixtures.js";
import { CachedSourceProvider } from "../sources/cached.js";
import { LocalSourceProvider } from "../sources/local.js";
import { TorBoxResolver } from "../torbox/resolver.js";
import { AddonService } from "../catalog/service.js";
import { manifest, catalogs } from "./manifest.js";
import { makeLogger } from "../observability/logger.js";
const require = createRequire(import.meta.url);
const { addonBuilder } = require("stremio-addon-sdk");
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function buildApp(
  config: Config,
  deps: {
    metadata?: MetadataProvider;
    sources?: AuthorizedSourceProvider;
    resolver?: CacheResolver;
  } = {},
) {
  const repo = new SqliteRepository(config.DATABASE_URL.slice(5));
  let service: AddonService;
  try {
    const titles = config.CATALOG_FILE
      ? z
          .array(titleSchema)
          .parse(JSON.parse(readFileSync(config.CATALOG_FILE, "utf8")))
      : fixtures;
    const sources = config.SOURCES_FILE
      ? z
          .array(candidateSchema)
          .parse(JSON.parse(readFileSync(config.SOURCES_FILE, "utf8")))
      : [];
    service = new AddonService(
      deps.metadata ?? new LocalMetadataProvider(titles, repo),
      new CachedSourceProvider(
        deps.sources ?? new LocalSourceProvider(sources),
      ),
      deps.resolver ??
        (config.TORBOX_ENABLED
          ? new TorBoxResolver(config.TORBOX_API_KEY)
          : undefined),
    );
  } catch {
    repo.close();
    throw new Error(
      "Catálogo ou fontes inválidos. Confira os arquivos locais.",
    );
  }
  const app = Fastify({
    loggerInstance: makeLogger(config.LOG_LEVEL),
    logController: new LogController({ disableRequestLogging: true }),
  });
  app.addHook("onClose", async () => repo.close());
  app.addHook("onRequest", async (_req, reply) => {
    reply
      .header("Access-Control-Allow-Origin", "*")
      .header("Access-Control-Allow-Methods", "GET, OPTIONS")
      .header("Access-Control-Allow-Headers", "Content-Type")
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff");
  });
  const secrets = [config.TORBOX_API_KEY, config.METADATA_API_KEY].filter(
    Boolean,
  );
  app.addHook("onSend", async (_req, reply, payload) => {
    if (
      typeof payload === "string" &&
      secrets.some((s) =>
        [s, encodeURIComponent(s), JSON.stringify(s).slice(1, -1)].some((v) =>
          payload.includes(v),
        ),
      )
    ) {
      reply.code(500).type("application/json");
      return JSON.stringify({ error: "Resposta indisponível." });
    }
    return payload;
  });
  app.setErrorHandler((_error, _request, reply) => {
    app.log.warn({ event: "request_failed" }, "Falha ao processar requisição");
    reply.code(500).send({ error: "Não foi possível concluir a solicitação." });
  });
  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).send({ error: "Recurso não encontrado." }),
  );
  app.options("/*", async (_req, reply) => reply.code(204).send());
  app.get("/healthz", async () => ({ status: "ok" }));
  for (const variant of ["pt", "en"] as Variant[]) {
    const builder = new addonBuilder(manifest(variant));
    builder.defineCatalogHandler(
      async (args: {
        type: string;
        id: string;
        extra: Record<string, string>;
      }) => {
        const catalog = catalogs.find(
          (c) => c[0] === args.id && c[1] === args.type,
        );
        if (!catalog) return { metas: [] };
        const skip = Number(args.extra.skip ?? 0);
        if (!Number.isSafeInteger(skip) || skip < 0) return { metas: [] };
        const titles = await service.metadata.search(
          (args.extra.search ?? "").slice(0, 200),
          { type: catalog[1], category: catalog[0], skip },
        );
        return {
          metas: titles.map((t) => ({
            id: t.id,
            type: t.type,
            name: t.name,
            poster: t.poster,
            description: t.description,
            releaseInfo: String(t.year),
          })),
        };
      },
    );
    builder.defineMetaHandler(async (args: { id: string; type: string }) => {
      const title = await service.metadata.getTitle(args.id);
      return {
        meta:
          title && title.type === args.type
            ? {
                id: title.id,
                type: title.type,
                name: title.name,
                poster: title.poster,
                description: title.description,
                releaseInfo: String(title.year),
                videos: await service.metadata.getVideos(title.id),
              }
            : null,
      };
    });
    builder.defineStreamHandler(async (args: { id: string; type: string }) => {
      if (!["movie", "series"].includes(args.type)) return { streams: [] };
      const video = await service.metadata.getVideo(args.id);
      const title = await service.metadata.getTitle(args.id);
      if (
        !video ||
        (args.type === "movie" ? !title || title.type !== "movie" : !!title)
      )
        return { streams: [] };
      const streams = await service.streams(args.id, variant);
      return streams.length
        ? { streams }
        : {
            streams: [
              {
                name:
                  variant === "pt"
                    ? "Nenhuma fonte autorizada disponível"
                    : "No authorized source available",
                externalUrl: `${config.BASE_URL}/${variant}/configure`,
              },
            ],
          };
    });
    builder.defineSubtitlesHandler(async () => ({ subtitles: [] }));
    const addon = builder.getInterface();
    app.get(`/${variant}/manifest.json`, async () => addon.manifest);
    app.get(`/${variant}/configure`, async (_req, reply) =>
      reply
        .type("text/html; charset=utf-8")
        .send(
          `<!doctype html><html lang="${variant}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Nuvio Lusofonia</title><body><h1>Nuvio Lusofonia — ${variant === "pt" ? "Português" : "English"}</h1><p>${variant === "pt" ? "Configure o catálogo e as fontes autorizadas no servidor. Os títulos de demonstração são fictícios e não incluem vídeos." : "Configure the catalog and authorized sources on the server. Demo titles are fictional and contain no videos."}</p><p>Manifest: <a href="/${variant}/manifest.json">${escape(config.BASE_URL)}/${variant}/manifest.json</a></p><a href="${escape(config.BASE_URL.replace(/^https?:/, "stremio:"))}/${variant}/manifest.json">${variant === "pt" ? "Instalar no Stremio" : "Install in Stremio"}</a></body></html>`,
        ),
    );
    const handler = async (
      request: { params: unknown },
      reply: { code: (n: number) => { send: (x: unknown) => unknown } },
    ) => {
      const p = request.params as {
        resource: string;
        type: string;
        id: string;
        extra?: string;
      };
      if (!["catalog", "meta", "stream", "subtitles"].includes(p.resource))
        return reply.code(404).send({ error: "Recurso não encontrado." });
      const extra = Object.fromEntries(new URLSearchParams(p.extra ?? ""));
      return addon.get(p.resource, p.type, p.id, extra);
    };
    app.get(`/${variant}/:resource/:type/:id.json`, handler);
    app.get(`/${variant}/:resource/:type/:id/:extra.json`, handler);
  }
  return app;
}
