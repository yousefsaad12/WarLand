const raw = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3000';

/** Backend base URL (no trailing slash). Used for HTTP and both Socket.IO namespaces. */
export const SERVER_URL = raw.replace(/\/+$/, '');

export const GAMEPLAY_NAMESPACE = `${SERVER_URL}/gameplay`;
