import { requestJson } from './http';
import type { LeaderboardEntry } from './protocol';

export function fetchLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  return requestJson<LeaderboardEntry[]>(`/leaderboard?limit=${limit}`);
}
