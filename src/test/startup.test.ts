import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConfig } from "../config/index.js";
import { httpUrl } from "../types.js";
import { startupFailure } from "../observability/startup.js";

const exec = promisify(execFile);
const secret = "private-value-never-log";
async function failedStart(env: NodeJS.ProcessEnv) {
  try {
    await exec(process.execPath, ["--import", "tsx", "src/index.ts"], {
      env: {
        PATH: process.env.PATH,
        HOST: "127.0.0.1",
        DATABASE_URL: "file::memory:",
        LOG_LEVEL: "silent",
        TORBOX_API_KEY: secret,
        METADATA_API_KEY: secret,
        ...env,
      },
      timeout: 5000,
    });
    throw new Error("O processo deveria falhar.");
  } catch (error) {
    const result = error as { code: number; stderr: string; stdout: string };
    expect(result.code).toBe(1);
    expect(result.stdout + result.stderr).not.toContain(secret);
    return result.stderr;
  }
}

describe("diagnóstico de inicialização", () => {
  it("inicia localmente na porta 3000 sem .env e acompanha PORT personalizado", () => {
    expect(readConfig({})).toMatchObject({ PORT: 3000, HOST: "0.0.0.0", BASE_URL: "http://localhost:3000" });
    expect(readConfig({ PORT: "8080" }).BASE_URL).toBe("http://localhost:8080");
  });

  it("usa os domínios do Railway e Render quando BASE_URL está ausente", () => {
    expect(readConfig({ RAILWAY_PUBLIC_DOMAIN: "addon.up.railway.app" }).BASE_URL)
      .toBe("https://addon.up.railway.app");
    expect(readConfig({ RENDER_EXTERNAL_URL: "https://addon.onrender.com/" }).BASE_URL)
      .toBe("https://addon.onrender.com");
  });

  it("preserva URL explícita e rejeita configuração inválida mesmo na nuvem", () => {
    const cloud = { RAILWAY_PUBLIC_DOMAIN: "addon.up.railway.app" };
    expect(readConfig({ ...cloud, BASE_URL: "https://custom.example.org/" }).BASE_URL)
      .toBe("https://custom.example.org");
    expect(readConfig({ ...cloud, BASE_URL: "" }).BASE_URL).toBe("https://addon.up.railway.app");
    expect(() => readConfig({ ...cloud, BASE_URL: secret })).toThrow(/BASE_URL/);
  });

  it("erro de URL não sugere que TorBox está ativo", () => {
    try { readConfig({ BASE_URL: secret }); } catch (error) {
      const output = startupFailure(error, "configuração");
      expect(output).toContain("https://");
      expect(output).not.toContain("TorBox");
      expect(output).not.toContain(secret);
    }
  });

  it.each(["addon.up.railway.app", "${{RAILWAY_PUBLIC_DOMAIN}}"])(
    "rejeita URL inválida %j sem lançar erro nativo de URL", (value) => {
      expect(httpUrl.safeParse(value).success).toBe(false);
      expect(() => readConfig({ BASE_URL: value })).toThrow(/BASE_URL/);
    },
  );

  it("recupera a configuração com os cinco campos vazios do incidente", () => {
    expect(readConfig({
      PORT: "3000", HOST: "", BASE_URL: "", DATABASE_URL: "",
      TORBOX_ENABLED: "", TORBOX_ONLY_CACHED: "",
      RAILWAY_PUBLIC_DOMAIN: "addon.up.railway.app",
    })).toMatchObject({
      PORT: 3000, HOST: "0.0.0.0", BASE_URL: "https://addon.up.railway.app",
      DATABASE_URL: "file:./data/nuvio.sqlite", TORBOX_ENABLED: false,
      TORBOX_ONLY_CACHED: "true",
    });
  });

  it("aceita espaços e aspas de campos do painel sem alterar credenciais ou ambiente", () => {
    const env = {
      PORT: ' "3000" ', HOST: " '0.0.0.0' ", BASE_URL: ' "https://addon.example.org/" ',
      DATABASE_URL: '"file::memory:"', TORBOX_ENABLED: ' "true" ',
      TORBOX_ONLY_CACHED: " 'true' ", CATALOG_FILE: '""', SOURCES_FILE: " '' ",
      TORBOX_API_KEY: ' "private credential" ', METADATA_API_KEY: " other credential ",
    };
    expect(readConfig(env)).toMatchObject({
      PORT: 3000, HOST: "0.0.0.0", BASE_URL: "https://addon.example.org",
      DATABASE_URL: "file::memory:", TORBOX_ENABLED: true, TORBOX_ONLY_CACHED: "true",
      CATALOG_FILE: "", SOURCES_FILE: "", TORBOX_API_KEY: env.TORBOX_API_KEY,
      METADATA_API_KEY: env.METADATA_API_KEY,
    });
    expect(env.PORT).toBe(' "3000" ');
  });

  it("usa padrões para espaços/aspas vazias e preserva a detecção do domínio", () => {
    expect(readConfig({ PORT: " ", HOST: '""', BASE_URL: " '' ",
      DATABASE_URL: "\n", TORBOX_ENABLED: '""', TORBOX_ONLY_CACHED: '""',
      RAILWAY_PUBLIC_DOMAIN: ' "addon.up.railway.app" ', LOG_LEVEL: " "
    })).toMatchObject({ PORT: 3000, HOST: "0.0.0.0", BASE_URL: "https://addon.up.railway.app",
      TORBOX_ENABLED: false, TORBOX_ONLY_CACHED: "true", LOG_LEVEL: "info" });
  });

  it("continua rejeitando valores inválidos não vazios e TorBox sem chave", () => {
    for (const env of [
      { PORT: '"abc"' }, { BASE_URL: '"sem-protocolo"' },
      { DATABASE_URL: '"postgres://example.org/db"' },
      { TORBOX_ENABLED: '"yes"' }, { TORBOX_ONLY_CACHED: '"false"' },
      { TORBOX_ENABLED: '"true"', TORBOX_API_KEY: "" },
    ]) expect(() => readConfig(env)).toThrow();
  });

  it("informa nomes das variáveis inválidas sem imprimir valores", async () => {
    const output = await failedStart({ BASE_URL: secret, PORT: secret });
    expect(output).toContain("configuração");
    expect(output).toContain("BASE_URL");
    expect(output).toContain("PORT");
  });

  it("identifica chave ausente quando TorBox está ativo", () => {
    expect(() => readConfig({ TORBOX_ENABLED: "true", TORBOX_API_KEY: "  " }))
      .toThrow(/TORBOX_API_KEY/);
  });

  it("identifica o arquivo ausente sem expor o caminho", async () => {
    const directory = mkdtempSync(join(tmpdir(), "nuvio-startup-"));
    try {
      for (const field of ["CATALOG_FILE", "SOURCES_FILE"]) {
        const output = await failedStart({ [field]: join(directory, secret) });
        expect(output).toContain(field);
        expect(output).toContain("ENOENT");
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("identifica JSON inválido sem expor seu conteúdo", async () => {
    const directory = mkdtempSync(join(tmpdir(), "nuvio-startup-"));
    try {
      const file = join(directory, "catalog.json");
      writeFileSync(file, secret);
      expect(await failedStart({ CATALOG_FILE: file })).toContain("CATALOG_FILE");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("identifica banco inacessível", async () => {
    const directory = mkdtempSync(join(tmpdir(), "nuvio-startup-"));
    try {
      expect(await failedStart({ DATABASE_URL: `file:${directory}` })).toContain("DATABASE_URL");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("identifica porta ocupada e encerra o processo", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Endereço inválido");
      const output = await failedStart({ PORT: String(address.port) });
      expect(output).toContain("escuta HTTP");
      expect(output).toContain("EADDRINUSE");
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });

  it("não imprime mensagens nem códigos arbitrários de exceções", () => {
    const output = startupFailure(Object.assign(new Error(secret), { code: secret }), "aplicação");
    expect(output).not.toContain(secret);
  });
});
