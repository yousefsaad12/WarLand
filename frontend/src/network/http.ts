import { SERVER_URL } from './config';

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

type Json = Record<string, unknown> | unknown[] | null;

async function parse(response: Response): Promise<Json> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as Json;
  } catch {
    return null;
  }
}

function extractMessage(payload: Json): string {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const message = (payload as Record<string, unknown>).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && message.every((m) => typeof m === 'string')) {
      return message.join('; ');
    }
  }
  return 'Request failed';
}

export async function requestJson<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  let response: Response;

  try {
    response = await fetch(`${SERVER_URL}${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch (error) {
    throw new ApiError(
      0,
      error instanceof Error
        ? `Could not reach the server: ${error.message}`
        : 'Could not reach the server',
      null,
    );
  }

  const payload = await parse(response);

  if (!response.ok) {
    throw new ApiError(response.status, extractMessage(payload), payload);
  }

  return payload as T;
}
