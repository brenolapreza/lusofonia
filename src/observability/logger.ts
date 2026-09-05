import pino, { type DestinationStream } from "pino";
export function makeLogger(level: string, destination?: DestinationStream) {
  return pino(
    {
      level,
      redact: {
        paths: [
          "key",
          "token",
          "authorization",
          "TORBOX_API_KEY",
          "METADATA_API_KEY",
          "SOURCES_JSON",
          "req.headers.authorization",
          "req.url",
          "url",
          "err",
        ],
        censor: "[REDACTED]",
      },
    },
    destination,
  );
}
