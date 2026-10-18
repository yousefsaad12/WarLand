import { Injectable } from '@nestjs/common';

@Injectable()
export class ActivePlayers {
  private readonly activePlayers: Map<string, string> = new Map<
    string,
    string
  >();

  public addPlayer(playerId: string, matchId: string): void {
    this.activePlayers.set(playerId, matchId);
  }

  public removePlayer(playerId: string): void {
    this.activePlayers.delete(playerId);
  }

  public isActive(playerId: string): boolean {
    return this.activePlayers.has(playerId);
  }
  public getMatchId(playerId: string): string | undefined {
    return this.activePlayers.get(playerId);
  }
}
