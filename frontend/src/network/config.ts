const raw = __WARLAND_SERVER_URL__;

if (!raw?.trim()) {
  throw new Error(
    'SERVER_URL is required. Add it to frontend/.env before building.',
  );
}

/** Backend base URL (no trailing slash). Used for HTTP and both Socket.IO namespaces. */
export const SERVER_URL = raw.replace(/\/+$/, '');

export const GAMEPLAY_NAMESPACE = `${SERVER_URL}/gameplay`;
