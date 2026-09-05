import type {
  AuthorizedSourceProvider,
  StreamCandidate,
  StreamContext,
  Video,
} from "../types.js";
// Private, bounded memory cache: direct source URLs never enter SQLite.
export class CachedSourceProvider implements AuthorizedSourceProvider {
  private cache = new Map<
    string,
    { expires: number; data: StreamCandidate[] }
  >();
  constructor(
    private provider: AuthorizedSourceProvider,
    private now = Date.now,
  ) {}
  async findStreams(video: Video, context: StreamContext) {
    const key = JSON.stringify([video.id, context]);
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now()) return cached.data;
    const data = await this.provider.findStreams(video, context);
    if (this.cache.size >= 500) this.cache.clear();
    this.cache.set(key, { expires: this.now() + 30_000, data });
    return data;
  }
}
