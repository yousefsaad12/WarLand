import { requestJson } from './http';
import type { AuthResponse, PlayerProfile } from './protocol';

export interface RegisterInput {
  username: string;
  displayName: string;
  password: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

export function register(input: RegisterInput): Promise<AuthResponse> {
  return requestJson<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function login(input: LoginInput): Promise<AuthResponse> {
  return requestJson<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchMe(token: string): Promise<AuthResponse['player']> {
  return requestJson<AuthResponse['player']>('/auth/me', { token });
}

export function fetchProfile(token: string): Promise<PlayerProfile> {
  return requestJson<PlayerProfile>('/players/me', { token });
}
