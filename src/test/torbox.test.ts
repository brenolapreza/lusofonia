import { it, expect, vi } from "vitest";
import { TorBoxResolver } from "../torbox/resolver.js";
import { JsonHttpClient } from "../torbox/http.js";
import { candidateSchema } from "../types.js";
const hash = "a".repeat(40);
const candidate = candidateSchema.parse({
  id: "test",
  videoId: "nuvio:demo:film",
  authorization: "Arquivo próprio",
  torbox: { hash, torrentId: 7, fileId: 2 },
});
const json = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), { status: 200 });
it("consulta cache, valida arquivo da conta e resolve sem criar torrent", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ [hash]: { hash } }))
    .mockResolvedValueOnce(
      json({
        id: 7,
        hash,
        download_finished: true,
        download_present: true,
        files: [{ id: 2 }],
      }),
    )
    .mockResolvedValueOnce(json("https://cdn.example.org/play"));
  const resolver = new TorBoxResolver(
    "private-secret",
    new JsonHttpClient(fetcher),
  );
  expect(await resolver.resolve(candidate)).toMatchObject({
    cached: true,
    url: "https://cdn.example.org/play",
  });
  expect(
    fetcher.mock.calls.map((c) => (c[0] as URL).pathname.split("/").at(-1)),
  ).toEqual(["checkcached", "mylist", "requestdl"]);
  expect(fetcher.mock.calls.every((c) => !c[1].method)).toBe(true);
});
it("omite não cacheado sem iniciar download", async () => {
  const fetcher = vi.fn().mockResolvedValue(json({}));
  const resolver = new TorBoxResolver(
    "private-secret",
    new JsonHttpClient(fetcher),
  );
  expect(await resolver.resolve(candidate)).toBeNull();
  expect(await resolver.resolve(candidate)).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("rejeita arquivo errado, infectado ou torrent incompleto", async () => {
  for (const torrent of [
    {
      id: 8,
      hash,
      download_finished: true,
      download_present: true,
      files: [{ id: 2 }],
    },
    {
      id: 7,
      hash,
      download_finished: true,
      download_present: true,
      files: [{ id: 2, infected: true }],
    },
    {
      id: 7,
      hash,
      download_finished: false,
      download_present: true,
      files: [{ id: 2 }],
    },
  ]) {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ [hash]: { hash } }))
      .mockResolvedValueOnce(json(torrent));
    expect(
      await new TorBoxResolver("secret", new JsonHttpClient(fetcher)).resolve(
        candidate,
      ),
    ).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  }
});
it("não devolve a API key mesmo em uma URL do provedor", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ [hash]: { hash } }))
    .mockResolvedValueOnce(
      json({
        id: 7,
        hash,
        download_finished: true,
        download_present: true,
        files: [{ id: 2 }],
      }),
    )
    .mockResolvedValueOnce(
      json("https://cdn.example.org/?token=private-secret"),
    );
  expect(
    await new TorBoxResolver(
      "private-secret",
      new JsonHttpClient(fetcher),
    ).resolve(candidate),
  ).toBeNull();
});
it("backoff limitado para 429 e 503", async () => {
  const sleep = vi.fn().mockResolvedValue(undefined);
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response("", { status: 429, headers: { "retry-after": "1" } }),
    )
    .mockResolvedValueOnce(new Response("", { status: 503 }))
    .mockResolvedValueOnce(json({}));
  await new JsonHttpClient(fetcher, 100, sleep).get(
    new URL("https://example.org"),
    {},
  );
  expect(sleep.mock.calls).toEqual([[1000], [200]]);
});
it("respeita rate limit longo sem repetir cedo", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response("", { status: 429, headers: { "retry-after": "60" } }),
    );
  const client = new JsonHttpClient(fetcher);
  await expect(client.get(new URL("https://example.org"), {})).rejects.toThrow(
    "temporariamente",
  );
  await expect(
    client.get(new URL("https://example.org"), {}),
  ).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("timeout aborta requisições e circuit breaker limita falhas", async () => {
  const fetcher = vi.fn(
    (_url, options) =>
      new Promise((_resolve, reject) =>
        options.signal.addEventListener("abort", () =>
          reject(new Error("secret-url")),
        ),
      ),
  );
  const client = new JsonHttpClient(fetcher as typeof fetch, 5, async () => {});
  for (let i = 0; i < 4; i++)
    await expect(
      client.get(new URL("https://example.org"), {}),
    ).rejects.toThrow("temporariamente");
  expect(fetcher).toHaveBeenCalledTimes(9);
});
it("401 não é repetido", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
  await expect(
    new JsonHttpClient(fetcher).get(new URL("https://example.org"), {}),
  ).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
