export function getWebSocketCorsOrigin(): string | string[] {
  const configuredOrigins = process.env.WARLAND_ALLOWED_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configuredOrigins?.length ? configuredOrigins : '*';
}
