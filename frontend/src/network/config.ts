const raw =
  import.meta.env.VITE_SERVER_URL ??
  'https://warland-cuc0beczf6bsajcr.uaenorth-01.azurewebsites.net';

/** Backend base URL (no trailing slash). Used for HTTP and both Socket.IO namespaces. */
export const SERVER_URL = raw.replace(/\/+$/, '');

export const GAMEPLAY_NAMESPACE = `${SERVER_URL}/gameplay`;
