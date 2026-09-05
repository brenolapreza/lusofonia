import type {
  MetadataProvider,
  AuthorizedSourceProvider,
  CacheResolver,
  Variant,
  StreamCandidate,
} from "../types.js";
import { label, rank } from "../language/ranking.js";
export class AddonService {
  constructor(
    readonly metadata: MetadataProvider,
    private sources: AuthorizedSourceProvider,
    private resolver?: CacheResolver,
  ) {}
  async streams(id: string, variant: Variant) {
    const video = await this.metadata.getVideo(id);
    if (!video) return [];
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
