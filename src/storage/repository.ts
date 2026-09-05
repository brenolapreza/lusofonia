import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export interface Repository {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown, ttlMs: number): void;
  alias(id: string): string | undefined;
  putAlias(id: string, canonical: string): void;
  close(): void;
}
export class SqliteRepository implements Repository {
  private db: DatabaseSync;
  constructor(
    path: string,
    private now = Date.now,
  ) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS aliases (id TEXT PRIMARY KEY, canonical TEXT NOT NULL); PRAGMA user_version=1;",
    );
    this.db.prepare("DELETE FROM cache WHERE expires <= ?").run(now());
  }
  get<T>(key: string): T | undefined {
    const row = this.db
      .prepare("SELECT value,expires FROM cache WHERE key=?")
      .get(key);
    if (!row) return;
    if (Number(row.expires) <= this.now()) {
      this.db.prepare("DELETE FROM cache WHERE key=?").run(key);
      return;
    }
    return JSON.parse(String(row.value)) as T;
  }
  set(key: string, value: unknown, ttlMs: number) {
    this.db.prepare("DELETE FROM cache WHERE expires<=?").run(this.now());
    this.db
      .prepare("INSERT OR REPLACE INTO cache VALUES(?,?,?)")
      .run(key, JSON.stringify(value), this.now() + ttlMs);
  }
  alias(id: string) {
    return this.db.prepare("SELECT canonical FROM aliases WHERE id=?").get(id)
      ?.canonical as string | undefined;
  }
  putAlias(id: string, canonical: string) {
    const existing = this.alias(id);
    if (existing && existing !== canonical)
      throw new Error("ID cruzado ambíguo no catálogo.");
    this.db
      .prepare("INSERT OR REPLACE INTO aliases VALUES(?,?)")
      .run(id, canonical);
  }
  close() {
    this.db.close();
  }
}
