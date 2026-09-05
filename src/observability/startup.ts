const hints = {
  DATABASE_URL: "Não foi possível abrir o SQLite. Confira DATABASE_URL e a permissão de escrita no diretório.",
  CATALOG_FILE: "Não foi possível carregar o catálogo. Confira CATALOG_FILE: o arquivo deve existir no servidor e conter um catálogo JSON válido.",
  SOURCES_FILE: "Não foi possível carregar as fontes. Confira SOURCES_FILE: o arquivo deve existir no servidor e conter fontes JSON válidas.",
  CATALOG_INIT: "Não foi possível preparar o catálogo. Confira IDs duplicados/ambíguos e a escrita no SQLite.",
} as const;

export class StartupError extends Error {
  constructor(readonly area: keyof typeof hints, cause: unknown) {
    super(hints[area], { cause });
  }
}

export class ConfigurationError extends Error {
  constructor(readonly fields: string[]) {
    const hints = [
      fields.includes("BASE_URL")
        ? "BASE_URL deve ser uma URL completa com http:// ou https://. Não deixe vazia. No Railway/Render, remova a variável para usar o domínio automático."
        : "",
      fields.some((field) => field.startsWith("TORBOX_"))
        ? "TORBOX_ENABLED aceita true ou false. TorBox ativo exige TORBOX_API_KEY; TORBOX_ONLY_CACHED deve ser true."
        : "",
    ].filter(Boolean);
    super(`Configuração inválida. Confira: ${fields.join(", ")}.${hints.length ? ` ${hints.join(" ")}` : ""}`);
  }
}

const systemHints = {
  EADDRINUSE: "A porta já está em uso. Encerre a instância duplicada ou ajuste PORT.",
  EADDRNOTAVAIL: "HOST não está disponível neste servidor. Use HOST=0.0.0.0.",
  ENOTFOUND: "Não foi possível resolver HOST. Use HOST=0.0.0.0.",
  EACCES: "Permissão negada ao acessar um arquivo, diretório ou porta.",
  EPERM: "Operação não permitida pelo sistema.",
  ENOENT: "Arquivo ou diretório não encontrado no servidor.",
  ENOTDIR: "Um componente do caminho não é um diretório.",
  EISDIR: "O caminho aponta para um diretório em vez de um arquivo.",
  EROFS: "O sistema de arquivos está em modo somente leitura.",
  ENOSPC: "Não há espaço disponível no disco.",
  ERR_SQLITE_ERROR: "O SQLite recusou a operação; confira o arquivo do banco e suas permissões.",
} as const;

export function startupFailure(error: unknown, stage: "configuração" | "aplicação" | "escuta HTTP") {
  const cause = error instanceof StartupError ? error.cause : error;
  const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
  const system = typeof code === "string" && Object.hasOwn(systemHints, code)
    ? `${code}: ${systemHints[code as keyof typeof systemHints]}`
    : "";
  // Only our controlled messages and allowlisted codes may reach startup logs.
  // Native errors, Zod issues and file contents can contain private values.
  const detail = error instanceof ConfigurationError || error instanceof StartupError
    ? error.message
    : system ? "" : "Verifique a configuração e a versão do Node (22.13 ou superior).";
  return `Falha ao iniciar (${stage}). ${[detail, system].filter(Boolean).join(" ")}\n`;
}
