import { createHash } from "node:crypto";
import type {
  MetadataProvider,
  CanonicalTitle,
  SearchOptions,
} from "../types.js";
import type { Repository } from "../storage/repository.js";
import { normalize, deduplicate } from "../identity/index.js";
export class LocalMetadataProvider implements MetadataProvider {
  readonly titles: CanonicalTitle[];
  private prefix: string;
  constructor(
    titles: CanonicalTitle[],
    private repo: Repository,
  ) {
    this.titles = deduplicate(titles);
    this.prefix = createHash("sha256")
      .update(JSON.stringify(this.titles))
      .digest("hex");
    for (const t of this.titles)
      for (const id of [t.id, ...t.externalIds]) repo.putAlias(id, t.id);
  }
  async search(query: string, options: SearchOptions = {}) {
    const key = `metadata:${this.prefix}:${JSON.stringify([normalize(query), options])}`;
    const cached = this.repo.get<CanonicalTitle[]>(key);
    if (cached) return cached;
    const result = this.titles
      .filter(
        (t) =>
          (!options.type || t.type === options.type) &&
          (!options.category ||
            t.categories.includes(options.category as never)) &&
          [t.name, ...t.aliases].some((n) =>
            normalize(n).includes(normalize(query)),
          ),
      )
      .slice(options.skip ?? 0, (options.skip ?? 0) + 50);
    this.repo.set(key, result, 86_400_000);
    return result;
  }
  async getTitle(id: string) {
    const canonical = this.repo.alias(id) ?? id;
    return this.titles.find((t) => t.id === canonical) ?? null;
  }
  async getVideos(id: string) {
    return (await this.getTitle(id))?.videos ?? null;
  }
  async getVideo(id: string) {
    const movie = await this.getTitle(id);
    if (movie?.type === "movie") return { id: movie.id, title: movie.name };
    return (
      this.titles.flatMap((t) => t.videos).find((v) => v.id === id) ?? null
    );
  }
}
