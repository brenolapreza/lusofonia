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
  it.each(["", "addon.up.railway.app", "${{RAILWAY_PUBLIC_DOMAIN}}"])(
    "rejeita URL inválida %j sem lançar erro nativo de URL", (value) => {
      expect(httpUrl.safeParse(value).success).toBe(false);
      expect(() => readConfig({ BASE_URL: value })).toThrow(/BASE_URL/);
    },
  );

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
