import { readConfig } from "./config/index.js";
import { buildApp } from "./addon/app.js";
try {
  const config = readConfig();
  const app = buildApp(config);
  await app.listen({ port: config.PORT, host: config.HOST });
  for (const signal of ["SIGTERM", "SIGINT"])
    process.once(signal, () => {
      void app.close();
    });
} catch {
  process.stderr.write(
    "Falha ao iniciar. Verifique a configuração, os arquivos locais e a porta.\n",
  );
  process.exitCode = 1;
}
