export const WARLAND_FRONTEND_ORIGIN = 'https://war-land.vercel.app';

export function getWebSocketCorsOrigin(): string | string[] {
  return WARLAND_FRONTEND_ORIGIN;
}
