import { z } from "zod";
export const httpUrl = z
  .string()
  .url()
  .refine((s) => {
    const u = new URL(s);
    return (
      ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
    );
  });
export const videoSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  season: z.number().int().nonnegative().optional(),
  episode: z.number().int().nonnegative().optional(),
  released: z.string().datetime().optional(),
});
export const titleSchema = z.object({
  id: z.string().regex(/^(tt\d+|tmdb:\d+|nuvio:[\w:-]+)$/),
  type: z.enum(["movie", "series"]),
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  externalIds: z.array(z.string()).default([]),
  year: z.number().int(),
  country: z.string().default(""),
  categories: z.array(
    z.enum(["movies", "series", "dramas", "anime", "documentaries", "kids"]),
  ),
  description: z.string(),
  poster: httpUrl.optional(),
  videos: z.array(videoSchema).default([]),
});
export const candidateSchema = z
  .object({
    id: z.string(),
    videoId: z.string(),
    authorization: z.string().min(1),
    url: httpUrl.optional(),
    torbox: z
      .object({
        hash: z
          .string()
          .regex(/^[a-fA-F0-9]{40}$/)
          .transform((s) => s.toLowerCase()),
        torrentId: z.number().int().nonnegative(),
        fileId: z.number().int().nonnegative(),
      })
      .optional(),
    audio: z.array(z.string()).default([]),
    subtitles: z.array(z.string()).default([]),
    verified: z.boolean().default(false),
    resolution: z.number().int().positive().optional(),
    codec: z.enum(["H.264", "HEVC", "AV1"]).optional(),
    quality: z.enum(["WEB-DL", "WebRip", "BluRay", "Original"]).optional(),
    size: z.number().int().positive().optional(),
  })
  .refine((s) => s.url || s.torbox);
export type CanonicalId = string;
export type CanonicalTitle = z.infer<typeof titleSchema>;
export type Video = z.infer<typeof videoSchema>;
export type StreamCandidate = z.infer<typeof candidateSchema>;
export type Variant = "pt" | "en";
export interface SearchOptions {
  type?: "movie" | "series";
  category?: string;
  skip?: number;
}
export interface MetadataProvider {
  search(query: string, options?: SearchOptions): Promise<CanonicalTitle[]>;
  getTitle(id: CanonicalId): Promise<CanonicalTitle | null>;
  getVideos(id: CanonicalId): Promise<Video[] | null>;
  getVideo(id: string): Promise<Video | null>;
}
export interface UserContext {
  userId: "private";
}
export interface StreamContext extends UserContext {
  variant: Variant;
}
export interface AuthorizedSourceProvider {
  findStreams(video: Video, context: StreamContext): Promise<StreamCandidate[]>;
}
export interface ResolvedStream {
  candidate: StreamCandidate;
  url: string;
  cached: boolean;
}
export interface CacheResolver {
  resolve(
    candidate: StreamCandidate,
    context: UserContext,
  ): Promise<ResolvedStream | null>;
}
