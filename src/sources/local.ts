import type {
  AuthorizedSourceProvider,
  StreamCandidate,
  Video,
} from "../types.js";
export class LocalSourceProvider implements AuthorizedSourceProvider {
  constructor(private sources: StreamCandidate[] = []) {}
  async findStreams(video: Video) {
    return this.sources.filter((s) => s.videoId === video.id);
  }
}
