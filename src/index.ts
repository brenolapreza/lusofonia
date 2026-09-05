import { readConfig } from "./config/index.js";
import { buildApp } from "./addon/app.js";
import { startupFailure } from "./observability/startup.js";
let stage: "configuração" | "aplicação" | "escuta HTTP" = "configuração";
let app: ReturnType<typeof buildApp> | undefined;
try {
  const config = readConfig();
  stage = "aplicação";
  app = buildApp(config);
  stage = "escuta HTTP";
  await app.listen({ port: config.PORT, host: config.HOST });
  for (const signal of ["SIGTERM", "SIGINT"])
    process.once(signal, () => {
      void app?.close();
    });
} catch (error) {
  process.stderr.write(startupFailure(error, stage));
  await app?.close().catch(() => {});
  process.exitCode = 1;
}
