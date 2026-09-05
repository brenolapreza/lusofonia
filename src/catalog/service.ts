import type {
  MetadataProvider,
  AuthorizedSourceProvider,
  CacheResolver,
  Variant,
  StreamCandidate,
  Video,
} from "../types.js";
import { label, rank } from "../language/ranking.js";
export class AddonService {
  constructor(
    readonly metadata: MetadataProvider,
    private sources: AuthorizedSourceProvider,
    private resolver?: CacheResolver,
  ) {}
  async getStreamVideo(id: string, type?: string): Promise<Video | null> {
    if (type !== undefined && type !== "movie" && type !== "series") return null;
    const [video, title] = await Promise.all([
      this.metadata.getVideo(id),
      this.metadata.getTitle(id),
    ]);
    if (video) {
      if (type === "movie" && title?.type !== "movie") return null;
      if (type === "series" && title) return null;
      return video;
    }
    // An IMDb title can come from another installed catalog. Looking up its
    // exact source ID must not depend on it also existing in our local catalog.
    if (title) return null;
    if (type !== "series" && /^tt\d{7,}$/.test(id)) return { id, title: id };
    if (type === "movie") return null;
    const episode = /^(tt\d{7,}):(\d+):(\d+)$/.exec(id);
    if (!episode) return null;
    const season = Number(episode[2]);
    const number = Number(episode[3]);
    if (!Number.isSafeInteger(season) || !Number.isSafeInteger(number)) return null;
    return { id, title: id, season, episode: number };
  }

  async streams(id: string, variant: Variant, type?: string) {
    const video = await this.getStreamVideo(id, type);
    if (!video) return [];
    return this.streamsForVideo(video, variant);
  }

  async streamsForVideo(video: Video, variant: Variant) {
    let candidates: StreamCandidate[] = [];
    try {
      candidates = await this.sources.findStreams(video, {
        variant,
        userId: "private",
      });
    } catch {
      return [];
    }
    const ids = new Set<string>();
    // Bound external work per request; never trigger creation or download of a torrent.
    const selected = candidates
      .filter((c) => {
        if (ids.has(c.id)) return false;
        ids.add(c.id);
        return true;
      })
      .slice(0, 4);
    const results = await Promise.all(
      selected.map(async (candidate) => {
        let resolved = null;
        try {
          resolved = await this.resolver?.resolve(candidate, {
            userId: "private",
          });
        } catch {
          /* Authorized direct fallback remains available. */
        }
        if (resolved) return resolved;
        if (candidate.url)
          return { candidate, url: candidate.url, cached: false };
        return null;
      }),
    );
    const urls = new Set<string>();
    return rank(
      results.filter((s) => s !== null),
      variant,
    )
      .filter((s) => {
        if (urls.has(s.url)) return false;
        urls.add(s.url);
        return true;
      })
      .map((s) => ({
        name: label(s, variant),
        url: s.url,
        behaviorHints: {
          notWebReady: true,
          ...(s.candidate.size ? { videoSize: s.candidate.size } : {}),
        },
      }));
  }
}
