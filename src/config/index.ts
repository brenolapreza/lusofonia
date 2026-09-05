import { z } from "zod";
import { httpUrl } from "../types.js";
const boolean = (fallback: string) =>
  z
    .enum(["true", "false"])
    .default(fallback as "true" | "false")
    .transform((v) => v === "true");
const schema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(7000),
    HOST: z.string().default("127.0.0.1"),
    BASE_URL: httpUrl.default("http://localhost:7000"),
    DATABASE_URL: z
      .string()
      .startsWith("file:")
      .default("file:./data/nuvio.sqlite"),
    TORBOX_API_KEY: z.string().default(""),
    TORBOX_ENABLED: boolean("false"),
    TORBOX_ONLY_CACHED: z.literal("true").default("true"),
    METADATA_PROVIDER: z.enum(["", "local"]).default("local"),
    METADATA_API_KEY: z.string().default(""),
    CATALOG_FILE: z.string().default(""),
    SOURCES_FILE: z.string().default(""),
    LOG_LEVEL: z
      .enum(["silent", "fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
  })
  .refine((c) => !c.TORBOX_ENABLED || c.TORBOX_API_KEY.length > 0);
export type Config = z.infer<typeof schema>;
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = schema.safeParse(env);
  if (!result.success)
    throw new Error(
      "Configuração inválida. Confira .env.example; TorBox exige uma chave e ONLY_CACHED=true.",
    );
  return result.data;
}
