export class ExternalUnavailable extends Error {
  constructor() {
    super("Serviço externo temporariamente indisponível.");
  }
}
export class JsonHttpClient {
  private failures = 0;
  private openUntil = 0;
  constructor(
    private fetcher: typeof fetch = fetch,
    private timeoutMs = 2500,
    private sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    private now = Date.now,
  ) {}
  async get(
    url: URL,
    headers: Record<string, string>,
    deadline = this.now() + 8000,
  ): Promise<unknown> {
    if (this.now() < this.openUntil) throw new ExternalUnavailable();
    for (let attempt = 0; attempt < 3; attempt++) {
      if (this.now() >= deadline) break;
      let retry = true;
      let wait = 100 * 2 ** attempt;
      try {
        const response = await this.fetcher(url, {
          headers,
          signal: AbortSignal.timeout(
            Math.max(1, Math.min(this.timeoutMs, deadline - this.now())),
          ),
          redirect: "error",
        });
        if (response.ok) {
          const result = await response.json();
          this.failures = 0;
          return result;
        }
        retry = response.status === 429 || response.status >= 500;
        const after = response.headers.get("retry-after");
        if (after) {
          const delay = /^\d+$/.test(after)
            ? Number(after) * 1000
            : Date.parse(after) - this.now();
          if (Number.isFinite(delay)) {
            if (delay > 2000) {
              this.openUntil = this.now() + delay;
              retry = false;
            } else wait = Math.max(wait, delay);
          }
        }
        await response.body?.cancel();
      } catch {
        /* Never retain provider errors, URLs or credentials. */
      }
      if (!retry || attempt === 2 || this.now() + wait >= deadline) break;
      await this.sleep(wait);
    }
    if (++this.failures >= 3)
      this.openUntil = Math.max(this.openUntil, this.now() + 30_000);
    throw new ExternalUnavailable();
  }
}
