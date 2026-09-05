import { z } from "zod";
import { httpUrl } from "../types.js";
import { ConfigurationError } from "../observability/startup.js";
const boolean = (fallback: string) =>
  z
    .enum(["true", "false"])
    .default(fallback as "true" | "false")
    .transform((v) => v === "true");
const portSchema = z.coerce.number().int().min(1).max(65535).default(3000);
const schema = z
  .object({
    PORT: portSchema,
    HOST: z.string().min(1).default("0.0.0.0"),
    BASE_URL: httpUrl.transform((url) => url.replace(/\/+$/, "")),
    DATABASE_URL: z
      .string()
      .startsWith("file:")
      .min(6)
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
  .refine((c) => !c.TORBOX_ENABLED || c.TORBOX_API_KEY.trim().length > 0, {
    path: ["TORBOX_API_KEY"],
  });
export type Config = z.infer<typeof schema>;
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = portSchema.safeParse(env.PORT);
  const baseUrl = env.BASE_URL ?? (
    env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` :
    env.RENDER_EXTERNAL_URL || `http://localhost:${port.success ? port.data : 3000}`
  );
  const result = schema.safeParse({ ...env, BASE_URL: baseUrl });
  if (!result.success)
    throw new ConfigurationError([...new Set(result.error.issues.map((issue) => String(issue.path[0])))]);
  return result.data;
}
