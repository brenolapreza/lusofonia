import { z } from "zod";
import {
  httpUrl,
  type CacheResolver,
  type ResolvedStream,
  type StreamCandidate,
} from "../types.js";
import { JsonHttpClient } from "./http.js";
const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ success: z.literal(true), data });
const cacheSchema = envelope(
  z.record(z.string(), z.object({ hash: z.string() })),
);
const torrentSchema = envelope(
  z.object({
    id: z.number(),
    hash: z.string(),
    download_finished: z.literal(true),
    download_present: z.literal(true),
    files: z.array(
      z.object({
        id: z.number(),
        zipped: z.boolean().optional(),
        infected: z.boolean().optional(),
      }),
    ),
  }),
);
export class TorBoxResolver implements CacheResolver {
  private status = new Map<string, { expires: number; cached: boolean }>();
  constructor(
    private key: string,
    private http = new JsonHttpClient(),
    private now = Date.now,
  ) {}
  private async request(
    path: string,
    params: Record<string, string>,
    deadline: number,
  ) {
    const url = new URL(`https://api.torbox.app/v1/api/torrents/${path}`);
    url.search = new URLSearchParams(params).toString();
    return this.http.get(
      url,
      { Authorization: `Bearer ${this.key}` },
      deadline,
    );
  }
  async resolve(candidate: StreamCandidate): Promise<ResolvedStream | null> {
    if (!candidate.torbox) return null;
    try {
      const deadline = this.now() + 6000;
      const { hash, torrentId, fileId } = candidate.torbox;
      let status = this.status.get(hash);
      if (!status || status.expires <= this.now()) {
        const response = cacheSchema.parse(
          await this.request(
            "checkcached",
            { hash, format: "object", list_files: "true" },
            deadline,
          ),
        );
        status = {
          expires: this.now() + 10_000,
          cached: response.data[hash]?.hash.toLowerCase() === hash,
        };
        if (this.status.size >= 1000) this.status.clear();
        this.status.set(hash, status);
      }
      if (!status.cached) return null;
      const torrent = torrentSchema.parse(
        await this.request("mylist", { id: String(torrentId) }, deadline),
      ).data;
      if (
        torrent.id !== torrentId ||
        torrent.hash.toLowerCase() !== hash ||
        !torrent.files.some((f) => f.id === fileId && !f.zipped && !f.infected)
      )
        return null;
      const url = envelope(httpUrl).parse(
        await this.request(
          "requestdl",
          {
            token: this.key,
            torrent_id: String(torrentId),
            file_id: String(fileId),
            redirect: "false",
          },
          deadline,
        ),
      ).data;
      if (url.includes(this.key) || decodeURIComponent(url).includes(this.key))
        return null;
      return { candidate, url, cached: true };
    } catch {
      return null;
    }
  }
}
